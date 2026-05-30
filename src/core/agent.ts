import type { Agent, Message, LLMResponse } from './types';
import { LLMAdapter } from './llm-adapter';
import { Memory } from './memory';
import type { EmbeddingService } from './embedding';
import type { SkillEngine } from './skill-engine';
import type { MCPClient } from './mcp-client';

export class AgentBrain {
  private agent: Agent;
  private llm: LLMAdapter;
  private memory: Memory;
  private embeddingService: EmbeddingService;
  private skillEngine: SkillEngine;
  private mcpClient: MCPClient;

  constructor(
    agent: Agent,
    llmAdapter: LLMAdapter,
    embeddingService: EmbeddingService,
    skillEngine: SkillEngine,
    mcpClient: MCPClient
  ) {
    this.agent = agent;
    this.llm = llmAdapter;
    this.embeddingService = embeddingService;
    this.skillEngine = skillEngine;
    this.mcpClient = mcpClient;
    this.memory = new Memory(agent.id, '', '', { maxMessages: 100 });
  }

  getInfo(): Agent {
    return { ...this.agent };
  }

  async processMessage(userId: string, message: string, channel: string): Promise<string> {
    // Step 1: Add user message to memory
    this.memory.addMessage({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Step 2: Parallel retrieval - memory context, skills, and tools
    const [memoryContext, recommendedTools] = await Promise.all([
      this.retrieveMemoryContext(message),
      this.retrieveRecommendedTools(message),
    ]);

    // Step 3: Build enhanced prompt
    const enhancedPrompt = await this.buildEnhancedPrompt(
      memoryContext,
      recommendedTools,
      channel
    );

    // Step 4: Get messages for LLM (memory context)
    const messages = this.memory.getContext();

    // Step 5: Get response from LLM with enhanced system prompt
    const response = await this.llm.chat(messages, {
      temperature: this.agent.temperature,
      maxTokens: this.agent.maxTokens,
      systemPrompt: enhancedPrompt,
    });

    // Step 6: Add assistant response to memory
    this.memory.addMessage({
      role: 'assistant',
      content: response.content,
      timestamp: new Date(),
    });

    // Step 7: Memory check - compact if threshold exceeded
    if (this.memory.shouldCompact()) {
      await this.memory.compact(this.llm, this.agent.systemPrompt);
    }

    return response.content;
  }

  /**
   * Build enhanced prompt with memory context and recommended tools
   */
  private async buildEnhancedPrompt(
    memoryContext: string,
    recommendedTools: string,
    channel: string
  ): Promise<string> {
    const parts: string[] = [];

    // Add system prompt
    parts.push(this.agent.systemPrompt);

    // Add memory context if available
    if (memoryContext) {
      parts.push(`\n\n[记忆上下文]\n${memoryContext}`);
    }

    // Add recommended tools if available
    if (recommendedTools) {
      parts.push(`\n\n[推荐工具]\n${recommendedTools}`);
    }

    // Add channel context
    parts.push(`\n\n[当前渠道] ${channel}`);

    return parts.join('');
  }

  /**
   * Retrieve memory context using semantic search (top 10)
   */
  private async retrieveMemoryContext(message: string): Promise<string> {
    const messages = this.memory.getMessages();
    if (messages.length === 0) {
      return '';
    }

    // Get query embedding
    const queryEmbedding = await this.embeddingService.embed(message);

    // Score all messages by cosine similarity
    const scored = messages.map((msg, index) => {
      let content = msg.content;
      if (msg.metadata?.isSummary) {
        content = `[Summary]: ${content}`;
      }
      return { index, content, role: msg.role, timestamp: msg.timestamp };
    });

    // Use last N messages as potential candidates (avoid computing embedding for too many)
    const candidates = scored.slice(-50); // Last 50 messages as candidates
    const texts = candidates.map(c => c.content);

    if (texts.length === 0) {
      return '';
    }

    try {
      const embeddings = await this.embeddingService.embedBatch(texts);

      const withScores = candidates.map((c, i) => ({
        ...c,
        score: this.embeddingService.cosineSimilarity(queryEmbedding, embeddings[i]),
      }));

      // Sort by score and take top 10
      withScores.sort((a, b) => b.score - a.score);
      const topMessages = withScores.slice(0, 10);

      // Format as context
      return topMessages
        .map(m => `[${m.role}] ${m.content}`)
        .join('\n\n');
    } catch {
      // If embedding fails, return recent messages as fallback
      return messages.slice(-10).map(m => `[${m.role}] ${m.content}`).join('\n\n');
    }
  }

  /**
   * Retrieve recommended tools from SkillEngine and MCPClient (top 3 each)
   */
  private async retrieveRecommendedTools(message: string): Promise<string> {
    const parts: string[] = [];

    // Get top skills from SkillEngine
    try {
      const topSkills = await this.skillEngine.retrieveTopSkills(
        message,
        this.embeddingService,
        3
      );

      if (topSkills.length > 0) {
        parts.push('[Skills]');
        for (const { skill, score } of topSkills) {
          parts.push(`- ${skill.name}: ${skill.description} (relevance: ${(score * 100).toFixed(0)}%)`);
        }
      }
    } catch {
      // SkillEngine retrieval failed, continue
    }

    // Get top tools from MCPClient
    try {
      const topTools = await this.mcpClient.retrieveTopTools(
        message,
        this.embeddingService,
        3
      );

      if (topTools.length > 0) {
        parts.push('[MCP Tools]');
        for (const { tool, score } of topTools) {
          parts.push(`- ${tool.name}: ${tool.description} (relevance: ${(score * 100).toFixed(0)}%)`);
        }
      }
    } catch {
      // MCPClient retrieval failed, continue
    }

    return parts.join('\n');
  }

  setUserId(userId: string): void {
    // Update userId in memory (recreate memory with correct userId)
    const currentMemory = this.memory.getMemory();
    this.memory = new Memory(this.agent.id, userId, currentMemory.channel, { maxMessages: 100 });
    // Restore messages
    for (const msg of currentMemory.messages) {
      this.memory.addMessage(msg);
    }
  }
}
import type { Agent, Message, LLMResponse, ToolCall, ToolExecutionResult, ExecutionState } from './types';
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
  private maxIterations: number = 10;

  constructor(
    agent: Agent,
    llmAdapter: LLMAdapter,
    embeddingService: EmbeddingService,
    skillEngine: SkillEngine,
    mcpClient: MCPClient,
    options?: {
      maxIterations?: number;
    }
  ) {
    this.agent = agent;
    this.llm = llmAdapter;
    this.embeddingService = embeddingService;
    this.skillEngine = skillEngine;
    this.mcpClient = mcpClient;
    this.memory = new Memory(agent.id, '', '', { maxMessages: 100 });
    this.maxIterations = options?.maxIterations || 10;
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

    // Step 2: Build messages for LLM
    const messages = this.memory.getContext();

    // Step 3: Get response - now with tool execution loop
    const executionState = await this.executeToolLoop(messages);

    // Step 4: Add assistant response to memory
    this.memory.addMessage({
      role: 'assistant',
      content: executionState.finalResponse,
      timestamp: new Date(),
    });

    // Step 5: Check compaction
    if (this.memory.shouldCompact()) {
      await this.memory.compact(this.llm, this.agent.systemPrompt);
    }

    return executionState.finalResponse;
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

  private async executeToolLoop(messages: Message[]): Promise<ExecutionState> {
    const state: ExecutionState = {
      iteration: 0,
      maxIterations: this.maxIterations,
      toolCalls: [],
      results: [],
      finalResponse: '',
    };

    while (state.iteration < state.maxIterations) {
      state.iteration++;

      const response = await this.llm.chat(messages, {
        temperature: this.agent.temperature,
        maxTokens: this.agent.maxTokens,
        systemPrompt: this.agent.systemPrompt,
      });

      const toolCalls = this.parseToolCalls(response.content);

      if (toolCalls.length === 0) {
        state.finalResponse = response.content;
        break;
      }

      for (const toolCall of toolCalls) {
        const result = await this.executeTool(toolCall);
        state.results.push(result);
        state.toolCalls.push(toolCall);

        messages.push({
          role: 'tool',
          content: result.content || result.error || '',
          timestamp: new Date(),
          metadata: { toolCallId: toolCall.id, toolName: toolCall.name },
        });
      }
    }

    return state;
  }

  private parseToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Parse Anthropic-style tool_use blocks
    const toolUseRegex = /<tool_use>\s*<tool_name>([^<]+)<\/tool_name>\s*<tool_input>([\s\S]*?)<\/tool_input>\s*<\/tool_use>/g;

    let match;
    while ((match = toolUseRegex.exec(content)) !== null) {
      const toolName = match[1].trim();
      let toolArgs = {};
      try {
        toolArgs = JSON.parse(match[2].trim());
      } catch {
        toolArgs = { raw: match[2].trim() };
      }

      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: toolName,
        arguments: toolArgs,
      });
    }

    return toolCalls;
  }

  private async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Try SkillEngine first
      const skillResult = await this.skillEngine.executeSkill(toolCall.name, {
        agentId: this.agent.id,
        userId: '',
        channel: '',
        message: '',
        metadata: toolCall.arguments,
      });

      return {
        toolCallId: toolCall.id,
        success: skillResult.success,
        content: skillResult.content,
        error: skillResult.error,
        duration: Date.now() - startTime,
      };
    } catch (e) {
      return {
        toolCallId: toolCall.id,
        success: false,
        error: e instanceof Error ? e.message : String(e),
        duration: Date.now() - startTime,
      };
    }
  }
}
import type { Agent, Message, LLMResponse } from './types';
import { LLMAdapter } from './llm-adapter';
import { Memory } from './memory';

export class AgentBrain {
  private agent: Agent;
  private llm: LLMAdapter;
  private memory: Memory;

  constructor(agent: Agent, llmAdapter: LLMAdapter) {
    this.agent = agent;
    this.llm = llmAdapter;
    this.memory = new Memory(agent.id, '', '', { maxMessages: 100 });
  }

  getInfo(): Agent {
    return { ...this.agent };
  }

  async processMessage(userId: string, message: string, channel: string): Promise<string> {
    // Add user message to memory
    this.memory.addMessage({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Build messages for LLM
    const messages = this.memory.getContext();

    // Get response from LLM
    const response = await this.llm.chat(messages, {
      temperature: this.agent.temperature,
      maxTokens: this.agent.maxTokens,
      systemPrompt: this.agent.systemPrompt,
    });

    // Add assistant response to memory
    this.memory.addMessage({
      role: 'assistant',
      content: response.content,
      timestamp: new Date(),
    });

    return response.content;
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
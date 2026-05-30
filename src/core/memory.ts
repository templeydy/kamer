import type { ConversationMemory, Message } from './types';
import type { LLMAdapter } from './llm-adapter';

export interface MemoryOptions {
  maxMessages?: number;
  summaryThreshold?: number;
  retainMessagesAfterCompact?: number;
}

export class Memory {
  private memory: ConversationMemory;
  private options: Required<MemoryOptions>;

  constructor(agentId: string, userId: string, channel: string, options: MemoryOptions = {}) {
    this.options = {
      maxMessages: options.maxMessages ?? 10000,
      summaryThreshold: options.summaryThreshold ?? 10000,
      retainMessagesAfterCompact: options.retainMessagesAfterCompact ?? 100,
    };
    this.memory = {
      agentId,
      userId,
      channel,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  addMessage(message: Message): void {
    this.memory.messages.push(message);
    this.memory.updatedAt = new Date();

    if (this.options.maxMessages && this.memory.messages.length > this.options.maxMessages) {
      this.memory.messages = this.memory.messages.slice(-this.options.maxMessages);
    }
  }

  getMessages(): Message[] {
    return [...this.memory.messages];
  }

  clear(): void {
    this.memory.messages = [];
    this.memory.updatedAt = new Date();
  }

  getMemory(): ConversationMemory {
    return { ...this.memory };
  }

  getContext(): Message[] {
    return this.getMessages();
  }

  getMessageCount(): number {
    return this.memory.messages.length;
  }

  shouldCompact(): boolean {
    return this.memory.messages.length >= this.options.summaryThreshold;
  }

  getEarlyMessages(count: number): Message[] {
    return this.memory.messages.slice(0, count);
  }

  async compact(llm: LLMAdapter, systemPrompt: string): Promise<string> {
    const retainedCount = this.options.retainMessagesAfterCompact;
    const messagesToSummarize = this.memory.messages.slice(0, this.memory.messages.length - retainedCount);

    if (messagesToSummarize.length === 0) {
      return '';
    }

    const summarizePrompt = `${systemPrompt}\n\nPlease summarize the following conversation into a concise summary that preserves key information, decisions, and context:\n\n${messagesToSummarize.map(m => `${m.role}: ${m.content}`).join('\n\n')}`;

    const response = await llm.chat(
      [{ role: 'user', content: summarizePrompt, timestamp: new Date() }],
      { systemPrompt: 'You are a helpful assistant that summarizes conversations accurately and concisely.' }
    );

    const summary = response.content;

    // Replace early messages with a summary system message
    const summaryMessage: Message = {
      role: 'system',
      content: `[Earlier conversation summary]: ${summary}`,
      timestamp: new Date(),
      metadata: { isSummary: true, messagesSummarized: messagesToSummarize.length },
    };

    this.memory.messages = [summaryMessage, ...this.memory.messages.slice(-retainedCount)];
    this.memory.updatedAt = new Date();

    return summary;
  }
}
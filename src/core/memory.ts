import type { ConversationMemory, Message } from './types';

export interface MemoryOptions {
  maxMessages?: number;
}

export class Memory {
  private memory: ConversationMemory;
  private options: MemoryOptions;

  constructor(agentId: string, userId: string, channel: string, options: MemoryOptions = {}) {
    this.options = options;
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
}
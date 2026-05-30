import type { Message, ConversationMemory, StructuredSummary } from './types';
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
    const earlyMessages = this.getEarlyMessages(this.memory.messages.length);
    if (earlyMessages.length === 0) {
      return '';
    }

    const conversationText = earlyMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const structuredPrompt = `${systemPrompt}

Please analyze the following conversation and produce a STRUCTURED SUMMARY in JSON format with these fields:
- topics: Array of key topics discussed (max 10)
- decisions: Array of key decisions made (max 10)
- pendingTasks: Array of tasks mentioned but not completed (max 10)
- keyFacts: Array of important facts established (max 10)
- userPreferences: Array of user preferences noted (max 10)
- contextWindows: Array of important code snippets or data to remember (max 5)

CONVERSATION:
${conversationText}

Respond ONLY with valid JSON matching this schema.`;

    const response = await llm.chat(
      [{ role: 'user', content: structuredPrompt, timestamp: new Date() }],
      { temperature: 0.5, maxTokens: 2048 }
    );

    let summary: StructuredSummary;
    try {
      summary = JSON.parse(response.content);
    } catch {
      // Fallback to simple summarization
      summary = {
        version: '1.0',
        generatedAt: new Date(),
        messageCount: earlyMessages.length,
        topics: [response.content.slice(0, 500)],
        decisions: [],
        pendingTasks: [],
        keyFacts: [],
        userPreferences: [],
        contextWindows: [],
      };
    }

    // Ensure required fields
    summary.version = '1.0';
    summary.generatedAt = new Date();
    summary.messageCount = earlyMessages.length;

    // Keep only recent messages plus summary
    const recentMessages = this.memory.messages.slice(-(this.options.retainMessagesAfterCompact || 100));
    this.memory.messages = [
      {
        role: 'system',
        content: `【对话摘要】\n${this.formatSummaryAsContext(summary)}`,
        timestamp: new Date(),
        metadata: { isSummary: true, summaryVersion: '1.0' },
      },
      ...recentMessages,
    ];

    this.memory.updatedAt = new Date();
    return response.content;
  }

  private formatSummaryAsContext(summary: StructuredSummary): string {
    const parts: string[] = [];

    if (summary.topics.length > 0) {
      parts.push(`Topics: ${summary.topics.join(', ')}`);
    }
    if (summary.decisions.length > 0) {
      parts.push(`Decisions: ${summary.decisions.join('; ')}`);
    }
    if (summary.pendingTasks.length > 0) {
      parts.push(`Pending tasks: ${summary.pendingTasks.join(', ')}`);
    }
    if (summary.keyFacts.length > 0) {
      parts.push(`Key facts: ${summary.keyFacts.join('; ')}`);
    }
    if (summary.userPreferences.length > 0) {
      parts.push(`User preferences: ${summary.userPreferences.join('; ')}`);
    }
    if (summary.contextWindows.length > 0) {
      parts.push(`Remembered context:\n${summary.contextWindows.join('\n\n')}`);
    }

    return parts.join('\n');
  }
}
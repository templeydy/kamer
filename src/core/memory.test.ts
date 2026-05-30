import { describe, it, expect, vi } from 'vitest';
import { Memory } from './memory';
import type { Message } from './types';

describe('Memory', () => {
  it('should create a new memory instance', () => {
    const memory = new Memory('agent1', 'user1', 'terminal');
    expect(memory).toBeDefined();
  });

  it('should add messages to memory', () => {
    const memory = new Memory('agent1', 'user1', 'terminal');
    const msg: Message = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };
    memory.addMessage(msg);
    const messages = memory.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Hello');
  });

  it('should clear memory', () => {
    const memory = new Memory('agent1', 'user1', 'terminal');
    memory.addMessage({ role: 'user', content: 'Hello', timestamp: new Date() });
    memory.clear();
    expect(memory.getMessages().length).toBe(0);
  });

  it('should limit memory to max messages', () => {
    const memory = new Memory('agent1', 'user1', 'terminal', { maxMessages: 3 });
    for (let i = 0; i < 5; i++) {
      memory.addMessage({ role: 'user', content: `Hello ${i}`, timestamp: new Date() });
    }
    expect(memory.getMessages().length).toBe(3);
  });

  it('should get message count', () => {
    const memory = new Memory('agent1', 'user1', 'terminal');
    expect(memory.getMessageCount()).toBe(0);
    memory.addMessage({ role: 'user', content: 'Hello', timestamp: new Date() });
    expect(memory.getMessageCount()).toBe(1);
  });

  it('should check if should compact - threshold not reached', () => {
    const memory = new Memory('agent1', 'user1', 'terminal', { summaryThreshold: 10 });
    expect(memory.shouldCompact()).toBe(false);
    for (let i = 0; i < 5; i++) {
      memory.addMessage({ role: 'user', content: `Hello ${i}`, timestamp: new Date() });
    }
    expect(memory.shouldCompact()).toBe(false);
  });

  it('should check if should compact - threshold reached', () => {
    const memory = new Memory('agent1', 'user1', 'terminal', { summaryThreshold: 5 });
    for (let i = 0; i < 5; i++) {
      memory.addMessage({ role: 'user', content: `Hello ${i}`, timestamp: new Date() });
    }
    expect(memory.shouldCompact()).toBe(true);
  });

  it('should get early messages', () => {
    const memory = new Memory('agent1', 'user1', 'terminal', { retainMessagesAfterCompact: 2 });
    for (let i = 0; i < 5; i++) {
      memory.addMessage({ role: 'user', content: `Hello ${i}`, timestamp: new Date() });
    }
    const earlyMessages = memory.getEarlyMessages(3);
    expect(earlyMessages.length).toBe(3);
    expect(earlyMessages[0].content).toBe('Hello 0');
  });

  it('should compact memory with LLM adapter', async () => {
    const memory = new Memory('agent1', 'user1', 'terminal', {
      summaryThreshold: 100,
      retainMessagesAfterCompact: 2,
    });

    for (let i = 0; i < 5; i++) {
      memory.addMessage({ role: 'user', content: `Hello ${i}`, timestamp: new Date() });
    }

    const mockLLMAdapter = {
      chat: vi.fn().mockResolvedValue({ content: 'Summary of conversation' }),
    };

    const summary = await memory.compact(mockLLMAdapter as any, 'Summarize the conversation.');

    expect(summary).toBe('Summary of conversation');
    expect(mockLLMAdapter.chat).toHaveBeenCalled();
    expect(memory.getMessages().length).toBeLessThanOrEqual(3); // summary + retained
  });
});
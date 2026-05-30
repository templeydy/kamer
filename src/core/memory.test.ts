import { describe, it, expect } from 'vitest';
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
});
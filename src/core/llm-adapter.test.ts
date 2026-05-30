import { describe, it, expect, vi } from 'vitest';
import { LLMAdapter } from './llm-adapter';

describe('LLMAdapter', () => {
  it('should create adapter with claude model', () => {
    const adapter = new LLMAdapter({ model: 'claude' });
    expect(adapter).toBeDefined();
  });

  it('should create adapter with openai model', () => {
    const adapter = new LLMAdapter({ model: 'openai' });
    expect(adapter).toBeDefined();
  });
});
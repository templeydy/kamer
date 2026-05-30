import { describe, it, expect, vi } from 'vitest';
import { AgentBrain } from './agent';
import type { Agent } from './types';

describe('AgentBrain', () => {
  const mockAgent: Agent = {
    id: 'test-agent',
    name: 'Test Agent',
    description: 'A test agent',
    model: 'claude',
    systemPrompt: 'You are a helpful assistant.',
    skills: [],
    mcpServers: [],
    temperature: 0.7,
    maxTokens: 4096,
  };

  it('should create agent brain instance', () => {
    const brain = new AgentBrain(mockAgent, vi.fn());
    expect(brain).toBeDefined();
  });

  it('should get agent info', () => {
    const brain = new AgentBrain(mockAgent, vi.fn());
    const info = brain.getInfo();
    expect(info.id).toBe('test-agent');
    expect(info.name).toBe('Test Agent');
  });
});
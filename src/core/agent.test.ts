import { describe, it, expect, vi } from 'vitest';
import { AgentBrain } from './agent';
import type { Agent } from './types';
import type { EmbeddingService } from './embedding';
import type { SkillEngine } from './skill-engine';
import type { MCPClient } from './mcp-client';

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

  const mockEmbeddingService: EmbeddingService = {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    cosineSimilarity: vi.fn().mockReturnValue(0.5),
  } as unknown as EmbeddingService;

  const mockSkillEngine: SkillEngine = {
    retrieveTopSkills: vi.fn().mockResolvedValue([]),
  } as unknown as SkillEngine;

  const mockMCPClient: MCPClient = {
    retrieveTopTools: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;

  it('should create agent brain instance', () => {
    const brain = new AgentBrain(
      mockAgent,
      vi.fn(),
      mockEmbeddingService,
      mockSkillEngine,
      mockMCPClient
    );
    expect(brain).toBeDefined();
  });

  it('should get agent info', () => {
    const brain = new AgentBrain(
      mockAgent,
      vi.fn(),
      mockEmbeddingService,
      mockSkillEngine,
      mockMCPClient
    );
    const info = brain.getInfo();
    expect(info.id).toBe('test-agent');
    expect(info.name).toBe('Test Agent');
  });
});
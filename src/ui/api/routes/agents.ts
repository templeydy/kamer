import { Hono } from 'hono';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import type { Runtime } from '../../../core/runtime';
import type { Agent } from '../../../core/types';
import yaml from 'yaml';

export function createAgentsRouter(runtime: Runtime): Hono {
  const router = new Hono();
  const agentsDir = join(process.cwd(), 'agents');

  // List all agents
  router.get('/', (c) => {
    const agents = runtime.listAgents();
    // Strip API keys from listing for security
    const sanitized = agents.map(({ apiKey, ...rest }) => rest);
    return c.json(sanitized);
  });

  // Get single agent
  router.get('/:id', (c) => {
    const id = c.req.param('id');
    const agent = runtime.getAgent(id)?.getInfo();
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json(agent);
  });

  // Create new agent
  router.post('/', async (c) => {
    const agent: Agent = await c.req.json();
    if (!agent.id || !agent.name || !agent.model) {
      return c.json({ error: 'Missing required fields: id, name, model' }, 400);
    }
    const configPath = join(agentsDir, `${agent.id}.yaml`);
    if (existsSync(configPath)) {
      return c.json({ error: 'Agent already exists' }, 400);
    }
    const yamlContent = yaml.stringify({
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
      model: agent.model,
      apiKey: agent.apiKey || '',
      baseUrl: agent.baseUrl || '',
      systemPrompt: agent.systemPrompt || 'You are a helpful assistant.',
      skills: agent.skills || [],
      mcpServers: agent.mcpServers || [],
      channels: agent.channels || ['terminal'],
      llm: {
        temperature: agent.temperature || 0.7,
        maxTokens: agent.maxTokens || 4096,
      },
    });
    writeFileSync(configPath, yamlContent);
    try {
      await runtime.loadAgent(configPath);
      const created = runtime.getAgent(agent.id)?.getInfo();
      if (created) {
        const { apiKey, ...safe } = created;
        return c.json({ success: true, agent: safe });
      }
      return c.json({ success: true, agent: runtime.getAgent(agent.id)?.getInfo() });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Update agent
  router.put('/:id', async (c) => {
    const id = c.req.param('id');
    const agent: Agent = await c.req.json();
    const configPath = join(agentsDir, `${id}.yaml`);
    if (!existsSync(configPath)) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    const yamlContent = yaml.stringify({
      id: id,
      name: agent.name,
      description: agent.description || '',
      model: agent.model,
      apiKey: agent.apiKey || '',
      baseUrl: agent.baseUrl || '',
      systemPrompt: agent.systemPrompt || 'You are a helpful assistant.',
      skills: agent.skills || [],
      mcpServers: agent.mcpServers || [],
      channels: agent.channels || ['terminal'],
      llm: {
        temperature: agent.temperature || 0.7,
        maxTokens: agent.maxTokens || 4096,
      },
    });
    writeFileSync(configPath, yamlContent);
    try {
      await runtime.loadAgent(configPath);
      const updated = runtime.getAgent(id)?.getInfo();
      if (updated) {
        const { apiKey, ...safe } = updated;
        return c.json({ success: true, agent: safe });
      }
      return c.json({ success: true, agent: runtime.getAgent(id)?.getInfo() });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Delete agent
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const configPath = join(agentsDir, `${id}.yaml`);
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
    return c.json({ success: true });
  });

  // Export agent skills and MCP config (for copying to other agents)
  router.get('/:id/export', (c) => {
    const id = c.req.param('id');
    const agent = runtime.getAgent(id)?.getInfo();
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json({
      skills: agent.skills || [],
      mcpServers: agent.mcpServers || [],
    });
  });

  // Import skills/MCP from another agent
  router.post('/:id/import', async (c) => {
    const id = c.req.param('id');
    const { sourceAgentId, copySkills, copyMcp } = await c.req.json();
    const agent = runtime.getAgent(id)?.getInfo();
    if (!agent) {
      return c.json({ error: 'Target agent not found' }, 404);
    }
    return c.json({
      success: true,
      message: 'Use /agents/:sourceId/export to get config, then manually add to agent YAML',
      exportedConfig: {
        skills: copySkills ? (agent.skills || []) : [],
        mcpServers: copyMcp ? (agent.mcpServers || []) : [],
      },
    });
  });

  // Chat with agent
  router.post('/:id/chat', async (c) => {
    const id = c.req.param('id');
    const { message, userId } = await c.req.json();
    const agent = runtime.getAgent(id);

    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    const response = await agent.processMessage(userId || 'api-user', message, 'api');
    return c.json({ response });
  });

  return router;
}
import { Hono } from 'hono';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import type { Runtime } from '../../../core/runtime';
import type { MCPConfig } from '../../../core/types';

export function createMcpRouter(runtime: Runtime): Hono {
  const router = new Hono();
  const mcpDir = join(process.cwd(), 'mcp');

  // List all MCP servers
  router.get('/', (c) => c.json(runtime.getMcpClient().listServers()));

  // Get single MCP server
  router.get('/:id', (c) => {
    const id = c.req.param('id');
    const server = runtime.getMcpClient().getServer(id);
    if (!server) return c.json({ error: 'MCP server not found' }, 404);
    return c.json(server);
  });

  // Create new MCP server
  router.post('/', async (c) => {
    const config: MCPConfig = await c.req.json();
    if (!config.id || !config.name || !config.command) {
      return c.json({ error: 'Missing required fields: id, name, command' }, 400);
    }
    const configPath = join(mcpDir, `${config.id}.json`);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    try {
      await runtime.getMcpClient().addServer(configPath);
      return c.json({ success: true, server: runtime.getMcpClient().getServer(config.id) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Update MCP server
  router.put('/:id', async (c) => {
    const id = c.req.param('id');
    const config: MCPConfig = await c.req.json();
    config.id = id;
    const configPath = join(mcpDir, `${id}.json`);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    // Restart server if it was running
    await runtime.getMcpClient().stopServer(id);
    try {
      await runtime.getMcpClient().addServer(configPath);
      return c.json({ success: true, server: runtime.getMcpClient().getServer(id) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Delete MCP server
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');
    await runtime.getMcpClient().stopServer(id);
    const configPath = join(mcpDir, `${id}.json`);
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
    return c.json({ success: true });
  });

  // Start MCP server
  router.post('/:id/start', async (c) => {
    const id = c.req.param('id');
    const configPath = join(mcpDir, `${id}.json`);
    if (!existsSync(configPath)) {
      return c.json({ error: 'MCP server config not found' }, 404);
    }
    try {
      await runtime.getMcpClient().addServer(configPath);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Stop MCP server
  router.post('/:id/stop', async (c) => {
    const id = c.req.param('id');
    await runtime.getMcpClient().stopServer(id);
    return c.json({ success: true });
  });

  return router;
}
import { Hono } from 'hono';
import { createAgentsRouter } from './routes/agents';
import { createSkillsRouter } from './routes/skills';
import { createMcpRouter } from './routes/mcp';
import { createChannelsRouter } from './routes/channels';
import type { Runtime } from '../../core/runtime';

export function createApiRouter(runtime: Runtime): Hono {
  const app = new Hono();

  app.route('/agents', createAgentsRouter(runtime));
  app.route('/skills', createSkillsRouter(runtime));
  app.route('/mcp', createMcpRouter(runtime));
  app.route('/channels', createChannelsRouter(runtime));

  app.get('/', (c) => c.text('Kamer API'));

  return app;
}
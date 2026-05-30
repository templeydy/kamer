import { Hono } from 'hono';
import type { Runtime } from '../../../core/runtime';

export function createAgentsRouter(runtime: Runtime): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    const agents = runtime.listAgents();
    return c.json(agents);
  });

  router.get('/:id', (c) => {
    const id = c.req.param('id');
    const agent = runtime.getAgent(id)?.getInfo();
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json(agent);
  });

  router.post('/', async (c) => {
    const body = await c.req.json();
    return c.json({ success: true });
  });

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
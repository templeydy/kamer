import { Hono } from 'hono';
import type { Runtime } from '../../../core/runtime';

export function createMcpRouter(runtime: Runtime): Hono {
  const router = new Hono();
  router.get('/servers', (c) => c.json(runtime.getMcpClient().listServers()));
  return router;
}
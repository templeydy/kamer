import { Hono } from 'hono';
import type { Runtime } from '../../../core/runtime';

export function createChannelsRouter(runtime: Runtime): Hono {
  const router = new Hono();
  router.get('/', (c) => c.json(runtime.listChannels()));
  return router;
}
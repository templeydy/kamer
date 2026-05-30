import { Hono } from 'hono';
import type { Runtime } from '../../../core/runtime';

export function createSkillsRouter(runtime: Runtime): Hono {
  const router = new Hono();
  router.get('/', (c) => c.json(runtime.getSkillEngine().listSkills()));
  return router;
}
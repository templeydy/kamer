import { Hono } from 'hono';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Runtime } from '../../../core/runtime';

export function createSkillsRouter(runtime: Runtime): Hono {
  const router = new Hono();
  const skillsDir = join(process.cwd(), 'skills');

  // List all skills
  router.get('/', (c) => c.json(runtime.getSkillEngine().listSkills()));

  // List available skills (for copying)
  router.get('/available', (c) => {
    const skills = runtime.getSkillEngine().listSkills();
    return c.json(skills.map(s => ({ name: s.name, description: s.description, version: s.version })));
  });

  // Get single skill
  router.get('/:name', (c) => {
    const name = c.req.param('name');
    const skill = runtime.getSkillEngine().getSkill(name);
    if (!skill) return c.json({ error: 'Skill not found' }, 404);
    return c.json(skill);
  });

  // Create new skill
  router.post('/', async (c) => {
    const { name, description, version = '1.0.0', content } = await c.req.json();
    if (!name || !description) {
      return c.json({ error: 'Missing name or description' }, 400);
    }
    const skillDir = join(skillsDir, name);
    mkdirSync(skillDir, { recursive: true });
    const skillContent = content || `---
name: ${name}
description: ${description}
version: ${version}
---

# ${name}

Describe what this skill does here.
`;
    writeFileSync(join(skillDir, 'SKILL.md'), skillContent);
    // Reload skill
    try {
      runtime.getSkillEngine().loadSkill(join(skillDir, 'SKILL.md'), name);
      return c.json({ success: true, skill: runtime.getSkillEngine().getSkill(name) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Update skill
  router.put('/:name', async (c) => {
    const name = c.req.param('name');
    const { description, version, content } = await c.req.json();
    const skillDir = join(skillsDir, name);
    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      return c.json({ error: 'Skill not found' }, 404);
    }
    // Parse existing to preserve name
    const existing = runtime.getSkillEngine().getSkill(name);
    const newContent = content || `---
name: ${name}
description: ${description || existing?.description || ''}
version: ${version || existing?.version || '1.0.0'}
---

# ${name}

Describe what this skill does here.
`;
    writeFileSync(skillPath, newContent);
    // Reload skill
    runtime.getSkillEngine().loadSkill(skillPath, name);
    return c.json({ success: true, skill: runtime.getSkillEngine().getSkill(name) });
  });

  // Delete skill
  router.delete('/:name', async (c) => {
    const name = c.req.param('name');
    const skillDir = join(skillsDir, name);
    const skillPath = join(skillDir, 'SKILL.md');
    if (existsSync(skillPath)) {
      unlinkSync(skillPath);
    }
    return c.json({ success: true });
  });

  return router;
}
import { describe, it, expect } from 'vitest';
import { SkillEngine } from './skill-engine';

describe('SkillEngine', () => {
  it('should create skill engine', () => {
    const engine = new SkillEngine();
    expect(engine).toBeDefined();
  });

  it('should list no skills when empty', () => {
    const engine = new SkillEngine();
    const skills = engine.listSkills();
    expect(skills.length).toBe(0);
  });
});

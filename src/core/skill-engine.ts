import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Skill, SkillContext, SkillResult } from './types';
import { EmbeddingService } from './embedding';
import yaml from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SkillEngine {
  private skills: Map<string, Skill> = new Map();

  /**
   * Load skills from a directory containing SKILL.md files
   */
  loadSkillsFromDir(dirPath: string): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = join(dirPath, entry.name, 'SKILL.md');
          try {
            this.loadSkill(skillPath, entry.name);
          } catch (e) {
            // Skill file might not exist, skip
          }
        }
      }
    } catch (e) {
      // Directory might not exist
    }
  }

  /**
   * Load a single skill from SKILL.md
   */
  loadSkill(skillPath: string, name: string): void {
    const content = readFileSync(skillPath, 'utf-8');
    const skill = this.parseSkill(content, name);
    this.skills.set(skill.name, skill);
  }

  /**
   * Parse SKILL.md content into a Skill object
   * Simplified parser for baoyu-style SKILL.md
   */
  private parseSkill(content: string, fallbackName: string): Skill {
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    let name = fallbackName;
    let description = '';
    let version = '1.0.0';

    if (frontmatterMatch) {
      const frontmatter = yaml.parse(frontmatterMatch[1]);
      name = frontmatter.name || fallbackName;
      description = frontmatter.description || '';
      version = frontmatter.version || '1.0.0';
    }

    return {
      name,
      description,
      version,
      execute: async (ctx: SkillContext): Promise<SkillResult> => {
        return {
          success: true,
          content: `Skill ${name} executed`,
        };
      },
    };
  }

  listSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  async executeSkill(name: string, ctx: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(name);
    if (!skill) {
      return {
        success: false,
        error: `Skill ${name} not found`,
      };
    }

    try {
      return await skill.execute(ctx);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * 批量预计算 skill 描述 embedding
   */
  async prepareEmbeddings(embeddingService: EmbeddingService): Promise<void> {
    const skills = this.listSkills();
    const descriptions = skills.map(s => s.description || `${s.name}: ${s.description}`);
    if (descriptions.length === 0) return;
    const vectors = await embeddingService.embedBatch(descriptions);
    skills.forEach((skill, index) => {
      skill.embedding = vectors[index];
    });
  }

  /**
   * 根据查询文本检索最匹配的 skill
   */
  async retrieveTopSkills(
    query: string,
    embeddingService: EmbeddingService,
    k: number
  ): Promise<{ skill: Skill; score: number }[]> {
    const skills = this.listSkills().filter(s => s.embedding);
    if (skills.length === 0) return [];
    const queryEmbedding = await embeddingService.embed(query);
    const scored = skills.map(skill => ({
      skill,
      score: embeddingService.cosineSimilarity(queryEmbedding, skill.embedding!),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
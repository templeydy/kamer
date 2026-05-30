# Agent Framework 消息处理与记忆压缩优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构消息处理流程，实现向量检索记忆上下文 + Skill/MCP 优选 + AI summarization 压缩

**Architecture:**
- 新增 `EmbeddingService` 负责文本向量化和相似度检索
- 重构 `AgentBrain.processMessage` 为多阶段流水线：检索 → 优选 → 注入 → 调用
- 重构 `Memory` 支持 10000 条消息阈值 + summarization 压缩
- Skill/MCP 描述预生成 embedding，并行检索最优匹配

**Tech Stack:** TypeScript, LLM embedding API (OpenAI compatible), @larksuiteoapi/node-sdk

---

## Task 1: 创建 Embedding Service

**Files:**
- Create: `src/core/embedding.ts`
- Create: `src/core/embedding.test.ts`

- [ ] **Step 1: 创建 embedding.ts**

```typescript
import { LLMAdapter } from './llm-adapter';

export interface EmbeddingResult {
  vector: number[];
  text: string;
}

export class EmbeddingService {
  private apiKey?: string;
  private baseUrl: string;
  private cache: Map<string, number[]>;

  constructor(config: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.cache = new Map();
  }

  async embed(text: string): Promise<number[]> {
    // 缓存检查
    const cacheKey = text.substring(0, 100);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const apiKey = this.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('API_KEY not set');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    const vector = data.data[0].embedding;

    // 缓存
    this.cache.set(cacheKey, vector);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const apiKey = this.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('API_KEY not set');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data.map((item: any) => item.embedding);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async retrieveTopK(
    query: string,
    corpus: { id: string; text: string }[],
    k: number,
    getEmbedding: (text: string) => Promise<number[]>
  ): Promise<{ id: string; text: string; score: number }[]> {
    const queryEmbedding = await getEmbedding(query);

    const scored = corpus.map(item => {
      let score = 0;
      if (item.text) {
        score = this.cosineSimilarity(queryEmbedding, item.text as any);
      }
      return { id: item.id, text: item.text, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

- [ ] **Step 2: 创建 embedding.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { EmbeddingService } from './embedding';

describe('EmbeddingService', () => {
  it('should create instance', () => {
    const service = new EmbeddingService({});
    expect(service).toBeDefined();
  });

  it('should calculate cosine similarity correctly', () => {
    const service = new EmbeddingService({});
    const similarity = service.cosineSimilarity([1, 0, 0], [1, 0, 0]);
    expect(similarity).toBeCloseTo(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    const service = new EmbeddingService({});
    const similarity = service.cosineSimilarity([1, 0, 0], [0, 1, 0]);
    expect(similarity).toBeCloseTo(0);
  });
});
```

- [ ] **Step 3: 运行测试验证**

Run: `cd /Users/admin/agent_framework && npm test -- --run src/core/embedding.test.ts`

---

## Task 2: 重构 Memory 组件

**Files:**
- Modify: `src/core/memory.ts`

- [ ] **Step 1: 更新 memory.ts**

```typescript
import type { ConversationMemory, Message } from './types';
import { LLMAdapter } from './llm-adapter';

export interface MemoryOptions {
  maxMessages?: number;
  summaryThreshold?: number;           // 触发压缩的消息数，默认 10000
  retainMessagesAfterCompact?: number; // 压缩后保留条数，默认 100
}

export class Memory {
  private memory: ConversationMemory;
  private options: MemoryOptions;

  constructor(agentId: string, userId: string, channel: string, options: MemoryOptions = {}) {
    this.options = {
      maxMessages: options.maxMessages || 10000,
      summaryThreshold: options.summaryThreshold || 10000,
      retainMessagesAfterCompact: options.retainMessagesAfterCompact || 100,
    };
    this.memory = {
      agentId,
      userId,
      channel,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  addMessage(message: Message): void {
    this.memory.messages.push(message);
    this.memory.updatedAt = new Date();

    // 超过阈值时不再自动压缩，由 AgentBrain 决定何时压缩
    if (this.options.maxMessages && this.memory.messages.length > this.options.maxMessages) {
      this.memory.messages = this.memory.messages.slice(-this.options.maxMessages);
    }
  }

  getMessages(): Message[] {
    return [...this.memory.messages];
  }

  clear(): void {
    this.memory.messages = [];
    this.memory.updatedAt = new Date();
  }

  getMemory(): ConversationMemory {
    return { ...this.memory };
  }

  getContext(): Message[] {
    return this.getMessages();
  }

  getMessageCount(): number {
    return this.memory.messages.length;
  }

  shouldCompact(): boolean {
    return this.memory.messages.length >= (this.options.summaryThreshold || 10000);
  }

  // 获取需要摘要的早期消息（排除最近 retainMessagesAfterCompact 条）
  getEarlyMessages(count: number): Message[] {
    const retainCount = this.options.retainMessagesAfterCompact || 100;
    if (this.memory.messages.length <= retainCount) {
      return [];
    }
    const earlyCount = this.memory.messages.length - retainCount;
    return this.memory.messages.slice(0, earlyCount);
  }

  // 压缩：使用 LLM 生成摘要
  async compact(llm: LLMAdapter, systemPrompt: string): Promise<string> {
    const earlyMessages = this.getEarlyMessages(this.memory.messages.length);
    if (earlyMessages.length === 0) {
      return '';
    }

    const conversationText = earlyMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const summaryPrompt = `${systemPrompt}\n\n请总结以下对话的关键信息（用户偏好、已解决的问题、重要决策等），生成一段简洁的摘要：\n\n${conversationText}`;

    const response = await llm.chat(
      [{ role: 'user', content: summaryPrompt, timestamp: new Date() }],
      { temperature: 0.5, maxTokens: 500 }
    );

    const summary = response.content;

    // 保留最近的消息，清空早期消息并写入摘要
    const retainCount = this.options.retainMessagesAfterCompact || 100;
    const recentMessages = this.memory.messages.slice(-retainCount);

    this.memory.messages = [
      {
        role: 'system',
        content: `【对话摘要】${summary}`,
        timestamp: new Date(),
      },
      ...recentMessages,
    ];

    this.memory.updatedAt = new Date();
    return summary;
  }
}
```

- [ ] **Step 2: 运行测试验证**

Run: `npm test -- --run src/core/memory.test.ts`

---

## Task 3: 重构 SkillEngine

**Files:**
- Modify: `src/core/skill-engine.ts`
- Modify: `src/core/types.ts` (添加 embedding 字段)

- [ ] **Step 1: 更新 types.ts**

在 Skill 接口添加 `embedding` 字段：

```typescript
export interface Skill {
  name: string;
  description: string;
  version: string;
  execute(ctx: SkillContext): Promise<SkillResult>;
  validate?(params: unknown): boolean;
  embedding?: number[];  // 预计算的描述向量
}
```

- [ ] **Step 2: 更新 skill-engine.ts**

添加检索方法：

```typescript
import { spawn, ChildProcess } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Skill, SkillContext, SkillResult } from './types';
import type { EmbeddingService } from './embedding';
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

  // 批量预计算 skill 描述 embedding
  async prepareEmbeddings(embeddingService: EmbeddingService): Promise<void> {
    const skills = this.listSkills();
    const descriptions = skills.map(s => s.description || `${s.name}: ${s.description}`);

    if (descriptions.length === 0) return;

    const vectors = await embeddingService.embedBatch(descriptions);

    skills.forEach((skill, index) => {
      skill.embedding = vectors[index];
    });
  }

  // 根据查询文本检索最匹配的 skill
  async retrieveTopSkills(
    query: string,
    embeddingService: EmbeddingService,
    k: number
  ): Promise<{ skill: Skill; score: number }[]> {
    const skills = this.listSkills().filter(s => s.embedding);

    if (skills.length === 0) {
      return [];
    }

    const queryEmbedding = await embeddingService.embed(query);

    const scored = skills.map(skill => ({
      skill,
      score: embeddingService.cosineSimilarity(queryEmbedding, skill.embedding!),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
```

- [ ] **Step 3: 运行测试验证**

Run: `npm test -- --run src/core/skill-engine.test.ts`

---

## Task 4: 重构 MCPClient

**Files:**
- Modify: `src/core/mcp-client.ts`
- Modify: `src/core/types.ts` (添加 embedding 字段)

- [ ] **Step 1: 更新 types.ts**

在 MCPtool 接口添加 `embedding` 字段：

```typescript
export interface MCPtool {
  name: string;
  description: string;
  inputSchema: any;
  embedding?: number[];  // 预计算的描述向量
}
```

- [ ] **Step 2: 更新 mcp-client.ts**

添加检索方法：

```typescript
import { spawn, ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import type { MCPConfig, MCPServer, MCPtool } from './types';
import type { EmbeddingService } from './embedding';

export class MCPClient {
  private servers: Map<string, MCPServer> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  async addServer(configPath: string): Promise<void> {
    const config: MCPConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    await this.startServer(config);
  }

  async startServer(config: MCPConfig): Promise<void> {
    const server: MCPServer = {
      id: config.id,
      config,
      tools: [],
      status: 'disconnected',
    };

    this.servers.set(config.id, server);

    return new Promise((resolve, reject) => {
      const proc = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.processes.set(config.id, proc);
      server.status = 'connected';

      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {},
          clientInfo: {
            name: 'agent-framework',
            version: '0.1.0',
          },
        },
      };

      proc.stdin.write(JSON.stringify(initRequest) + '\n');

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.result?.tools) {
              server.tools = msg.result.tools as MCPtool[];
            }
          } catch {}
        }
      });

      proc.on('error', () => {
        server.status = 'error';
      });

      proc.on('exit', () => {
        server.status = 'disconnected';
      });

      resolve();
    });
  }

  async stopServer(serverId: string): Promise<void> {
    const proc = this.processes.get(serverId);
    if (proc) {
      proc.kill();
      this.processes.delete(serverId);
    }
    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'disconnected';
    }
  }

  listServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId);
  }

  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const proc = this.processes.get(serverId);
    if (!proc) {
      throw new Error(`Server ${serverId} not running`);
    }

    return new Promise((resolve, reject) => {
      const id = Date.now();
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      };

      const timeout = setTimeout(() => {
        reject(new Error('Tool call timeout'));
      }, 30000);

      const handler = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.id === id && msg.result) {
              clearTimeout(timeout);
              proc.stdout?.removeListener('data', handler);
              resolve(msg.result);
            }
          } catch {}
        }
      };

      proc.stdout?.on('data', handler);
      proc.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  // 批量预计算 tool 描述 embedding
  async prepareEmbeddings(embeddingService: EmbeddingService): Promise<void> {
    const servers = this.listServers();
    const toolDescriptions: { serverId: string; tool: MCPtool }[] = [];

    for (const server of servers) {
      for (const tool of server.tools) {
        toolDescriptions.push({ serverId: server.id, tool });
      }
    }

    if (toolDescriptions.length === 0) return;

    const texts = toolDescriptions.map(
      t => `${t.tool.name}: ${t.tool.description}`
    );

    const vectors = await embeddingService.embedBatch(texts);

    toolDescriptions.forEach((t, index) => {
      t.tool.embedding = vectors[index];
    });
  }

  // 根据查询文本检索最匹配的 tool
  async retrieveTopTools(
    query: string,
    embeddingService: EmbeddingService,
    k: number
  ): Promise<{ serverId: string; tool: MCPtool; score: number }[]> {
    const servers = this.listServers();
    const toolsWithServer: { serverId: string; tool: MCPtool; embedding?: number[] }[] = [];

    for (const server of servers) {
      for (const tool of server.tools) {
        if (tool.embedding) {
          toolsWithServer.push({ serverId: server.id, tool, embedding: tool.embedding });
        }
      }
    }

    if (toolsWithServer.length === 0) {
      return [];
    }

    const queryEmbedding = await embeddingService.embed(query);

    const scored = toolsWithServer.map(t => ({
      serverId: t.serverId,
      tool: t.tool,
      score: embeddingService.cosineSimilarity(queryEmbedding, t.embedding!),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
```

- [ ] **Step 3: 运行测试验证**

Run: `npm test -- --run src/core/mcp-client.test.ts`

---

## Task 5: 重构 AgentBrain

**Files:**
- Modify: `src/core/agent.ts`

- [ ] **Step 1: 更新 agent.ts**

```typescript
import type { Agent, Message, LLMResponse } from './types';
import { LLMAdapter } from './llm-adapter';
import { Memory } from './memory';
import { EmbeddingService } from './embedding';
import { SkillEngine } from './skill-engine';
import { MCPClient } from './mcp-client';

export class AgentBrain {
  private agent: Agent;
  private llm: LLMAdapter;
  private memory: Memory;
  private embeddingService: EmbeddingService;
  private skillEngine: SkillEngine;
  private mcpClient: MCPClient;

  constructor(
    agent: Agent,
    llmAdapter: LLMAdapter,
    embeddingService: EmbeddingService,
    skillEngine: SkillEngine,
    mcpClient: MCPClient
  ) {
    this.agent = agent;
    this.llm = llmAdapter;
    this.embeddingService = embeddingService;
    this.skillEngine = skillEngine;
    this.mcpClient = mcpClient;
    this.memory = new Memory(agent.id, '', '', { maxMessages: 10000 });
  }

  getInfo(): Agent {
    return { ...this.agent };
  }

  async processMessage(userId: string, message: string, channel: string): Promise<string> {
    // 1. 添加用户消息到记忆
    this.memory.addMessage({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // 2. 构建增强 prompt（检索上下文 + 推荐工具）
    const enhancedPrompt = await this.buildEnhancedPrompt(message, channel);

    // 3. 调用 LLM
    const response = await this.llm.chat(
      [
        { role: 'system', content: enhancedPrompt, timestamp: new Date() },
        ...this.memory.getContext(),
      ],
      {
        temperature: this.agent.temperature,
        maxTokens: this.agent.maxTokens,
      }
    );

    // 4. 添加助手响应到记忆
    this.memory.addMessage({
      role: 'assistant',
      content: response.content,
      timestamp: new Date(),
    });

    // 5. 检查是否需要压缩
    if (this.memory.shouldCompact()) {
      console.log(`[Memory] Message count reached threshold, compacting...`);
      await this.memory.compact(this.llm, this.agent.systemPrompt);
      console.log(`[Memory] Compaction complete`);
    }

    return response.content;
  }

  private async buildEnhancedPrompt(userMessage: string, channel: string): Promise<string> {
    const memoryContext = await this.retrieveMemoryContext(userMessage);
    const recommendedTools = await this.retrieveRecommendedTools(userMessage);

    return `${this.agent.systemPrompt}

【记忆上下文】
${memoryContext}

【推荐工具】
${recommendedTools}`;
  }

  private async retrieveMemoryContext(message: string): Promise<string> {
    const recentMessages = this.memory.getMessages().slice(-10);

    if (recentMessages.length === 0) {
      return '（无历史上下文）';
    }

    const contextText = recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    return contextText;
  }

  private async retrieveRecommendedTools(message: string): Promise<string> {
    const [topSkills, topTools] = await Promise.all([
      this.skillEngine.retrieveTopSkills(message, this.embeddingService, 3),
      this.mcpClient.retrieveTopTools(message, this.embeddingService, 3),
    ]);

    const parts: string[] = [];

    if (topSkills.length > 0) {
      const skillList = topSkills
        .map(s => `- ${s.skill.name}: ${s.skill.description}`)
        .join('\n');
      parts.push(`【Skills】\n${skillList}`);
    }

    if (topTools.length > 0) {
      const toolList = topTools
        .map(t => `- ${t.tool.name} (${t.serverId}): ${t.tool.description}`)
        .join('\n');
      parts.push(`【MCP Tools】\n${toolList}`);
    }

    if (parts.length === 0) {
      return '（无可用工具）';
    }

    return parts.join('\n\n');
  }

  setUserId(userId: string): void {
    const currentMemory = this.memory.getMemory();
    this.memory = new Memory(this.agent.id, userId, currentMemory.channel, { maxMessages: 10000 });
    for (const msg of currentMemory.messages) {
      this.memory.addMessage(msg);
    }
  }
}
```

- [ ] **Step 2: 运行测试验证**

Run: `npm test -- --run src/core/agent.test.ts`

---

## Task 6: 更新 Runtime

**Files:**
- Modify: `src/core/runtime.ts`

- [ ] **Step 1: 更新 runtime.ts**

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AgentBrain } from './agent';
import { LLMAdapter } from './llm-adapter';
import { EmbeddingService } from './embedding';
import { SkillEngine } from './skill-engine';
import { MCPClient } from './mcp-client';
import { TerminalChannel } from '../channels/terminal';
import { FeishuChannel } from '../channels/feishu';
import { WeComChannel } from '../channels/wecom';
import { DingTalkChannel } from '../channels/dingtalk';
import { TeamsChannel } from '../channels/teams';
import { ChannelAdapter } from '../channels/base';
import type { Agent } from './types';
import yaml from 'yaml';

export class Runtime {
  private agents: Map<string, AgentBrain> = new Map();
  private skillEngine: SkillEngine;
  private mcpClient: MCPClient;
  private embeddingService: EmbeddingService;
  private channels: Map<string, ChannelAdapter> = new Map();

  constructor() {
    this.skillEngine = new SkillEngine();
    this.mcpClient = new MCPClient();
    this.embeddingService = new EmbeddingService({});
    this.initChannels();
  }

  private initChannels(): void {
    // Load feishu config
    const feishuConfigPath = join(process.cwd(), 'channels/config/feishu.yaml');
    if (existsSync(feishuConfigPath)) {
      try {
        const feishuConfigContent = readFileSync(feishuConfigPath, 'utf-8');
        const feishuConfig = yaml.parse(feishuConfigContent);
        if (feishuConfig.feishu) {
          this.registerChannel('feishu', new FeishuChannel(feishuConfig.feishu));
        }
      } catch (e) {
        console.log('Failed to load feishu config:', e);
      }
    }

    // Register terminal channel
    this.registerChannel('terminal', new TerminalChannel());
  }

  async loadAgent(configPath: string): Promise<void> {
    const content = readFileSync(configPath, 'utf-8');
    const agentConfig: Agent = yaml.parse(content);

    const llmAdapter = new LLMAdapter({
      model: agentConfig.model,
      apiKey: agentConfig.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
      baseUrl: agentConfig.baseUrl,
    });

    const brain = new AgentBrain(
      agentConfig,
      llmAdapter,
      this.embeddingService,
      this.skillEngine,
      this.mcpClient
    );
    this.agents.set(agentConfig.id, brain);
  }

  loadSkills(skillsDir: string): void {
    this.skillEngine.loadSkillsFromDir(skillsDir);
    // 预计算 skill embeddings
    this.skillEngine.prepareEmbeddings(this.embeddingService).catch(console.error);
  }

  async loadMcpServer(configPath: string): Promise<void> {
    await this.mcpClient.addServer(configPath);
    // 预计算 tool embeddings
    this.mcpClient.prepareEmbeddings(this.embeddingService).catch(console.error);
  }

  registerChannel(name: string, channel: ChannelAdapter): void {
    this.channels.set(name, channel);
  }

  async startChannel(name: string): Promise<void> {
    const channel = this.channels.get(name);
    if (channel) {
      channel.onMessage(async (ctx) => {
        for (const agent of this.agents.values()) {
          const agentInfo = agent.getInfo();
          if (agentInfo.channels.includes(name)) {
            const messageId = ctx.metadata?.messageId;
            let reactionId: string | undefined;
            if (messageId && (channel as any).showThinking) {
              reactionId = await (channel as any).showThinking(messageId);
            }
            const response = await agent.processMessage(ctx.userId, ctx.message, ctx.channel);
            if (messageId && (channel as any).clearThinking) {
              await (channel as any).clearThinking(messageId, reactionId);
            }
            await channel.send(ctx.userId, response);
            break;
          }
        }
      });
      await channel.start();
    }
  }

  getAgent(agentId: string): AgentBrain | undefined {
    return this.agents.get(agentId);
  }

  getSkillEngine(): SkillEngine {
    return this.skillEngine;
  }

  getMcpClient(): MCPClient {
    return this.mcpClient;
  }

  getChannel(name: string): ChannelAdapter | undefined {
    return this.channels.get(name);
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values()).map(brain => brain.getInfo());
  }

  listChannels(): string[] {
    return Array.from(this.channels.keys());
  }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd /Users/admin/agent_framework && npm run build`

---

## Task 7: 集成测试

**Files:**
- Create: `src/core/integration.test.ts`

- [ ] **Step 1: 创建集成测试**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { Runtime } from './runtime';
import { join } from 'path';

describe('Runtime Integration', () => {
  it('should load agent and process message', async () => {
    const runtime = new Runtime();
    runtime.loadSkills('./skills');

    const agentPath = join(process.cwd(), 'agents/minimax-agent.yaml');
    await runtime.loadAgent(agentPath);

    const agents = runtime.listAgents();
    expect(agents.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行集成测试**

Run: `npm test -- --run src/core/integration.test.ts`

---

## 文件清单

| 操作 | 文件路径 |
|------|----------|
| Create | `src/core/embedding.ts` |
| Create | `src/core/embedding.test.ts` |
| Create | `src/core/integration.test.ts` |
| Modify | `src/core/memory.ts` |
| Modify | `src/core/skill-engine.ts` |
| Modify | `src/core/mcp-client.ts` |
| Modify | `src/core/agent.ts` |
| Modify | `src/core/runtime.ts` |
| Modify | `src/core/types.ts` |
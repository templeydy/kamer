# Agent Framework 消息处理与记忆压缩优化设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** 重构消息处理流程，实现向量检索记忆上下文 + Skill/MCP 优选 + AI summarization 压缩

**Architecture:**
- 新增 `EmbeddingService` 负责文本向量化和相似度检索
- 重构 `AgentBrain.processMessage` 为多阶段流水线：检索 → 优选 → 注入 → 调用
- 重构 `Memory` 支持 10000 条消息阈值 + summarization 压缩
- Skill/MCP 描述预生成 embedding，并行检索最优匹配

**Tech Stack:** TypeScript, LLM embedding API (OpenAI compatible), @larksuiteoapi/node-sdk

---

## 1. 新增 Embedding Service

### 1.1 文件
- Create: `src/core/embedding.ts`

### 1.2 接口

```typescript
export interface EmbeddingResult {
  vector: number[];
  text: string;
}

export class EmbeddingService {
  private apiKey?: string;
  private baseUrl: string;

  constructor(config: { apiKey?: string; baseUrl?: string });

  // 文本 → 向量
  async embed(text: string): Promise<number[]>;

  // 批量嵌入（用于预计算 skill/mcp 描述）
  async embedBatch(texts: string[]): Promise<number[][]>;

  // 余弦相似度计算
  cosineSimilarity(a: number[], b: number[]): number;

  // Top-K 检索
  async retrieveTopK(
    query: string,
    corpus: { id: string; text: string; vector?: number[] }[],
    k: number,
    getEmbedding?: (text: string) => Promise<number[]>
  ): Promise<{ id: string; text: string; score: number }[]>;
}
```

### 1.3 实现要点
- 优先使用配置的 baseUrl（OpenAI 兼容接口）
- 降级策略：无 embedding API 时使用摘要文本做关键词匹配
- 向量缓存：避免重复 embed 相同文本

---

## 2. 重构 Memory 组件

### 2.1 文件
- Modify: `src/core/memory.ts:1-48`

### 2.2 变更

```typescript
export interface MemoryOptions {
  maxMessages: number;          // 默认 10000
  summaryThreshold: number;     // 触发压缩的消息数
  retainMessagesAfterCompact: number;  // 压缩后保留条数，默认 100
}

export class Memory {
  // ... 现有接口 ...

  // 新增：触发压缩回调
  onCompact?: (summary: string) => Promise<void>;

  // 新增：压缩方法
  async compact(llm: LLMAdapter, systemPrompt: string): Promise<string>;

  // 新增：获取需要摘要的早期消息
  getEarlyMessages(count: number): Message[];
}
```

### 2.3 压缩流程
1. `addMessage` 检查 `messages.length >= summaryThreshold`
2. 调用 `compact(llm, systemPrompt)`
3. 将早期消息（除最近 `retainMessagesAfterCompact` 条）交给 LLM 生成摘要
4. 清空消息列表，写入 `{ role: 'system', content: '对话摘要: ...' }`
5. 追加最近消息

---

## 3. 重构 SkillEngine

### 3.1 文件
- Modify: `src/core/skill-engine.ts:1-103`

### 3.2 变更

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

### 3.3 新增方法

```typescript
export class SkillEngine {
  // ...

  // 批量预计算 skill 描述 embedding
  async prepareEmbeddings(embeddingService: EmbeddingService): Promise<void>;

  // 根据查询文本检索最匹配的 skill
  async retrieveTopSkills(
    query: string,
    embeddingService: EmbeddingService,
    k: number
  ): Promise<{ skill: Skill; score: number }[]>;
}
```

---

## 4. 重构 MCPClient

### 4.1 文件
- Modify: `src/core/mcp-client.ts:1-133`

### 4.2 变更

```typescript
export interface MCPtool {
  name: string;
  description: string;
  inputSchema: any;
  embedding?: number[];  // 预计算的描述向量
}
```

### 4.3 新增方法

```typescript
export class MCPClient {
  // ...

  // 批量预计算 tool 描述 embedding
  async prepareEmbeddings(embeddingService: EmbeddingService): Promise<void>;

  // 根据查询文本检索最匹配的 tool
  async retrieveTopTools(
    query: string,
    embeddingService: EmbeddingService,
    k: number
  ): Promise<{ serverId: string; tool: MCPtool; score: number }[]>;
}
```

---

## 5. 重构 AgentBrain

### 5.1 文件
- Modify: `src/core/agent.ts:1-57`

### 5.2 新流程

```
processMessage(userId, message, channel)
  │
  ├─► 1. 生成用户消息 embedding
  │
  ├─► 2. 并行检索:
  │      ├─ Memory 上下文检索 (top 10)
  │      ├─ SkillEngine 最优 skill (top 3)
  │      └─ MCPClient 最优 tool (top 3)
  │
  ├─► 3. 构建增强 prompt:
  │      └─ [记忆上下文]
  │      └─ [推荐工具列表]
  │      └─ [systemPrompt]
  │
  ├─► 4. 调用 LLM
  │
  ├─► 5. 内存检查，超过阈值触发压缩
  │
  └─► 6. 返回响应
```

### 5.3 代码结构

```typescript
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
  );

  async processMessage(userId: string, message: string, channel: string): Promise<string>;

  private async buildEnhancedPrompt(
    userMessage: string,
    channel: string
  ): Promise<string>;

  private async retrieveMemoryContext(message: string): Promise<string>;

  private async retrieveRecommendedTools(message: string): Promise<string>;
}
```

---

## 6. Runtime 适配

### 6.1 文件
- Modify: `src/core/runtime.ts:1-125`

### 6.2 变更
- 构造 `EmbeddingService` 并注入 `AgentBrain`
- 启动时调用 `skillEngine.prepareEmbeddings()` 和 `mcpClient.prepareEmbeddings()`

---

## 7. 测试策略

### 7.1 单元测试
- `embedding.test.ts` - 向量化服务测试
- `memory.test.ts` - 压缩逻辑测试
- `skill-engine.test.ts` - 检索测试
- `mcp-client.test.ts` - tool 检索测试
- `agent.test.ts` - 增强 prompt 构建测试

### 7.2 集成测试
- 完整流程测试：发消息 → 检索 → 调用 → 响应

---

## 8. 文件清单

| 操作 | 文件路径 |
|------|----------|
| Create | `src/core/embedding.ts` |
| Modify | `src/core/memory.ts:1-48` |
| Modify | `src/core/skill-engine.ts:1-103` |
| Modify | `src/core/mcp-client.ts:1-133` |
| Modify | `src/core/agent.ts:1-57` |
| Modify | `src/core/runtime.ts:1-125` |
| Create | `src/core/embedding.test.ts` |
| Modify | `src/core/memory.test.ts` |
| Modify | `src/core/skill-engine.test.ts` |
| Modify | `src/core/mcp-client.test.ts` |
| Modify | `src/core/agent.test.ts` |
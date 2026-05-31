# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (requires bun)
bun run src/index.ts          # Start dev server on port 3000

# Type check
tsc --noEmit                  # TypeScript check (no emit)

# Build
bun build src/index.ts --outdir dist --target bun

# Tests (vitest)
npx vitest                    # Run all tests (watch mode)
npx vitest run                # Run all tests once
npx vitest run src/core/agent.test.ts  # Run single test file
```

## Architecture

An extensible multi-agent runtime with channel adapters, skill engine, MCP tool integration, and a web management UI.

### Entry point: `src/index.ts`
- Creates a `Runtime` instance
- Loads agent configs from `agents/*.yaml`
- Loads skills from `skills/*/SKILL.md`
- Starts channel adapters (feishu, terminal)
- Mounts REST API routes via Hono: `/agents`, `/skills`, `/mcp`, `/channels`
- Serves management UI from `ui/index.html` at `/` and `/ui`

### Core: `src/core/`

**`runtime.ts`** — Orchestrator that wires everything together. Holds all agents, channels, skill engine, MCP client, and embedding service. When `startChannel()` is called, it registers an `onMessage` handler that routes incoming messages to agents configured for that channel.

**`agent.ts` (`AgentBrain`)** — The agent execution loop:
1. Add user message to `Memory`
2. Retrieve top-k relevant skills via `SkillEngine.retrieveTopSkills()` (cosine similarity on embeddings)
3. Retrieve top-k relevant MCP tools via `MCPClient.retrieveTopTools()`
4. Build system prompt with skill + tool descriptions
5. Call LLM via `LLMAdapter`
6. If LLM returns tool calls, execute them (MCP tools, filesystem, bash) with permission checks
7. Loop until final response or `maxIterations` reached

**`skill-engine.ts`** — Loads skills from `SKILL.md` files (YAML frontmatter + markdown body). Uses `EmbeddingService` to compute description embeddings for semantic retrieval. Skills are stored in a `Map<string, Skill>`.

**`mcp-client.ts`** — Manages MCP server processes via stdio. Connects to servers defined in `mcp/` directory as JSON configs. Exposes tools through `retrieveTopTools()` for semantic selection.

**`memory.ts`** — Per-agent conversation memory with compaction support. When messages exceed threshold, older messages are summarized into a `StructuredSummary` (JSON with topics, decisions, pending tasks, key facts).

**`llm-adapter.ts`** — Multi-provider LLM client supporting Anthropic, OpenAI, xAI, Ollama, and OpenAI-compatible APIs. Auto-detects provider from `baseUrl`. Supports both streaming (SSE) and non-streaming chat.

**`embedding.ts`** — Embedding service wrapper with cosine similarity utilities. Used by skill engine and MCP client to enable semantic retrieval.

**`hook-manager.ts`** — Pre/Post tool-use hook system. Built-in hooks: `createToolLogger` (logs tool calls) and `createDangerousToolBlocker` (blocks dangerous commands).

**`types.ts`** — All shared TypeScript interfaces: `Agent`, `Skill`, `Message`, `MCPConfig`, `ChannelConfig`, `LLMResponse`, `StreamChunk`, `ToolCall`, `PermissionConfig`, `HookEvent`, `StructuredSummary`, etc.

### Channels: `src/channels/`
- `ChannelAdapter` (abstract base) — defines `start()`, `stop()`, `send()`, `onMessage()`, `onStream()`
- `FeishuChannel` — Lark/Feishu via WebSocket SDK with reaction-based thinking indicators
- `TerminalChannel` — Interactive CLI
- `WeComChannel`, `DingTalkChannel`, `TeamsChannel` — stubs with token-based API auth

### API Routes: `src/ui/api/routes/`
- `agents.ts` — CRUD + chat + export/import for agents. Strips `apiKey` from list/detail responses.
- `skills.ts` — CRUD for skills with file-backed storage in `skills/`
- `mcp.ts` — CRUD + start/stop for MCP servers in `mcp/`
- `channels.ts` — List registered channels

### Channel Config: `channels/config/feishu.yaml`
```yaml
feishu:
  appId: cli_xxx
  appSecret: xxx
  webhookUrl: ""  # 可选
```

### MCP Server Config: `mcp/<id>.json`
```json
{
  "id": "filesystem",
  "name": "Filesystem Server",
  "command": "npx",
  "args": ["-e", "server.js"],
  "env": { "KEY": "value" }
}
```

### Agent Config: `agents/*.yaml`
```yaml
id: my-agent
name: 我的智能体
model: gpt-4o
apiKey: sk-xxx
baseUrl: https://api.openai.com/v1
systemPrompt: |
  You are a helpful assistant.
skills: [web_search, calculator]
mcpServers: [filesystem]
channels: [terminal, feishu]
llm: { temperature: 0.7, maxTokens: 4096 }
```

### Skill Format: `skills/<name>/SKILL.md`
YAML frontmatter with `name`, `description`, `version`, followed by markdown body.

### Management UI
Web UI at `/` (port 3000) with 5 themes: 暗夜蓝 (default), 翡翠绿, 落日橙, 极简白, 紫罗兰. Theme preference persisted in `localStorage['kamer-theme']`.

### Key Patterns
- **Immutable data**: Agent info is returned as copies (`{ ...this.agent }`)
- **Semantic retrieval**: Skills and MCP tools are retrieved by cosine similarity of description embeddings, not by keyword matching
- **Permission system**: Three levels — `ReadOnly` (safe reads only), `WorkspaceWrite` (file writes allowed), `DangerFullAccess` (all commands allowed)
- **Tool execution loop**: Agent iterates up to `maxIterations`, calling LLM → parsing tool calls → executing → feeding results back

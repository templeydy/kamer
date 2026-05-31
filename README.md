# Kamer

一个可扩展的多智能体运行时，支持飞书、终端等多个渠道，具备技能引擎、MCP 工具集成、Web 管理界面。

## 快速开始

```bash
npm install

# 启动 Web UI（端口 3000）
npm run dev

# 交互式终端模式
npm run dev -- --cli
```

## 核心功能

- **多智能体** — 支持多个独立 Agent，可配置不同模型、渠道、权限
- **多渠道** — 飞书、终端、企业微信、钉钉、Teams
- **技能引擎** — 145 个预置技能，支持语义检索
- **MCP 集成** — 通过 Model Context Protocol 连接外部工具服务器
- **Web 管理 UI** — 5 套主题，随时切换
- **权限控制** — ReadOnly / WorkspaceWrite / DangerFullAccess 三级权限

## 配置

### Agent 配置（`agents/*.yaml`）

```yaml
id: my-agent
name: 我的智能体
model: gpt-4o
apiKey: sk-xxx
baseUrl: https://api.openai.com/v1
systemPrompt: You are a helpful assistant.
skills: [web_search, calculator]
mcpServers: [filesystem]
channels: [terminal, feishu]
llm:
  temperature: 0.7
  maxTokens: 4096
```

### 飞书配置（`channels/config/feishu.yaml`）

```yaml
feishu:
  appId: cli_xxx
  appSecret: xxx
```

### MCP 服务配置（`mcp/<id>.json`）

```json
{
  "id": "filesystem",
  "name": "Filesystem Server",
  "command": "npx",
  "args": ["-e", "server.js"]
}
```

## API

- `GET /agents` — 列出所有 Agent
- `POST /agents/:id/chat` — 与 Agent 对话
- `GET /skills` — 列出所有技能
- `GET /mcp` — 列出 MCP 服务
- `GET /channels` — 列出渠道

Web UI 访问 http://localhost:3000

## 开发

```bash
# 类型检查
npm run typecheck

# 测试
npx vitest run
```

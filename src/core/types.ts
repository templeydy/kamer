// Agent 配置
export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;                    // 支持自定义模型名称
  apiKey?: string;                  // 可选 API Key（优先于环境变量）
  baseUrl?: string;                 // 自定义 API 地址（如 OpenAI 兼容接口）
  systemPrompt: string;
  skills: string[];
  mcpServers: string[];
  temperature: number;
  maxTokens: number;
}

// Skill 上下文
export interface SkillContext {
  agentId: string;
  userId: string;
  channel: string;
  message: string;
  metadata: Record<string, any>;
}

// Skill 结果
export interface SkillResult {
  success: boolean;
  content?: string;
  data?: any;
  error?: string;
}

// Skill 接口
export interface Skill {
  name: string;
  description: string;
  version: string;
  execute(ctx: SkillContext): Promise<SkillResult>;
  validate?(params: unknown): boolean;
}

// 消息
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// 对话记忆
export interface ConversationMemory {
  agentId: string;
  userId: string;
  channel: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

// MCP 配置
export interface MCPConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// MCP 服务器状态
export interface MCPServer {
  id: string;
  config: MCPConfig;
  tools: MCPtool[];
  status: 'connected' | 'disconnected' | 'error';
}

// MCP 工具
export interface MCPtool {
  name: string;
  description: string;
  inputSchema: any;
}

// Channel 配置
export interface ChannelConfig {
  enabled: boolean;
  webhookUrl?: string;
  token?: string;
  secret?: string;
}

// LLM 选项
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// LLM 响应
export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
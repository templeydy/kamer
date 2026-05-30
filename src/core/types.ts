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
  embedding?: number[];  // 预计算的描述向量
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
  embedding?: number[];  // 预计算的描述向量
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

// ============================================
// Streaming Types
// ============================================

export type StreamEventType =
  | 'content.start'
  | 'content.delta'
  | 'content.end'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'done';

export interface StreamEvent {
  type: StreamEventType;
  data: any;
  timestamp: Date;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: any;
}

// ============================================
// Tool Execution Types
// ============================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolExecutionResult {
  toolCallId: string;
  success: boolean;
  content?: string;
  error?: string;
  exitCode?: number;
  duration: number;
}

export interface ExecutionState {
  iteration: number;
  maxIterations: number;
  toolCalls: ToolCall[];
  results: ToolExecutionResult[];
  finalResponse: string;
}

// ============================================
// Permission Types
// ============================================

export type PermissionPolicy = 'ReadOnly' | 'WorkspaceWrite' | 'DangerFullAccess';

export interface PermissionConfig {
  policy: PermissionPolicy;
  allowedTools?: string[];
  blockedTools?: string[];
  workspacePaths?: string[];
}

export interface PermissionCheck {
  allowed: boolean;
  policy: PermissionPolicy;
  toolName: string;
  reason?: string;
}

// ============================================
// Hook Types
// ============================================

export type HookEventType = 'PreToolUse' | 'PostToolUse';

export interface HookEvent {
  type: HookEventType;
  toolName: string;
  toolArgs: Record<string, any>;
  permission: PermissionPolicy;
  timestamp: Date;
}

export interface HookContext {
  agentId: string;
  userId: string;
  channel: string;
  iteration: number;
  messages: Message[];
}

export type HookHandler = (event: HookEvent, context: HookContext) => Promise<HookResult> | HookResult;

export interface HookResult {
  allowed: boolean;
  exitCode?: number;
  modifiedArgs?: Record<string, any>;
  message?: string;
}

export const HOOK_EXIT = {
  CONTINUE: 0,
  RETRY: 1,
  SKIP: 2,
  ABORT: 3,
} as const;

// ============================================
// Summary Types
// ============================================

export interface StructuredSummary {
  version: string;
  generatedAt: Date;
  messageCount: number;
  topics: string[];
  decisions: string[];
  pendingTasks: string[];
  keyFacts: string[];
  userPreferences: string[];
  contextWindows: string[];
}

export interface CompactedMemory {
  summary: StructuredSummary;
  recentMessages: Message[];
  originalMessageCount: number;
}
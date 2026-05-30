import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AgentBrain } from './agent';
import { LLMAdapter } from './llm-adapter';
import { SkillEngine } from './skill-engine';
import { MCPClient } from './mcp-client';
import { EmbeddingService } from './embedding';
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

    console.log('[DEBUG] loadAgent, model:', agentConfig.model, 'apiKey present:', !!agentConfig.apiKey, 'baseUrl:', agentConfig.baseUrl);

    const llmAdapter = new LLMAdapter({
      model: agentConfig.model,
      apiKey: agentConfig.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
      baseUrl: agentConfig.baseUrl,
    });

    const brain = new AgentBrain(agentConfig, llmAdapter, this.embeddingService, this.skillEngine, this.mcpClient);
    this.agents.set(agentConfig.id, brain);
  }

  loadSkills(skillsDir: string): void {
    this.skillEngine.loadSkillsFromDir(skillsDir);
    this.skillEngine.prepareEmbeddings(this.embeddingService).catch(console.error);
  }

  async loadMcpServer(configPath: string): Promise<void> {
    await this.mcpClient.addServer(configPath);
    this.mcpClient.prepareEmbeddings(this.embeddingService).catch(console.error);
  }

  registerChannel(name: string, channel: ChannelAdapter): void {
    this.channels.set(name, channel);
  }

  async startChannel(name: string): Promise<void> {
    const channel = this.channels.get(name);
    if (channel) {
      // Register message handler for the channel
      channel.onMessage(async (ctx) => {
        console.log('[DEBUG] onMessage callback triggered, userId:', ctx.userId, 'message:', ctx.message);
        // Find agents configured for this channel
        for (const agent of this.agents.values()) {
          const agentInfo = agent.getInfo();
          if (agentInfo.channels.includes(name)) {
            const messageId = ctx.metadata?.messageId;
            console.log('[DEBUG] Found agent:', agentInfo.id, 'channel config:', agentInfo.channels);
            // 在用户消息上添加思考表情，返回 reactionId 用于后续删除
            let reactionId: string | undefined;
            if (messageId && (channel as any).showThinking) {
              try {
                reactionId = await (channel as any).showThinking(messageId);
                console.log('[DEBUG] showThinking returned:', reactionId);
              } catch (e) {
                console.error('[DEBUG] showThinking error:', e);
              }
            }
            console.log('[DEBUG] About to call agent.processMessage');
            const response = await agent.processMessage(ctx.userId, ctx.message, ctx.channel);
            console.log('[DEBUG] processMessage returned response length:', response.length);
            // 移除思考表情
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
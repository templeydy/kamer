import { readFileSync } from 'fs';
import { AgentBrain } from './agent';
import { LLMAdapter } from './llm-adapter';
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
  private channels: Map<string, ChannelAdapter> = new Map();

  constructor() {
    this.skillEngine = new SkillEngine();
    this.mcpClient = new MCPClient();
  }

  async loadAgent(configPath: string): Promise<void> {
    const content = readFileSync(configPath, 'utf-8');
    const agentConfig: Agent = yaml.parse(content);

    const llmAdapter = new LLMAdapter({
      model: agentConfig.model,
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
    });

    const brain = new AgentBrain(agentConfig, llmAdapter);
    this.agents.set(agentConfig.id, brain);
  }

  loadSkills(skillsDir: string): void {
    this.skillEngine.loadSkillsFromDir(skillsDir);
  }

  async loadMcpServer(configPath: string): Promise<void> {
    await this.mcpClient.addServer(configPath);
  }

  registerChannel(name: string, channel: ChannelAdapter): void {
    this.channels.set(name, channel);
  }

  async startChannel(name: string): Promise<void> {
    const channel = this.channels.get(name);
    if (channel) {
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
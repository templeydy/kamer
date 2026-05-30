import { ChannelAdapter } from './base';
import type { SkillContext, Message } from '../core/types';

export interface WeComConfig {
  corpId: string;
  corpSecret: string;
  agentId: string;
  webhookUrl: string;
}

export class WeComChannel extends ChannelAdapter {
  platform = 'wecom' as const;
  private config: WeComConfig;
  private accessToken?: string;

  constructor(config: WeComConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    await this.getAccessToken();
  }

  async stop(): Promise<void> {}

  async send(userId: string, content: string | Message): Promise<void> {
    const text = typeof content === 'string' ? content : content.content;
    const payload = {
      msgtype: 'text',
      text: {
        content: text,
      },
      touser: userId,
    };

    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  formatForChannel(message: string, _ctx: SkillContext): string {
    return message;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.corpSecret}`;
    const response = await fetch(url);
    const data = await response.json();
    this.accessToken = data.access_token;
    return this.accessToken!;
  }
}
import { ChannelAdapter } from './base';
import type { SkillContext, Message } from '../core/types';

export interface DingTalkConfig {
  appKey: string;
  appSecret: string;
  robotCode: string;
  webhookUrl: string;
}

export class DingTalkChannel extends ChannelAdapter {
  platform = 'dingtalk' as const;
  private config: DingTalkConfig;
  private accessToken?: string;

  constructor(config: DingTalkConfig) {
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
    };

    await fetch(this.config.webhookUrl, {
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

    const response = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: this.config.appKey,
        appSecret: this.config.appSecret,
      }),
    });

    const data = await response.json() as { accessToken: string };
    this.accessToken = data.accessToken;
    return this.accessToken!;
  }
}
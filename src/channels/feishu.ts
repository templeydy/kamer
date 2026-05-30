import { ChannelAdapter } from './base';
import type { SkillContext, Message } from '../core/types';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  webhookUrl: string;
}

export class FeishuChannel extends ChannelAdapter {
  platform = 'feishu' as const;
  private config: FeishuConfig;
  private accessToken?: string;
  private tokenExpireTime?: number;

  constructor(config: FeishuConfig) {
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
      msg_type: 'text',
      content: {
        text,
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
    if (this.accessToken && this.tokenExpireTime && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    });

    const data = await response.json();
    this.accessToken = data.tenant_access_token;
    this.tokenExpireTime = Date.now() + (data.expire - 60) * 1000;
    return this.accessToken!;
  }
}
import { ChannelAdapter } from './base';
import type { SkillContext, Message } from '../core/types';

export interface TeamsConfig {
  appId: string;
  appPassword: string;
  botId: string;
}

export class TeamsChannel extends ChannelAdapter {
  platform = 'teams' as const;
  private config: TeamsConfig;
  private accessToken?: string;

  constructor(config: TeamsConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    await this.getAccessToken();
  }

  async stop(): Promise<void> {}

  async send(userId: string, content: string | Message): Promise<void> {
    const text = typeof content === 'string' ? content : content.content;
    console.log(`Sending to Teams user ${userId}: ${text}`);
  }

  formatForChannel(message: string, _ctx: SkillContext): string {
    return message;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    const response = await fetch(`https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.appId,
        client_secret: this.config.appPassword,
        scope: 'https://api.botframework.com/.default',
      }),
    });

    const data = await response.json() as { access_token: string };
    this.accessToken = data.access_token;
    return this.accessToken!;
  }
}
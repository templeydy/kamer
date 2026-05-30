import type { SkillContext, Message } from '../core/types';

export abstract class ChannelAdapter {
  abstract platform: 'terminal' | 'feishu' | 'wecom' | 'dingtalk' | 'teams' | 'discord' | 'slack';

  protected messageHandler?: (ctx: SkillContext) => Promise<void>;

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(userId: string, content: string | Message): Promise<void>;

  formatForChannel(message: string, _ctx: SkillContext): string {
    return message;
  }

  onMessage(handler: (ctx: SkillContext) => Promise<void>): void {
    this.messageHandler = handler;
  }

  protected async handleIncomingMessage(ctx: SkillContext): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(ctx);
    }
  }
}
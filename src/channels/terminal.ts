import readline from 'readline';
import { ChannelAdapter } from './base';
import type { SkillContext } from '../core/types';

export class TerminalChannel extends ChannelAdapter {
  platform = 'terminal' as const;
  private rl?: readline.Interface;
  private userId = 'terminal-user';

  async start(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.log('Terminal channel started. Type your messages:');
  }

  async stop(): Promise<void> {
    this.rl?.close();
  }

  async send(_userId: string, content: string | Message): Promise<void> {
    const text = typeof content === 'string' ? content : content.content;
    console.log(`\nAssistant: ${text}\n`);
  }

  async promptUser(): Promise<string> {
    return new Promise((resolve) => {
      this.rl?.question('You: ', (answer) => {
        resolve(answer);
      });
    });
  }

  formatForChannel(message: string, _ctx: SkillContext): string {
    return message;
  }

  async startConversation(messageHandler: (ctx: SkillContext) => Promise<void>): Promise<void> {
    this.onMessage(messageHandler);
    await this.start();

    while (true) {
      const input = await this.promptUser();
      if (!input || input.toLowerCase() === 'exit') {
        await this.stop();
        break;
      }

      const ctx: SkillContext = {
        agentId: '',
        userId: this.userId,
        channel: this.platform,
        message: input,
        metadata: {},
      };

      await this.handleIncomingMessage(ctx);
    }
  }
}
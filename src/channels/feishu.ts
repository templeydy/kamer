import { ChannelAdapter } from './base';
import type { SkillContext, Message } from '../core/types';
import { Client, EventDispatcher, WSClient } from '@larksuiteoapi/node-sdk';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  webhookUrl?: string;
}

export class FeishuChannel extends ChannelAdapter {
  platform = 'feishu' as const;
  private config: FeishuConfig;
  private client?: Client;
  private wsClient?: WSClient;
  private eventDispatcher?: EventDispatcher;
  private processedEvents = new Set<string>();

  constructor(config: FeishuConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    this.client = new Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    });

    // Create event dispatcher
    this.eventDispatcher = new EventDispatcher({
      appID: this.config.appId,
      appSecret: this.config.appSecret,
      logger: console,
    });

    // Register message handler
    this.eventDispatcher.register({
      'im.message.receive_v1': async (data: any) => {
        console.log('Feishu message received:', JSON.stringify(data));
        await this.handleMessage(data);
      },
    });

    // Create WSClient with EventDispatcher for WebSocket connection
    this.wsClient = new WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      eventDispatcher: this.eventDispatcher,
      logger: console,
    });

    // Start WebSocket connection
    this.wsClient.start({ eventDispatcher: this.eventDispatcher });
    console.log('Feishu WebSocket SDK connected');
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      // WSClient doesn't have a stop method, but we can terminate the connection
      const wsInstance = (this.wsClient as any).wsConfig?.getWSInstance?.();
      if (wsInstance) {
        wsInstance.terminate();
      }
    }
  }

  async send(userId: string, content: string | Message): Promise<void> {
    let text = typeof content === 'string' ? content : content.content;

    if (this.client) {
      try {
        const receiveIdType = userId.startsWith('ou_') ? 'open_id' : 'user_id';
        // 转换 markdown 为 Feishu 兼容格式
        text = this.renderMarkdown(text);
        await this.client.im.message.create({
          params: { receive_id_type: receiveIdType },
          data: {
            receive_id: userId,
            msg_type: 'interactive',
            content: JSON.stringify({
              elements: [
                {
                  tag: 'markdown',
                  content: text,
                },
              ],
            }),
          },
        });
      } catch (e) {
        console.error('Failed to send Feishu message:', e);
      }
    }
  }

  private renderMarkdown(text: string): string {
    // 转换 markdown 标题为粗体
    text = text.replace(/^#+\s+(.+)$/gm, '**$1**');
    // 转换列表
    text = text.replace(/^[-*]\s+(.+)$/gm, '• $1');
    // 转换代码块
    text = text.replace(/```([\s\S]*?)```/g, '<code>$1</code>');
    // 转换行内代码
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    return text;
  }

  // 在消息上添加思考反应（快捷表情）
  async showThinking(messageId: string): Promise<string | undefined> {
    if (!this.client) return;
    try {
      const reactionId = await this.client.im.message.addReaction(messageId, '🤔');
      return reactionId;
    } catch (e) {
      console.error('Failed to add reaction:', e);
      return;
    }
  }

  // 移除思考反应
  async clearThinking(messageId: string, reactionId?: string): Promise<void> {
    if (!this.client) return;
    try {
      if (reactionId) {
        await this.client.im.message.removeReaction(messageId, reactionId);
      } else {
        // 如果没有 reactionId，用 emoji 类型删除
        await this.client.im.message.removeReactionByEmoji(messageId, '🤔');
      }
    } catch (e) {
      console.error('Failed to remove reaction:', e);
    }
  }

  formatForChannel(message: string, _ctx: SkillContext): string {
    return message;
  }

  private async handleMessage(data: any): Promise<void> {
    // 去重：检查 event_id 是否已处理
    const eventId = data.event_id;
    if (eventId && this.processedEvents.has(eventId)) {
      return;
    }
    if (eventId) {
      this.processedEvents.add(eventId);
      // 清理旧事件（保留最近 100 个）
      if (this.processedEvents.size > 100) {
        const oldEvents = Array.from(this.processedEvents).slice(0, 50);
        oldEvents.forEach(e => this.processedEvents.delete(e));
      }
    }

    const messageContent = data.message?.content;
    if (!messageContent) return;

    // Parse message content (it's JSON string)
    let text = messageContent;
    try {
      const parsed = JSON.parse(messageContent);
      text = parsed.text || messageContent;
    } catch {}

    const ctx: SkillContext = {
      agentId: '',
      userId: data.sender?.sender_id?.open_id || data.sender?.sender_id?.user_id || 'unknown',
      channel: this.platform,
      message: text,
      metadata: {
        messageId: data.message?.message_id,
        chatId: data.chat_id,
      },
    };

    await this.handleIncomingMessage(ctx);
  }
}
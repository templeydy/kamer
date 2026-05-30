import { describe, it, expect } from 'vitest';
import { FeishuChannel } from './feishu';

describe('FeishuChannel', () => {
  it('should create feishu channel instance', () => {
    const channel = new FeishuChannel({
      appId: 'test-app-id',
      appSecret: 'test-app-secret',
      webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
    });
    expect(channel).toBeDefined();
    expect(channel.platform).toBe('feishu');
  });
});
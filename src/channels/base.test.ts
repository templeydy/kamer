import { describe, it, expect } from 'vitest';
import { ChannelAdapter } from './base';

describe('ChannelAdapter', () => {
  it('should define platform', () => {
    class TestChannel extends ChannelAdapter {
      platform = 'terminal' as const;
      async start() {}
      async stop() {}
      async send() {}
      formatForChannel() { return ''; }
    }
    const channel = new TestChannel();
    expect(channel.platform).toBe('terminal');
  });
});
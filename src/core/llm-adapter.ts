import type { ChatOptions, LLMResponse, Message, StreamChunk } from './types';

export interface LLMConfig {
  model: string;  // 支持自定义模型名称
  apiKey?: string;
  baseUrl?: string;  // 自定义 API 地址
}

export class LLMAdapter {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * 自动检测 provider 基于 baseUrl
   */
  private detectProvider(): string {
    const baseUrl = this.config.baseUrl || '';
    if (baseUrl.includes('anthropic')) return 'anthropic';
    if (baseUrl.includes('x.ai')) return 'xai';
    if (baseUrl.includes('openai')) return 'openai';
    return 'openai-compatible';
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<LLMResponse> {
    console.log('[DEBUG] chat() called, model:', this.config.model, 'baseUrl:', this.config.baseUrl);

    // 如果配置了 baseUrl，优先使用 baseUrl 检测 provider
    if (this.config.baseUrl) {
      const provider = this.detectProvider();
      if (provider === 'anthropic') {
        return this.chatAnthropic(messages, options);
      }
      if (provider === 'xai') {
        return this.chatXAI(messages, options);
      }
      return this.chatOpenAICompatible(messages, options);
    }

    switch (this.config.model) {
      case 'claude':
        return this.chatAnthropic(messages, options);
      case 'openai':
        return this.chatOpenAI(messages, options);
      case 'xai':
      case 'grok':
        return this.chatXAI(messages, options);
      case 'ollama':
        return this.chatOllama(messages, options);
      default:
        throw new Error(`Unsupported model: ${this.config.model}`);
    }
  }

  async streamChat(
    messages: Message[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void | Promise<void>
  ): Promise<LLMResponse> {
    console.log('[DEBUG] streamChat() called, model:', this.config.model, 'baseUrl:', this.config.baseUrl);

    // 如果配置了 baseUrl，优先使用 baseUrl 检测 provider
    if (this.config.baseUrl) {
      const provider = this.detectProvider();
      if (provider === 'anthropic') {
        throw new Error('Anthropic streaming not yet supported');
      }
      if (provider === 'xai') {
        return this.streamChatXAI(messages, options, onChunk);
      }
      return this.streamChatOpenAICompatible(messages, options, onChunk);
    }

    switch (this.config.model) {
      case 'xai':
      case 'grok':
        return this.streamChatXAI(messages, options, onChunk);
      case 'openai':
        return this.streamChatOpenAICompatible(messages, options, onChunk);
      default:
        throw new Error(`Streaming not supported for model: ${this.config.model}`);
    }
  }

  private async chatOpenAICompatible(messages: Message[], options?: ChatOptions): Promise<LLMResponse> {
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    console.log('[DEBUG] apiKey present:', !!apiKey, 'baseUrl:', this.config.baseUrl);
    if (!apiKey) throw new Error('API_KEY not set');

    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    // 构建消息列表
    const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: chatMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    let content = data.choices[0].message.content;
    // 过滤掉思考标签 (MiniMax 等模型会返回 <result>think...</result>)
    content = content.replace(/<[^>]*think[^>]*>[\s\S]*?<\/[^>]*>/gi, '');
    content = content.replace(/<think>[\s\S]*?/gi, '');
    return {
      content: content.trim(),
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  private async chatAnthropic(messages: Message[], options?: ChatOptions): Promise<LLMResponse> {
    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6-20250501',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        system: options?.systemPrompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json() as {
      content: { text: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      content: data.content[0].text,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }

  private async chatOpenAI(messages: Message[], options?: ChatOptions): Promise<LLMResponse> {
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const baseUrl = this.config.baseUrl || 'https://api.openai.com';

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        system_message: options?.systemPrompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }

  private async chatOllama(messages: Message[], options?: ChatOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as {
      message: { content: string };
    };
    return {
      content: data.message.content,
    };
  }

  private async chatXAI(messages: Message[], options?: ChatOptions): Promise<LLMResponse> {
    const apiKey = this.config.apiKey || process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('XAI_API_KEY not set');

    const baseUrl = this.config.baseUrl || 'https://api.x.ai/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'grok-3',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`xAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  // ============================================
  // SSE Streaming Support
  // ============================================

  private async streamChatOpenAICompatible(
    messages: Message[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void | Promise<void>
  ): Promise<LLMResponse> {
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('API_KEY not set');

    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: chatMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    await this.parseSSE(response, onChunk);

    // Return a summary response (actual content delivered via onChunk callbacks)
    return {
      content: '',  // Content delivered via streaming callbacks
      usage: undefined,
    };
  }

  private async streamChatXAI(
    messages: Message[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void | Promise<void>
  ): Promise<LLMResponse> {
    const apiKey = this.config.apiKey || process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('XAI_API_KEY not set');

    const baseUrl = this.config.baseUrl || 'https://api.x.ai/v1';

    const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'grok-3',
        messages: chatMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`xAI API error: ${response.status} - ${error}`);
    }

    await this.parseSSE(response, onChunk);

    return {
      content: '',  // Content delivered via streaming callbacks
      usage: undefined,
    };
  }

  private async parseSSE(
    response: Response,
    onChunk: (chunk: StreamChunk) => void | Promise<void>
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const chunk = this.parseOpenAIChunk(parsed);
            if (chunk) await onChunk(chunk);
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  private parseOpenAIChunk(data: any): StreamChunk | null {
    // OpenAI-compatible chunk format
    if (data.choices?.[0]?.delta?.content) {
      return {
        type: 'text',
        content: data.choices[0].delta.content,
      };
    }

    // Tool calls
    if (data.choices?.[0]?.delta?.tool_calls) {
      const toolCall = data.choices[0].delta.tool_calls[0];
      return {
        type: 'tool_call',
        content: '',
        toolName: toolCall?.function?.name,
        toolArgs: toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {},
      };
    }

    return null;
  }

  async embeddings(text: string): Promise<number[]> {
    throw new Error('Not implemented');
  }
}
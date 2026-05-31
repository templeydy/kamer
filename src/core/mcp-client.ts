import { spawn, ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import type { MCPConfig, MCPServer, MCPtool } from './types';
import type { EmbeddingService } from './embedding';

export class MCPClient {
  private servers: Map<string, MCPServer> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  async addServer(configPath: string): Promise<void> {
    const config: MCPConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    await this.startServer(config);
  }

  async startServer(config: MCPConfig): Promise<void> {
    const server: MCPServer = {
      id: config.id,
      config,
      tools: [],
      status: 'disconnected',
    };

    this.servers.set(config.id, server);

    return new Promise((resolve, reject) => {
      const proc = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.processes.set(config.id, proc);
      server.status = 'connected';

      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {},
          clientInfo: {
            name: 'kamer',
            version: '0.1.0',
          },
        },
      };

      proc.stdin.write(JSON.stringify(initRequest) + '\n');

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.result?.tools) {
              server.tools = msg.result.tools as MCPtool[];
            }
          } catch {}
        }
      });

      proc.on('error', () => {
        server.status = 'error';
      });

      proc.on('exit', () => {
        server.status = 'disconnected';
      });

      resolve();
    });
  }

  async stopServer(serverId: string): Promise<void> {
    const proc = this.processes.get(serverId);
    if (proc) {
      proc.kill();
      this.processes.delete(serverId);
    }
    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'disconnected';
    }
  }

  listServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId);
  }

  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const proc = this.processes.get(serverId);
    if (!proc) {
      throw new Error(`Server ${serverId} not running`);
    }

    return new Promise((resolve, reject) => {
      const id = Date.now();
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      };

      const timeout = setTimeout(() => {
        reject(new Error('Tool call timeout'));
      }, 30000);

      const handler = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.id === id && msg.result) {
              clearTimeout(timeout);
              proc.stdout?.removeListener('data', handler);
              resolve(msg.result);
            }
          } catch {}
        }
      };

      proc.stdout?.on('data', handler);
      proc.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  async prepareEmbeddings(embeddingService: EmbeddingService): Promise<void> {
    const servers = this.listServers();
    const toolDescriptions: { serverId: string; tool: MCPtool }[] = [];
    for (const server of servers) {
      for (const tool of server.tools) {
        toolDescriptions.push({ serverId: server.id, tool });
      }
    }
    if (toolDescriptions.length === 0) return;
    const texts = toolDescriptions.map(t => `${t.tool.name}: ${t.tool.description}`);
    const vectors = await embeddingService.embedBatch(texts);
    toolDescriptions.forEach((t, index) => {
      t.tool.embedding = vectors[index];
    });
  }

  async retrieveTopTools(
    query: string,
    embeddingService: EmbeddingService,
    k: number
  ): Promise<{ serverId: string; tool: MCPtool; score: number }[]> {
    const servers = this.listServers();
    const toolsWithServer: { serverId: string; tool: MCPtool; embedding?: number[] }[] = [];
    for (const server of servers) {
      for (const tool of server.tools) {
        if (tool.embedding) {
          toolsWithServer.push({ serverId: server.id, tool, embedding: tool.embedding });
        }
      }
    }
    if (toolsWithServer.length === 0) return [];
    const queryEmbedding = await embeddingService.embed(query);
    const scored = toolsWithServer.map(t => ({
      serverId: t.serverId,
      tool: t.tool,
      score: embeddingService.cosineSimilarity(queryEmbedding, t.embedding!),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
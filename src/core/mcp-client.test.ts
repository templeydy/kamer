import { describe, it, expect } from 'vitest';
import { MCPClient } from './mcp-client';

describe('MCPClient', () => {
  it('should create MCP client', () => {
    const client = new MCPClient();
    expect(client).toBeDefined();
  });

  it('should list no servers when empty', () => {
    const client = new MCPClient();
    const servers = client.listServers();
    expect(servers.length).toBe(0);
  });
});
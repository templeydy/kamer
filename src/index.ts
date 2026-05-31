import { readdirSync } from 'fs';
import { Runtime } from './core/runtime';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createAgentsRouter } from './ui/api/routes/agents';
import { createSkillsRouter } from './ui/api/routes/skills';
import { createMcpRouter } from './ui/api/routes/mcp';
import { createChannelsRouter } from './ui/api/routes/channels';
import { FeishuChannel } from './channels/feishu';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize runtime
const runtime = new Runtime();

// Start channels
await runtime.startChannel('feishu');

// Load agents from agents/ directory
const agentsDir = './agents';
try {
  const entries = readdirSync(agentsDir);
  for (const entry of entries) {
    if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      await runtime.loadAgent(`${agentsDir}/${entry}`);
    }
  }
} catch {}

// Load skills from skills/ directory
runtime.loadSkills('./skills');

// Create API
const api = new Hono();
api.route('/agents', createAgentsRouter(runtime));
api.route('/skills', createSkillsRouter(runtime));
api.route('/mcp', createMcpRouter(runtime));
api.route('/channels', createChannelsRouter(runtime));

// Serve static UI files
api.get('/ui', async (c) => {
  const filePath = join(__dirname, '..', 'ui', 'index.html');
  try {
    const content = readFileSync(filePath);
    return c.body(content, 200, { 'Content-Type': 'text/html' });
  } catch {
    return c.notFound();
  }
});

api.get('/ui/*', async (c) => {
  const path = c.req.path.replace('/ui', '') || '/';
  const filePath = join(__dirname, '..', 'ui', path === '/' ? 'index.html' : path);
  try {
    const content = readFileSync(filePath);
    const contentType = filePath.endsWith('.html') ? 'text/html' : 'text/plain';
    return c.body(content, 200, { 'Content-Type': contentType });
  } catch {
    return c.notFound();
  }
});

// Serve root with UI
api.get('/', async (c) => {
  const filePath = join(__dirname, '..', 'ui', 'index.html');
  try {
    const content = readFileSync(filePath);
    return c.body(content, 200, { 'Content-Type': 'text/html' });
  } catch {
    return c.text('Kamer API');
  }
});

// Feishu webhook endpoint - 只在 WebSocket 不可用时备用
// 当前使用 WebSocket 长连接，webhook 暂不使用
api.post('/webhooks/feishu', async (c) => {
  const body = await c.req.json();
  console.log('Feishu webhook received (unused - via WebSocket):', body);
  return c.json({ success: true, message: 'Using WebSocket mode' });
});

// Start API server
const port = parseInt(process.env.PORT || '3000');
console.log(`Kamer starting on port ${port}`);

serve({
  port,
  fetch: api.fetch,
});

// Start CLI if enabled
if (process.argv.includes('--cli')) {
  const terminal = runtime.getChannel('terminal');
  if (terminal) {
    (terminal as any).startConversation(async (ctx: any) => {
      const agent = runtime.getAgent('minimax-agent');
      if (agent) {
        const response = await agent.processMessage(ctx.userId, ctx.message, ctx.channel);
        await terminal.send(ctx.userId, response);
      }
    });
  }
}
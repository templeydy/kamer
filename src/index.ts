import { readdirSync } from 'fs';
import { Runtime } from './core/runtime';
import { TerminalChannel } from './channels/terminal';
import { serve } from 'hono/bun';
import { Hono } from 'hono';
import { createAgentsRouter } from './ui/api/routes/agents';
import { createSkillsRouter } from './ui/api/routes/skills';
import { createMcpRouter } from './ui/api/routes/mcp';
import { createChannelsRouter } from './ui/api/routes/channels';

// Initialize runtime
const runtime = new Runtime();

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

// Register channels
runtime.registerChannel('terminal', new TerminalChannel());

// Create API
const api = new Hono();
api.route('/agents', createAgentsRouter(runtime));
api.route('/skills', createSkillsRouter(runtime));
api.route('/mcp', createMcpRouter(runtime));
api.route('/channels', createChannelsRouter(runtime));

// Start API server
const port = parseInt(process.env.PORT || '3000');
console.log(`Agent Framework starting on port ${port}`);

serve({
  port,
  fetch: api.fetch,
});

// Start CLI if enabled
if (process.argv.includes('--cli')) {
  const terminal = runtime.getChannel('terminal') as TerminalChannel;
  terminal.startConversation(async (ctx) => {
    const agent = runtime.getAgent('default');
    if (agent) {
      const response = await agent.processMessage(ctx.userId, ctx.message, ctx.channel);
      await terminal.send(ctx.userId, response);
    }
  });
}
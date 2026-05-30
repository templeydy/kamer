import { Hono } from 'hono';
import { agentsRouter } from './routes/agents';
import { skillsRouter } from './routes/skills';
import { mcpRouter } from './routes/mcp';
import { channelsRouter } from './routes/channels';

const app = new Hono();

app.route('/agents', agentsRouter);
app.route('/skills', skillsRouter);
app.route('/mcp', mcpRouter);
app.route('/channels', channelsRouter);

app.get('/', (c) => c.text('Agent Framework API'));

export default app;
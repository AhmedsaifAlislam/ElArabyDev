import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ArenaClient } from './arena-client.js';
import { SessionManager } from './session-manager.js';
import { ALL_TOOLS, getTool, setClients } from './tools.js';
import { ARENA_CONFIG } from './config.js';

const server = new Server(
  {
    name: 'arena-ai-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const sessionManager = new SessionManager(ARENA_CONFIG.session.storageDir);
const arenaClient = new ArenaClient(sessionManager, ARENA_CONFIG);
setClients(arenaClient, sessionManager);

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const headless = process.env.ARENA_HEADLESS !== 'false';
  console.error('[ArenaAI MCP] Initializing browser...');
  await arenaClient.initialize(headless);
  initialized = true;
  console.error('[ArenaAI MCP] Browser initialized');
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }),
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = getTool(name);
  
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    await ensureInitialized();
    const result = await tool.handler(args);
    return result;
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${String(error)}` }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  console.error('[ArenaAI MCP] Starting... (lazy init)');
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('[ArenaAI MCP] Connected via stdio (ready)');
}

main().catch((error) => {
  console.error('[ArenaAI MCP] Fatal error:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.error('[ArenaAI MCP] Shutting down...');
  await arenaClient.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[ArenaAI MCP] Shutting down...');
  await arenaClient.close();
  process.exit(0);
});
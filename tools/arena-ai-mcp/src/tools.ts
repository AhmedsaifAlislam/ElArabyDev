import { type MCPTool, type ArenaChatParams, type ArenaListModelsParams, type ArenaNewChatParams, type ArenaGetHistoryParams } from './types.js';
import { ArenaClient } from './arena-client.js';
import { SessionManager } from './session-manager.js';
import { ArenaChatParamsSchema, ArenaListModelsParamsSchema, ArenaNewChatParamsSchema, ArenaGetHistoryParamsSchema } from './types.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

let arenaClient: ArenaClient;
let sessionManager: SessionManager;

export function setClients(client: ArenaClient, sm: SessionManager): void {
  arenaClient = client;
  sessionManager = sm;
}

function toMCPResult(data: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export const arenaChatTool: MCPTool = {
  name: 'arena_chat',
  description: 'Send a message to arena.ai and get a response. Supports model selection, system prompts, and session management.',
  inputSchema: ArenaChatParamsSchema,
  handler: async (params: unknown): Promise<CallToolResult> => {
    try {
      const validated = ArenaChatParamsSchema.parse(params) as ArenaChatParams;
      const result = await arenaClient.sendMessage(validated);
      return toMCPResult(result);
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const arenaListModelsTool: MCPTool = {
  name: 'arena_list_models',
  description: 'List available AI models on arena.ai',
  inputSchema: ArenaListModelsParamsSchema,
  handler: async (params: unknown): Promise<CallToolResult> => {
    try {
      const validated = ArenaListModelsParamsSchema.parse(params) as ArenaListModelsParams;
      const models = await arenaClient.listModels(validated.refresh);
      return toMCPResult({ models });
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const arenaNewChatTool: MCPTool = {
  name: 'arena_new_chat',
  description: 'Start a new chat session on arena.ai',
  inputSchema: ArenaNewChatParamsSchema,
  handler: async (params: unknown): Promise<CallToolResult> => {
    try {
      const validated = ArenaNewChatParamsSchema.parse(params) as ArenaNewChatParams;
      const sessionId = await arenaClient.ensureSession(validated.sessionId, true);
      return toMCPResult({ sessionId, message: 'New chat session started' });
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const arenaGetHistoryTool: MCPTool = {
  name: 'arena_get_history',
  description: 'Get conversation history for a session',
  inputSchema: ArenaGetHistoryParamsSchema,
  handler: async (params: unknown): Promise<CallToolResult> => {
    try {
      const validated = ArenaGetHistoryParamsSchema.parse(params) as ArenaGetHistoryParams;
      const history = await arenaClient.getHistory(validated.sessionId, validated.limit);
      return toMCPResult({ sessionId: validated.sessionId, history });
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const arenaListSessionsTool: MCPTool = {
  name: 'arena_list_sessions',
  description: 'List all saved chat sessions',
  inputSchema: z.object({}),
  handler: async (): Promise<CallToolResult> => {
    try {
      const sessions = await sessionManager.listSessions();
      return toMCPResult({ sessions });
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const arenaDeleteSessionTool: MCPTool = {
  name: 'arena_delete_session',
  description: 'Delete a chat session',
  inputSchema: z.object({
    sessionId: z.string().describe('Session ID to delete'),
  }),
  handler: async (params: unknown): Promise<CallToolResult> => {
    try {
      const { sessionId } = params as { sessionId: string };
      await sessionManager.deleteSession(sessionId);
      return toMCPResult({ sessionId, message: 'Session deleted' });
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const arenaDebugModelsTool: MCPTool = {
  name: 'arena_debug_models',
  description: 'Debug: Click model selector and dump dropdown options',
  inputSchema: z.object({}),
  handler: async (): Promise<CallToolResult> => {
    try {
      await arenaClient.debugModels();
      return toMCPResult({ message: 'Model debug info logged to console' });
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const arenaDebugPageTool: MCPTool = {
  name: 'arena_debug_page',
  description: 'Debug: Dump page HTML structure to find correct selectors',
  inputSchema: z.object({}),
  handler: async (): Promise<CallToolResult> => {
    try {
      await arenaClient.debugPage();
      return toMCPResult({ message: 'Debug info logged to console' });
    } catch (e) {
      return toMCPResult({ error: String(e) }, true);
    }
  },
};

export const ALL_TOOLS: MCPTool[] = [
  arenaChatTool,
  arenaListModelsTool,
  arenaNewChatTool,
  arenaGetHistoryTool,
  arenaListSessionsTool,
  arenaDeleteSessionTool,
  arenaDebugPageTool,
  arenaDebugModelsTool,
];

export function getTool(name: string): MCPTool | undefined {
  return ALL_TOOLS.find(t => t.name === name);
}
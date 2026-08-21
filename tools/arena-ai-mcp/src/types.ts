import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const ArenaChatParamsSchema = z.object({
  prompt: z.string().min(1).describe('The prompt/message to send to arena.ai'),
  model: z.string().optional().describe('Specific model to use (e.g., "gpt-4", "claude-3-opus", "gemini-1.5-pro")'),
  systemPrompt: z.string().optional().describe('Optional system prompt to prepend'),
  temperature: z.number().min(0).max(2).optional().describe('Temperature for generation'),
  maxTokens: z.number().min(1).max(8192).optional().describe('Maximum tokens in response'),
  stream: z.boolean().optional().default(false).describe('Whether to stream the response'),
  sessionId: z.string().optional().describe('Session ID to continue conversation'),
  newSession: z.boolean().optional().default(false).describe('Start a new chat session'),
});

export const ArenaListModelsParamsSchema = z.object({
  refresh: z.boolean().optional().default(false).describe('Force refresh model list from UI'),
});

export const ArenaNewChatParamsSchema = z.object({
  sessionId: z.string().optional().describe('Optional custom session ID'),
});

export const ArenaGetHistoryParamsSchema = z.object({
  sessionId: z.string().describe('Session ID to retrieve history for'),
  limit: z.number().min(1).max(100).optional().default(20).describe('Number of messages to retrieve'),
});

export type ArenaChatParams = z.infer<typeof ArenaChatParamsSchema>;
export type ArenaListModelsParams = z.infer<typeof ArenaListModelsParamsSchema>;
export type ArenaNewChatParams = z.infer<typeof ArenaNewChatParamsSchema>;
export type ArenaGetHistoryParams = z.infer<typeof ArenaGetHistoryParamsSchema>;

export interface ArenaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
}

export interface ArenaSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ArenaMessage[];
  currentModel?: string;
}

export interface ArenaModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
}

export interface ArenaChatResult {
  text: string;
  model: string;
  sessionId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export type MCPToolResult = CallToolResult;

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (params: unknown) => Promise<CallToolResult>;
}
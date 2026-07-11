import type { McpToolDef } from '../../../../lib/types/mcp';

export interface ToolCallResult {
  status: 'success' | 'warning' | 'error';
  data: unknown;
  errorMessage?: string;
}

export type ToolHandler = (args: Record<string, unknown>) => unknown;

export interface IToolRegistry {
  register: (name: string, definition: McpToolDef, handler: ToolHandler) => void;
  execute: (name: string, args: Record<string, unknown>) => unknown;
  getToolDefinitions: () => McpToolDef[];
  hasTool: (name: string) => boolean;
}

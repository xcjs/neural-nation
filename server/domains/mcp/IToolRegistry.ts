import type { McpToolDef } from '../../../lib/types/mcp';
import type { ToolCallResult, ToolHandler } from './Models/ToolCallResult';
import { Token } from '../ioc/Token';

export interface IToolRegistry {
  register: (name: string, definition: McpToolDef, handler: ToolHandler) => void;
  execute: (name: string, args: Record<string, unknown>) => unknown;
  getToolDefinitions: () => McpToolDef[];
  hasTool: (name: string) => boolean;
}

export const IToolRegistry = new Token<IToolRegistry>('IToolRegistry');

export type { ToolCallResult, ToolHandler };

import type { McpToolDef } from '../../../lib/types/mcp';
import type { IToolRegistry, ToolHandler } from './IToolRegistry';

export class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, ToolHandler>();
  private definitions = new Map<string, McpToolDef>();

  register(name: string, definition: McpToolDef, handler: ToolHandler): void {
    this.tools.set(name, handler);
    this.definitions.set(name, definition);
  }

  execute(name: string, args: Record<string, unknown>): unknown {
    const handler = this.tools.get(name);
    if (!handler)
      throw new Error(`Unknown tool: ${name}`);
    return handler(args);
  }

  getToolDefinitions(): McpToolDef[] {
    return Array.from(this.definitions.values());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}

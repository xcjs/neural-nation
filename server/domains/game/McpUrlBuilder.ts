import process from 'node:process';

export function buildMcpUrl(token: string, origin?: string): string {
  if (origin) {
    return `${origin}/api/mcp/sse?token=${token}`;
  }

  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '3000';

  return `http://${host}:${port}/api/mcp/sse?token=${token}`;
}

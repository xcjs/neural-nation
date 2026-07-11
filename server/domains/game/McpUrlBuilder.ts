import process from 'node:process';

export function buildMcpUrl(token: string): string {
  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

  if (process.env.NODE_ENV === 'production') {
    const domain = process.env.PUBLIC_DOMAIN || 'play.neuralnation.app';
    return `https://${domain}/api/mcp/sse?token=${token}`;
  }

  return `${protocol}://${host}:${port}/api/mcp/sse?token=${token}`;
}

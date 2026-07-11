import { randomBytes } from 'node:crypto';

export function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(32);
  let token = '';
  for (const byte of bytes)
    token += chars[byte % chars.length];
  return token;
}

export function generateTokenPair(): { token: string; publicToken: string } {
  return { token: generateToken(), publicToken: generateToken() };
}

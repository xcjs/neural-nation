import { randomBytes } from 'node:crypto'

const BASE62_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function generateToken(): string {
  const bytes = randomBytes(32)
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += BASE62_CHARSET[bytes[i] % 62]
  }
  return result
}

export function generateTokenPair(): { token: string; publicToken: string } {
  return {
    token: generateToken(),
    publicToken: generateToken(),
  }
}
import { randomBytes } from 'node:crypto'

const BASE62_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function generateToken(): string {
  const bytes = randomBytes(32)
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    const char = BASE62_CHARSET[bytes[i]! % 62]
    result += char ?? '0'
  }
  return result
}

export function generateTokenPair(): { token: string, publicToken: string } {
  return {
    token: generateToken(),
    publicToken: generateToken(),
  }
}

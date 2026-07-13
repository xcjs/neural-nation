import { describe, expect, it } from 'vitest';
import { generateToken, generateTokenPair } from './GameToken';

describe('token generation', () => {
  it('generates a token of reasonable length', () => {
    const token = generateToken();
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token.length).toBeLessThanOrEqual(64);
  });

  it('generates unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    expect(tokens.size).toBe(100);
  });

  it('generates a token pair with distinct token and publicToken', () => {
    const pair = generateTokenPair();
    expect(pair.token).toBeTruthy();
    expect(pair.publicToken).toBeTruthy();
    expect(pair.token).not.toBe(pair.publicToken);
  });

  it('generates unique token pairs', () => {
    const pairs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const pair = generateTokenPair();
      pairs.add(pair.token);
      pairs.add(pair.publicToken);
    }
    expect(pairs.size).toBe(100);
  });
});

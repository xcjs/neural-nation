import { describe, expect, it } from 'vitest';
import { DEPOSIT_PROFILES, resolveProfile, sampleProfile } from './deposit-profiles';

describe('deposit-profiles', () => {
  it('resolves Copper to a porphyry-style profile', () => {
    const p = resolveProfile('Copper');
    expect(p).toBeDefined();
    expect(p!.gradeMin).toBeGreaterThan(0);
    expect(p!.gradeMax).toBeLessThan(1);
    expect(p!.tonnageMin).toBeGreaterThan(1e6);
  });

  it('resolves hyphenated "Copper,Gold" by head match', () => {
    expect(resolveProfile('Copper,Gold')).toBeDefined();
  });

  it('resolves "Iron Oxide" form', () => {
    expect(resolveProfile('Iron Oxide')).toBeDefined();
  });

  it('resolves Coal', () => {
    const p = resolveProfile('Coal');
    expect(p).toBeDefined();
    expect(p!.tonnageMin).toBeGreaterThan(1e6);
  });

  it('returns null for unknown commodity', () => {
    expect(resolveProfile('Unobtainium')).toBeNull();
  });

  it('sampleProfile is deterministic for the same seed', () => {
    const p = DEPOSIT_PROFILES.Copper!;
    const a = sampleProfile(p, 1, 2);
    const b = sampleProfile(p, 1, 2);
    expect(a).toEqual(b);
  });

  it('sampleProfile stays within profile range', () => {
    const p = DEPOSIT_PROFILES.Gold!;
    const s = sampleProfile(p, 35.5, -120.7);
    expect(s.grade).toBeGreaterThanOrEqual(p.gradeMin);
    expect(s.grade).toBeLessThanOrEqual(p.gradeMax);
    expect(s.tonnage).toBeGreaterThanOrEqual(p.tonnageMin);
    expect(s.tonnage).toBeLessThanOrEqual(p.tonnageMax);
  });
});

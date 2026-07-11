import { describe, expect, it } from 'vitest';
import { ELEMENT_BY_ATOMIC_NUMBER, NATURALLY_OCCURRING_ELEMENTS, SYNTHETIC_ELEMENTS } from './elements';

describe('periodic table constants', () => {
  it('has all 118 elements', () => {
    expect(ELEMENT_BY_ATOMIC_NUMBER.size).toBe(118);
  });

  it('iron (26) is naturally occurring', () => {
    const fe = ELEMENT_BY_ATOMIC_NUMBER.get(26);
    expect(fe).toBeDefined();
    expect(fe!.symbol).toBe('Fe');
    expect(fe!.name).toBe('Iron');
  });

  it('has ~92 naturally occurring elements', () => {
    const count = Object.keys(NATURALLY_OCCURRING_ELEMENTS).length;
    expect(count).toBeGreaterThanOrEqual(90);
    expect(count).toBeLessThanOrEqual(95);
  });

  it('has ~26 synthetic elements', () => {
    const count = Object.keys(SYNTHETIC_ELEMENTS).length;
    expect(count).toBeGreaterThanOrEqual(24);
    expect(count).toBeLessThanOrEqual(30);
  });

  it('synthetic elements have zero crustal abundance', () => {
    for (const data of Object.values(SYNTHETIC_ELEMENTS)) {
      expect(data.crustalAbundance).toBe(0);
    }
  });
});

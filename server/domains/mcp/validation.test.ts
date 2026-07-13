import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createGame, executeTool, getDataDir } from '../../../test/helpers';

const result = createGame();
const token = result.token;

afterAll(() => {
  for (const ext of ['', '-shm', '-wal']) {
    try {
      rmSync(resolve(getDataDir(), `${token}.db${ext}`), { force: true });
    }
    catch {
      // ignore
    }
  }
});

describe('validation hardening', () => {
  it('rejects building a tech-gated facility type without the required tech', () => {
    const r = executeTool(token, 'build_facility', { type: 'NuclearReactor', name: 'Reactor', lat: 40, lon: -100, footprint: [{ lat: 40.01, lon: -100.01 }, { lat: 40.01, lon: -99.99 }, { lat: 39.99, lon: -99.99 }, { lat: 39.99, lon: -100.01 }] });
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('requires tech');
    expect(r.errorMessage).toContain('nuclear_power');
  });

  it('allows building a ResearchLab without any tech requirement (chicken-and-egg fix)', () => {
    const r = executeTool(token, 'build_facility', { type: 'ResearchLab', name: 'Lab', lat: 41, lon: -101, footprint: [{ lat: 41.01, lon: -101.01 }, { lat: 41.01, lon: -100.99 }, { lat: 40.99, lon: -100.99 }, { lat: 40.99, lon: -101.01 }] });
    expect(r.status).toBe('success');
  });

  it('allows building a tech-free facility type (Extractor)', () => {
    const r = executeTool(token, 'build_facility', { type: 'Extractor', name: 'Mine', lat: 40, lon: -100, footprint: [{ lat: 40.01, lon: -100.01 }, { lat: 40.01, lon: -99.99 }, { lat: 39.99, lon: -99.99 }, { lat: 39.99, lon: -100.01 }] });
    expect(r.status).toBe('success');
  });

  it('rejects starting research on a nonexistent tech node', () => {
    // facilityId 2 is the Extractor (not a lab)
    const r = executeTool(token, 'start_research', { techNodeId: 'nonexistent_tech', labFacilityId: 2 });
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('Tech node not found');
  });

  it('rejects starting research without a valid lab facility', () => {
    const r = executeTool(token, 'start_research', { techNodeId: 'basic_construction', labFacilityId: 999 });
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('Facility not found');
  });

  it('rejects starting research with a non-lab facility', () => {
    // facilityId 2 is the Extractor (not a ResearchLab)
    const r = executeTool(token, 'start_research', { techNodeId: 'basic_construction', labFacilityId: 2 });
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('not a ResearchLab');
  });

  it('rejects starting research with unmet prerequisites', () => {
    // facilityId 1 is the ResearchLab. Advance ticks to complete construction (4 ticks).
    for (let i = 0; i < 5; i++) {
      executeTool(token, 'get_game_state', {});
    }
    const r = executeTool(token, 'start_research', { techNodeId: 'precision_manufacturing', labFacilityId: 1 });
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('prerequisites not met');
    expect(r.errorMessage).toContain('metallurgy_1');
  });

  it('rejects starting research on a tech that is already in progress', () => {
    // facilityId 1 is the ResearchLab (now Active from the ticks above).
    // Start basic_construction (no prereqs), then try again.
    const r1 = executeTool(token, 'start_research', { techNodeId: 'basic_construction', labFacilityId: 1 });
    expect(r1.status).toBe('success');
    const r2 = executeTool(token, 'start_research', { techNodeId: 'basic_construction', labFacilityId: 1 });
    expect(r2.status).toBe('error');
    expect(r2.errorMessage).toContain('already');
  });
});

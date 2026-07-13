import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { type EventLogEntry, useEventsStore } from '~/stores/events';
import { useGameStore } from '~/stores/game';
import EventFeed from './EventFeed.vue';

function makeEntry(overrides: Partial<EventLogEntry> = {}): EventLogEntry {
  return {
    id: 1,
    tick: 5,
    timestamp: new Date().toISOString(),
    type: 'mcp_call',
    message: 'Test event',
    severity: 'info',
    facilityId: null,
    data: null,
    ...overrides,
  };
}

describe('eventFeed.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const game = useGameStore();
    game.meta = { token: 'test-token', tick: 0, status: 'Active' } as never;
  });

  it('renders the EVENT FEED header', () => {
    const wrapper = mount(EventFeed);
    expect(wrapper.text()).toContain('EVENT FEED');
  });

  it('shows empty state message when no events', () => {
    const wrapper = mount(EventFeed);
    expect(wrapper.text()).toContain('No events yet.');
  });

  it('renders event items with tick prefix and message', async () => {
    const events = useEventsStore();
    events.items = [
      makeEntry({ id: 1, tick: 5, message: 'Facility built', severity: 'info' }),
      makeEntry({ id: 2, tick: 6, message: 'Research started', severity: 'warning' }),
    ];
    await new Promise(r => setTimeout(r, 0));
    const wrapper = mount(EventFeed);
    const text = wrapper.text();
    expect(text).toContain('[T5]');
    expect(text).toContain('Facility built');
    expect(text).toContain('[T6]');
    expect(text).toContain('Research started');
  });

  it('applies severity color classes', async () => {
    const events = useEventsStore();
    events.items = [
      makeEntry({ id: 1, severity: 'critical', message: 'Critical event' }),
      makeEntry({ id: 2, severity: 'warning', message: 'Warning event' }),
      makeEntry({ id: 3, severity: 'info', message: 'Info event' }),
    ];
    await new Promise(r => setTimeout(r, 0));
    const wrapper = mount(EventFeed);
    const html = wrapper.html();
    expect(html).toContain('border-red-500');
    expect(html).toContain('border-amber-500');
    expect(html).toContain('border-cyan-500');
  });

  it('caps the feed at the max event count', async () => {
    const events = useEventsStore();
    for (let i = 0; i < 60; i++)
      events.applyUpdate({ type: 'event_logged', event: makeEntry({ id: i + 1, tick: i }) });
    await new Promise(r => setTimeout(r, 0));
    const wrapper = mount(EventFeed);
    const tickLabels = wrapper.findAll('span').filter(s => s.text().startsWith('[T'));
    expect(tickLabels.length).toBe(50);
    expect(tickLabels[0]!.text()).toContain('[T59]');
  });
});

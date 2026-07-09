import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import EventFeed from './EventFeed.vue'
import { useEventsStore, type EventLogEntry } from '~/stores/events'
import { useGameStore } from '~/stores/game'

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
  }
}

describe('EventFeed.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const game = useGameStore()
    game.meta = { token: 'test-token', tick: 0, status: 'Active' } as never
  })

  it('renders the EVENT FEED header', () => {
    const wrapper = mount(EventFeed)
    expect(wrapper.text()).toContain('EVENT FEED')
  })

  it('shows empty state message when no events', () => {
    const wrapper = mount(EventFeed)
    expect(wrapper.text()).toContain('No events yet.')
  })

  it('renders event items with tick prefix and message', async () => {
    const events = useEventsStore()
    events.items = [
      makeEntry({ id: 1, tick: 5, message: 'Facility built', severity: 'info' }),
      makeEntry({ id: 2, tick: 6, message: 'Research started', severity: 'warning' }),
    ]
    await new Promise(r => setTimeout(r, 0))
    const wrapper = mount(EventFeed)
    const text = wrapper.text()
    expect(text).toContain('[T5]')
    expect(text).toContain('Facility built')
    expect(text).toContain('[T6]')
    expect(text).toContain('Research started')
  })

  it('applies severity color classes', async () => {
    const events = useEventsStore()
    events.items = [
      makeEntry({ id: 1, severity: 'critical', message: 'Critical event' }),
      makeEntry({ id: 2, severity: 'warning', message: 'Warning event' }),
      makeEntry({ id: 3, severity: 'info', message: 'Info event' }),
    ]
    await new Promise(r => setTimeout(r, 0))
    const wrapper = mount(EventFeed)
    const html = wrapper.html()
    expect(html).toContain('border-red-500')
    expect(html).toContain('border-amber-500')
    expect(html).toContain('border-cyan-500')
  })

  it('shows pagination when total > pageSize', async () => {
    const events = useEventsStore()
    events.items = [makeEntry({ id: 1 })]
    events.total = 50
    events.pageSize = 25
    await new Promise(r => setTimeout(r, 0))
    const wrapper = mount(EventFeed)
    const text = wrapper.text()
    expect(text).toContain('PREV')
    expect(text).toContain('NEXT')
    expect(text).toContain('1/2')
  })

  it('disables prev button on first page', async () => {
    const events = useEventsStore()
    events.items = [makeEntry({ id: 1 })]
    events.total = 50
    events.pageSize = 25
    events.page = 0
    await new Promise(r => setTimeout(r, 0))
    const wrapper = mount(EventFeed)
    const prevBtn = wrapper.findAll('button')[0]!
    expect(prevBtn.attributes('disabled')).toBeDefined()
  })

  it('disables next button on last page', async () => {
    const events = useEventsStore()
    events.items = [makeEntry({ id: 1 })]
    events.total = 50
    events.pageSize = 25
    events.page = 1
    await new Promise(r => setTimeout(r, 0))
    const wrapper = mount(EventFeed)
    const nextBtn = wrapper.findAll('button')[1]!
    expect(nextBtn.attributes('disabled')).toBeDefined()
  })
})
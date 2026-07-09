import { defineStore } from 'pinia'
import { ref } from 'vue'
import { $fetch } from 'ofetch'

export interface EventLogEntry {
  id: number
  tick: number
  timestamp: string
  type: string
  message: string
  severity: string
  facilityId: number | null
  data: string | null
}

export const useEventsStore = defineStore('events', () => {
  const items = ref<EventLogEntry[]>([])
  const total = ref(0)
  const page = ref(0)
  const pageSize = ref(25)
  const loading = ref(false)

  async function fetchPage(token: string, p: number = 0) {
    loading.value = true
    try {
      const res = await $fetch<{ items: EventLogEntry[]; totalCount: number }>(
        '/api/mcp/tools/call',
        {
          method: 'POST',
          body: { token, tool: 'get_event_log', args: { limit: pageSize.value, offset: p * pageSize.value } },
        }
      )
      items.value = res.items || []
      total.value = res.totalCount || 0
      page.value = p
    } catch {
      // ignore
    } finally {
      loading.value = false
    }
  }

  function applyUpdate(patch: { type: string; event?: EventLogEntry }) {
    if (patch.type === 'event_logged' && patch.event) {
      items.value.unshift(patch.event)
      total.value++
    }
  }

  function reset() {
    items.value = []
    total.value = 0
    page.value = 0
    loading.value = false
  }

  return { items, total, page, pageSize, loading, fetchPage, applyUpdate, reset }
})
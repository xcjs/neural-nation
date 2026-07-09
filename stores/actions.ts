import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ActionLogEntry {
  id: number
  tick: number
  timestamp: string
  toolName: string
  arguments: string
  resultStatus: string
  resultData: string
  impactTags: string
  stateSnapshot: string
}

export const useActionsStore = defineStore('actions', () => {
  const items = ref<ActionLogEntry[]>([])
  const total = ref(0)
  const page = ref(0)
  const pageSize = ref(25)
  const loading = ref(false)
  const searchQuery = ref('')

  async function fetchPage(token: string, p: number = 0) {
    loading.value = true
    try {
      // Actions are fetched via a dedicated API endpoint (not MCP tool)
      const params = new URLSearchParams({ limit: String(pageSize.value), offset: String(p * pageSize.value) })
      if (searchQuery.value) params.set('search', searchQuery.value)
      const res = await $fetch<{ items: ActionLogEntry[]; totalCount: number }>(
        `/api/game/actions?token=${token}&${params}`
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

  function applyUpdate(patch: { type: string; action?: ActionLogEntry }) {
    if (patch.type === 'action_logged' && patch.action) {
      items.value.unshift(patch.action)
      total.value++
    }
  }

  function reset() {
    items.value = []
    total.value = 0
    page.value = 0
    searchQuery.value = ''
    loading.value = false
  }

  return { items, total, page, pageSize, loading, searchQuery, fetchPage, applyUpdate, reset }
})
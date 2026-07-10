import type { SpaceSummary } from '~/lib/types/space'
import { $fetch } from 'ofetch'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSpaceStore = defineStore('space', () => {
  const status = ref<SpaceSummary | null>(null)
  const loading = ref(false)

  async function fetchStatus(token: string) {
    loading.value = true
    try {
      const res = await $fetch<SpaceSummary>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'get_space_status', args: {} },
      })
      status.value = res
    }
    catch {
      // SSE will update
    }
    finally {
      loading.value = false
    }
  }

  function applyUpdate(patch: { type: string, space?: SpaceSummary }) {
    if (patch.type === 'space_updated' && patch.space) {
      status.value = patch.space
    }
  }

  function reset() {
    status.value = null
    loading.value = false
  }

  return { status, loading, fetchStatus, applyUpdate, reset }
})

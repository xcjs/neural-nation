import type { TransportSummary } from '~/lib/types/transport'
import { $fetch } from 'ofetch'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTransportsStore = defineStore('transports', () => {
  const list = ref<TransportSummary[]>([])
  const loading = ref(false)

  async function fetchList(token: string) {
    loading.value = true
    try {
      const res = await $fetch<{ items: TransportSummary[] }>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'list_transports', args: {} },
      })
      list.value = res.items || []
    }
    catch {
      // SSE will update
    }
    finally {
      loading.value = false
    }
  }

  function applyUpdate(patch: { type: string, transport?: TransportSummary }) {
    if (patch.type === 'transport_built' && patch.transport) {
      const t = patch.transport
      if (!list.value.find(x => x.id === t.id))
        list.value.push(t)
    }
    else if (patch.type === 'transport_demolished') {
      // remove by id
    }
  }

  function reset() {
    list.value = []
    loading.value = false
  }

  return { list, loading, fetchList, applyUpdate, reset }
})

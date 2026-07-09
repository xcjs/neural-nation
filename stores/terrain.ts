import { defineStore } from 'pinia'
import { ref } from 'vue'
import { $fetch } from 'ofetch'
import type { TerrainModification } from '~/lib/types/terrain'

export const useTerrainStore = defineStore('terrain', () => {
  const modifications = ref<TerrainModification[]>([])
  const total = ref(0)
  const page = ref(0)
  const loading = ref(false)

  async function fetchModifications(token: string, p: number = 0) {
    loading.value = true
    try {
      const res = await $fetch<{ items: TerrainModification[]; totalCount: number }>(
        '/api/mcp/tools/call',
        {
          method: 'POST',
          body: { token, tool: 'get_terrain_modifications', args: { limit: 25, offset: p * 25 } },
        }
      )
      modifications.value = res.items || []
      total.value = res.totalCount || 0
      page.value = p
    } catch {
      // ignore
    } finally {
      loading.value = false
    }
  }

  function applyUpdate(patch: { type: string; modification?: TerrainModification }) {
    if (patch.type === 'terrain_modified' && patch.modification) {
      modifications.value.unshift(patch.modification)
      total.value++
    }
  }

  function reset() {
    modifications.value = []
    total.value = 0
    page.value = 0
    loading.value = false
  }

  return { modifications, total, page, loading, fetchModifications, applyUpdate, reset }
})
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { $fetch } from 'ofetch'
import type { FacilitySummary, FacilityDetail } from '~/lib/types/facility'

export const useFacilitiesStore = defineStore('facilities', () => {
  const list = ref<FacilitySummary[]>([])
  const selected = ref<FacilityDetail | null>(null)
  const loading = ref(false)

  async function fetchList(token: string) {
    loading.value = true
    try {
      const res = await $fetch<{ items: FacilitySummary[] }>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'list_facilities', args: {} },
      })
      list.value = res.items || []
    } catch {
      // SSE will update
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(token: string, id: number) {
    try {
      const res = await $fetch<FacilityDetail>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'get_facility_details', args: { facilityId: id } },
      })
      selected.value = res
    } catch {
      // ignore
    }
  }

  function applyUpdate(patch: { type: string; facility?: FacilitySummary | FacilityDetail }) {
    if (patch.type === 'facility_built' && patch.facility) {
      const f = patch.facility as FacilitySummary
      if (!list.value.find(x => x.id === f.id)) list.value.push(f)
    } else if (patch.type === 'facility_updated' && patch.facility) {
      const f = patch.facility as FacilitySummary
      const idx = list.value.findIndex(x => x.id === f.id)
      if (idx >= 0) list.value[idx] = f
    } else if (patch.type === 'facility_demolished') {
      // facility id in patch
    }
  }

  function reset() {
    list.value = []
    selected.value = null
    loading.value = false
  }

  return { list, selected, loading, fetchList, fetchDetail, applyUpdate, reset }
})
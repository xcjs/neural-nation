import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EnvironmentState } from '~/lib/types/humanity'

export const useEnvironmentStore = defineStore('environment', () => {
  const state = ref<EnvironmentState>({
    pollutionLevel: 0,
    forestCoverage: 100,
    waterQuality: 100,
    biodiversity: 100,
  })
  const showPollutionHeatmap = ref(false)
  const showBiomeDegradation = ref(false)

  async function fetchStatus(token: string) {
    try {
      const res = await $fetch<EnvironmentState>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'get_environmental_status', args: {} },
      })
      state.value = res
    } catch {
      // SSE will update
    }
  }

  function applyUpdate(patch: { type: string; environment?: EnvironmentState }) {
    if (patch.type === 'environment_updated' && patch.environment) {
      state.value = patch.environment
    }
  }

  function reset() {
    state.value = { pollutionLevel: 0, forestCoverage: 100, waterQuality: 100, biodiversity: 100 }
    showPollutionHeatmap.value = false
    showBiomeDegradation.value = false
  }

  return { state, showPollutionHeatmap, showBiomeDegradation, fetchStatus, applyUpdate, reset }
})
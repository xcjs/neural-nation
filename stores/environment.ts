import type { EnvironmentState } from '~/lib/types/humanity';
import { $fetch } from 'ofetch';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useEnvironmentStore = defineStore('environment', () => {
  const state = ref<EnvironmentState>({
    population: {
      count: 0,
      growthRate: 0,
      welfare: 100,
      foodSatisfaction: 100,
      energySatisfaction: 100,
      assignedToSpace: 0,
      trend: 'stable',
    },
    pollutionLevel: 0,
    forestCoverage: 100,
    waterQuality: 100,
    biodiversity: 100,
    pollutionTrend: 'stable',
    forestTrend: 'stable',
    waterTrend: 'stable',
    biodiversityTrend: 'stable',
    activeIncidents: [],
  });
  const showBiomeDegradation = ref(false);

  async function fetchStatus(token: string) {
    try {
      const res = await $fetch<EnvironmentState>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'get_environmental_status', args: {} },
      });
      state.value = res;
    }
    catch {
      // SSE will update
    }
  }

  function applyUpdate(patch: { type: string; environment?: EnvironmentState }) {
    if (patch.type === 'environment_updated' && patch.environment) {
      state.value = patch.environment;
    }
  }

  function reset() {
    state.value = {
      population: {
        count: 0,
        growthRate: 0,
        welfare: 100,
        foodSatisfaction: 100,
        energySatisfaction: 100,
        assignedToSpace: 0,
        trend: 'stable',
      },
      pollutionLevel: 0,
      forestCoverage: 100,
      waterQuality: 100,
      biodiversity: 100,
      pollutionTrend: 'stable',
      forestTrend: 'stable',
      waterTrend: 'stable',
      biodiversityTrend: 'stable',
      activeIncidents: [],
    };
    showBiomeDegradation.value = false;
  }

  return { state, showBiomeDegradation, fetchStatus, applyUpdate, reset };
});

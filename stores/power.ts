import type { PowerGridSummary } from '~/lib/types/power';
import { $fetch } from 'ofetch';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePowerStore = defineStore('power', () => {
  const grid = ref<PowerGridSummary | null>(null);
  const loading = ref(false);

  async function fetchGrid(token: string) {
    loading.value = true;
    try {
      const res = await $fetch<PowerGridSummary>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'get_power_grid_status', args: {} },
      });
      grid.value = res;
    }
    catch {
      // SSE will update
    }
    finally {
      loading.value = false;
    }
  }

  function applyUpdate(patch: { type: string; power?: PowerGridSummary }) {
    if (patch.type === 'power_updated' && patch.power) {
      grid.value = patch.power;
    }
  }

  function reset() {
    grid.value = null;
    loading.value = false;
  }

  return { grid, loading, fetchGrid, applyUpdate, reset };
});

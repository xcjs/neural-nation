import type { ResourceCategory, ResourceOverviewRow } from '~/lib/types/resource';
import { $fetch } from 'ofetch';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useResourcesStore = defineStore('resources', () => {
  const rows = ref<ResourceOverviewRow[]>([]);
  const loading = ref(false);

  async function fetchOverview(token: string) {
    loading.value = true;
    try {
      const res = await $fetch<{ items: ResourceOverviewRow[] }>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'get_resource_overview', args: {} },
      });
      rows.value = res.items || [];
    }
    catch {
      // Will be populated via SSE
    }
    finally {
      loading.value = false;
    }
  }

  function applyUpdate(patch: Partial<{ rows: ResourceOverviewRow[] }>) {
    if (patch.rows)
      rows.value = patch.rows;
  }

  function reset() {
    rows.value = [];
    loading.value = false;
  }

  const byCategory = (cat: ResourceCategory) => rows.value.filter(r => r.category === cat);

  return { rows, loading, fetchOverview, applyUpdate, reset, byCategory };
});

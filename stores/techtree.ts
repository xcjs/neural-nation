import { defineStore } from 'pinia'
import { ref } from 'vue'
import { $fetch } from 'ofetch'
import type { TechTreeNode } from '~/lib/types/tech'
import { TechStatus } from '~/lib/types/tech'

export const useTechTreeStore = defineStore('techtree', () => {
  const nodes = ref<TechTreeNode[]>([])
  const loading = ref(false)

  async function fetchTree(token: string) {
    loading.value = true
    try {
      const res = await $fetch<{ items: TechTreeNode[] }>('/api/mcp/tools/call', {
        method: 'POST',
        body: { token, tool: 'get_tech_tree', args: {} },
      })
      nodes.value = res.items || []
    } catch {
      // SSE will update
    } finally {
      loading.value = false
    }
  }

  function applyUpdate(patch: { type: string; node?: TechTreeNode }) {
    if (patch.type === 'research_updated' && patch.node) {
      const idx = nodes.value.findIndex(n => n.id === patch.node!.id)
      if (idx >= 0) nodes.value[idx] = patch.node
    }
  }

  function reset() {
    nodes.value = []
    loading.value = false
  }

  const byStatus = (status: TechStatus) => nodes.value.filter(n => n.status === status)

  return { nodes, loading, fetchTree, applyUpdate, reset, byStatus }
})
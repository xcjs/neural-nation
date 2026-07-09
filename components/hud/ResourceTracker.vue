<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-cyan-400 text-xs font-bold tracking-wider">RESOURCES</h3>
      <input
        v-model="search"
        placeholder="filter..."
        class="w-24 bg-black border border-cyan-900 px-2 py-0.5 text-cyan-300 text-xs"
      />
    </div>

    <div v-for="cat in categories" :key="cat.key" class="mb-2">
      <button
        @click="toggle(cat.key)"
        class="w-full text-left text-xs font-bold py-0.5"
        :class="cat.color"
      >
        {{ cat.label }} <span class="text-cyan-700">({{ filtered(cat.key).length }})</span>
        <span class="float-right">{{ collapsed[cat.key] ? '▾' : '▴' }}</span>
      </button>
      <div v-if="!collapsed[cat.key]" class="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
        <div
          v-for="row in filtered(cat.key)"
          :key="row.resourceKey"
          class="flex items-center gap-2 py-0.5 px-1 hover:bg-cyan-950/50 cursor-pointer text-xs"
          @click="ui.selectResource(row.resourceKey)"
        >
          <span class="flex-1 text-cyan-300 truncate">{{ row.name }}</span>
          <span v-if="row.trend === 'up'" class="text-green-400">▲</span>
          <span v-else-if="row.trend === 'down'" class="text-red-400">▼</span>
          <span v-else class="text-cyan-700">●</span>
          <span class="text-cyan-500 w-20 text-right">{{ formatQty(row.collected) }}/{{ formatQty(row.total) }}{{ row.unit }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useResourcesStore } from '~/stores/resources'
import { useUiStore } from '~/stores/ui'
import { ResourceCategory } from '~/lib/types/resource'

const resources = useResourcesStore()
const ui = useUiStore()
const search = ref('')
const collapsed = ref<Record<string, boolean>>({})

const categories = [
  { key: ResourceCategory.Renewable, label: 'RENEWABLE', color: 'text-green-400' },
  { key: ResourceCategory.NonRenewable, label: 'NON-RENEWABLE', color: 'text-amber-400' },
  { key: ResourceCategory.Element, label: 'ELEMENTS', color: 'text-blue-400' },
  { key: ResourceCategory.Manufactured, label: 'MANUFACTURED', color: 'text-purple-400' },
]

function filtered(cat: ResourceCategory) {
  const q = search.value.toLowerCase()
  return resources.byCategory(cat).filter(r =>
    !q || r.name.toLowerCase().includes(q) || r.resourceKey.toLowerCase().includes(q)
  )
}

function toggle(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}

function formatQty(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'G'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return n.toFixed(0)
}
</script>
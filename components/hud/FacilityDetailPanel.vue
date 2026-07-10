<script setup lang="ts">
import { computed } from 'vue'
import { useFacilitiesStore } from '~/stores/facilities'

const facilities = useFacilitiesStore()

const statusColor = computed(() => {
  const s = facilities.selected?.status
  switch (s) {
    case 'Active': return 'text-green-400'
    case 'UnderConstruction': return 'text-amber-400'
    case 'Idle': return 'text-cyan-500'
    case 'Damaged': return 'text-orange-400'
    case 'Destroyed': return 'text-red-400'
    default: return 'text-cyan-500'
  }
})
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      FACILITY DETAIL
    </h3>
    <div v-if="!facilities.selected" class="text-cyan-700 text-xs">
      No facility selected.
    </div>
    <div v-else class="space-y-1 text-xs">
      <div class="flex justify-between">
        <span class="text-cyan-700">Type:</span><span class="text-cyan-300">{{ facilities.selected.type }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Status:</span><span :class="statusColor">{{ facilities.selected.status }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Location:</span><span class="text-cyan-300">{{ facilities.selected.lat.toFixed(2) }}, {{ facilities.selected.lon.toFixed(2) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Recipe:</span><span class="text-cyan-300">{{ facilities.selected.activeRecipeId || '—' }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Power:</span><span :class="facilities.selected.powerConnected ? 'text-green-400' : 'text-red-400'">{{ facilities.selected.powerConnected ? 'Connected' : 'Disconnected' }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Throughput:</span><span class="text-cyan-300">{{ facilities.selected.throughput.toFixed(1) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Elevation:</span><span class="text-cyan-300">{{ facilities.selected.elevation.toFixed(0) }}m</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Terrain:</span><span class="text-cyan-300">{{ facilities.selected.terrainClass }}</span>
      </div>
      <div v-if="facilities.selected.status === 'UnderConstruction'" class="mt-1">
        <div class="text-cyan-700 mb-0.5">
          Construction: {{ (facilities.selected.constructionProgress * 100).toFixed(0) }}%
        </div>
        <div class="w-full h-1 bg-cyan-950">
          <div class="h-1 bg-cyan-400" :style="{ width: `${facilities.selected.constructionProgress * 100}%` }" />
        </div>
      </div>
      <div v-if="facilities.selected.inputs.length > 0" class="mt-2">
        <p class="text-cyan-500 font-bold mb-0.5">
          INPUTS
        </p>
        <div v-for="buf in facilities.selected.inputs" :key="buf.resourceKey" class="flex justify-between">
          <span class="text-cyan-300">{{ buf.resourceKey }}</span>
          <span class="text-cyan-500">{{ buf.quantity.toFixed(1) }}/{{ buf.capacity }}{{ buf.unit }}</span>
        </div>
      </div>
      <div v-if="facilities.selected.outputs.length > 0" class="mt-1">
        <p class="text-cyan-500 font-bold mb-0.5">
          OUTPUTS
        </p>
        <div v-for="buf in facilities.selected.outputs" :key="buf.resourceKey" class="flex justify-between">
          <span class="text-cyan-300">{{ buf.resourceKey }}</span>
          <span class="text-cyan-500">{{ buf.quantity.toFixed(1) }}/{{ buf.capacity }}{{ buf.unit }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

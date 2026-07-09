<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">POWER GRID</h3>
    <div v-if="!power.grid" class="text-cyan-700 text-xs">No power grid data.</div>
    <div v-else class="space-y-1 text-xs">
      <div class="flex justify-between"><span class="text-cyan-700">Status:</span><span :class="gridStatusColor">{{ power.grid.status }}</span></div>
      <div class="flex justify-between"><span class="text-cyan-700">Capacity:</span><span class="text-cyan-300">{{ power.grid.totalCapacity.toFixed(0) }} MW</span></div>
      <div class="flex justify-between"><span class="text-cyan-700">Demand:</span><span class="text-cyan-300">{{ power.grid.totalDemand.toFixed(0) }} MW</span></div>
      <div class="flex justify-between"><span class="text-cyan-700">Grids:</span><span class="text-cyan-300">{{ power.grid.connectedGrids.length }}</span></div>
      <div v-if="power.grid.lines && power.grid.lines.length > 0" class="mt-2">
        <p class="text-cyan-500 font-bold mb-0.5">LINES</p>
        <div v-for="line in power.grid.lines" :key="line.id" class="flex justify-between">
          <span class="text-cyan-300">#{{ line.id }}</span>
          <span class="text-cyan-500">{{ line.load.toFixed(1) }}/{{ line.capacity }}MW ({{ line.transmissionLoss.toFixed(1) }}% loss)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePowerStore } from '~/stores/power'
import { GridStatus } from '~/lib/types/power'

const power = usePowerStore()

const gridStatusColor = computed(() => {
  switch (power.grid?.status) {
    case GridStatus.Normal: return 'text-green-400'
    case GridStatus.Brownout: return 'text-amber-400'
    case GridStatus.Blackout: return 'text-red-400'
    default: return 'text-cyan-500'
  }
})
</script>
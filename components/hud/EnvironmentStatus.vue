<script setup lang="ts">
import { computed } from 'vue';
import { useEnvironmentStore } from '~/stores/environment';

const env = useEnvironmentStore();

const metrics = computed(() => [
  {
    label: 'Pollution',
    value: `${env.state.pollutionLevel.toFixed(0)}%`,
    trend: env.state.pollutionLevel > 50 ? 'up' : 'down',
    color: env.state.pollutionLevel > 70 ? 'text-red-400' : env.state.pollutionLevel > 30 ? 'text-amber-400' : 'text-green-400',
  },
  {
    label: 'Forest Cover',
    value: `${env.state.forestCoverage.toFixed(0)}%`,
    trend: env.state.forestCoverage < 50 ? 'down' : 'stable',
    color: env.state.forestCoverage < 30 ? 'text-red-400' : env.state.forestCoverage < 60 ? 'text-amber-400' : 'text-green-400',
  },
  {
    label: 'Water Quality',
    value: `${env.state.waterQuality.toFixed(0)}%`,
    trend: env.state.waterQuality < 50 ? 'down' : 'stable',
    color: env.state.waterQuality < 30 ? 'text-red-400' : env.state.waterQuality < 60 ? 'text-amber-400' : 'text-green-400',
  },
  {
    label: 'Biodiversity',
    value: `${env.state.biodiversity.toFixed(0)}%`,
    trend: env.state.biodiversity < 50 ? 'down' : 'stable',
    color: env.state.biodiversity < 30 ? 'text-red-400' : env.state.biodiversity < 60 ? 'text-amber-400' : 'text-green-400',
  },
]);
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      ENVIRONMENT
    </h3>
    <div class="space-y-1 text-xs">
      <div v-for="m in metrics" :key="m.label" class="flex items-center justify-between">
        <span class="text-cyan-500">{{ m.label }}</span>
        <div class="flex items-center gap-1">
          <span :class="m.color">{{ m.value }}</span>
          <span v-if="m.trend === 'up'" class="text-green-400">▲</span>
          <span v-else-if="m.trend === 'down'" class="text-red-400">▼</span>
        </div>
      </div>
    </div>
    <div class="mt-2 flex gap-1">
      <button
        class="text-xs px-2 py-0.5 border" :class="[env.showBiomeDegradation ? 'border-green-500 text-green-300' : 'border-cyan-900 text-cyan-700']"
        @click="env.showBiomeDegradation = !env.showBiomeDegradation"
      >
        BIOME MAP
      </button>
    </div>
  </div>
</template>

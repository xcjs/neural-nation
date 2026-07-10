<script setup lang="ts">
import { useTerrainStore } from '~/stores/terrain'

const terrain = useTerrainStore()
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      TERRAIN MODIFICATIONS
    </h3>
    <div class="space-y-1 max-h-64 overflow-y-auto">
      <div
        v-for="m in terrain.modifications"
        :key="m.id"
        class="text-xs py-0.5 px-1 border-l-2 border-orange-500 text-orange-300"
      >
        <span class="text-cyan-700">[T{{ m.modifiedAtTick }}]</span>
        <span class="text-cyan-300 ml-1">{{ m.reason }}</span>
        <span class="text-cyan-700 ml-1">({{ m.latIndex }},{{ m.lonIndex }})</span>
      </div>
      <div v-if="terrain.modifications.length === 0" class="text-cyan-700 text-xs">
        No terrain modifications.
      </div>
    </div>
  </div>
</template>

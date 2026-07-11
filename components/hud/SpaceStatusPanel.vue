<script setup lang="ts">
import { useSpaceStore } from '~/stores/space';

const space = useSpaceStore();
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      SPACE PROGRAM
    </h3>
    <div v-if="!space.status" class="text-cyan-700 text-xs">
      No space infrastructure.
    </div>
    <div v-else class="space-y-1 text-xs">
      <div v-if="space.status.facilities && space.status.facilities.length > 0" class="space-y-1">
        <p class="text-cyan-500 font-bold">
          FACILITIES
        </p>
        <div v-for="f in space.status.facilities" :key="f.id" class="flex justify-between">
          <span class="text-cyan-300">{{ f.type }}</span>
          <span :class="f.status === 'Active' ? 'text-green-400' : 'text-amber-400'">{{ f.status }}</span>
        </div>
      </div>
      <div v-if="space.status.missions && space.status.missions.length > 0" class="space-y-1 mt-2">
        <p class="text-cyan-500 font-bold">
          MISSIONS
        </p>
        <div v-for="m in space.status.missions" :key="m.id" class="flex justify-between">
          <span class="text-cyan-300">{{ m.type }} → {{ m.target }}</span>
          <span :class="m.status === 'Complete' ? 'text-green-400' : 'text-cyan-500'">{{ m.status }}</span>
        </div>
      </div>
      <div v-if="!space.status.facilities?.length && !space.status.missions?.length" class="text-cyan-700 text-xs">
        No space infrastructure or missions.
      </div>
    </div>
  </div>
</template>

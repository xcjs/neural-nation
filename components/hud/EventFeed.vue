<script setup lang="ts">
import { useEventsStore } from '~/stores/events';

const events = useEventsStore();

function severityColor(sev: string): string {
  switch (sev) {
    case 'critical': return 'border-red-500 text-red-300';
    case 'warning': return 'border-amber-500 text-amber-300';
    case 'info': return 'border-cyan-500 text-cyan-300';
    default: return 'border-cyan-900 text-cyan-500';
  }
}
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      EVENT FEED
    </h3>
    <div class="space-y-1 max-h-64 overflow-y-auto">
      <div
        v-for="e in events.items"
        :key="e.id"
        class="text-xs py-0.5 px-1 border-l-2"
        :class="severityColor(e.severity)"
      >
        <span class="text-cyan-700">[T{{ e.tick }}]</span>
        <span class="text-cyan-300 ml-1">{{ e.message }}</span>
      </div>
      <div v-if="events.items.length === 0" class="text-cyan-700 text-xs">
        No events yet.
      </div>
    </div>
  </div>
</template>

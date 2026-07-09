<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-cyan-400 text-xs font-bold tracking-wider">ACTION CONSOLE</h3>
      <input
        v-model="actions.searchQuery"
        @input="onSearch"
        placeholder="search..."
        class="w-20 bg-black border border-cyan-900 px-2 py-0.5 text-cyan-300 text-xs"
      />
    </div>
    <div class="space-y-1 max-h-64 overflow-y-auto">
      <div
        v-for="a in actions.items"
        :key="a.id"
        class="text-xs py-0.5 px-1 border-l-2"
        :class="statusColor(a.resultStatus)"
      >
        <span class="text-cyan-700">[T{{ a.tick }}]</span>
        <span class="text-cyan-300 ml-1">{{ a.toolName }}</span>
        <span v-if="a.resultStatus === 'error'" class="text-red-400 ml-1">✗</span>
        <span v-if="a.resultStatus === 'success'" class="text-green-400 ml-1">✓</span>
        <span v-if="a.resultStatus === 'warning'" class="text-amber-400 ml-1">⚠</span>
      </div>
      <div v-if="actions.items.length === 0" class="text-cyan-700 text-xs">No actions logged.</div>
    </div>
    <div v-if="actions.total > actions.pageSize" class="flex items-center justify-between mt-2 text-xs">
      <button @click="actions.fetchPage(token, actions.page - 1)" :disabled="actions.page === 0" class="text-cyan-500 disabled:opacity-30">← PREV</button>
      <span class="text-cyan-700">{{ actions.page + 1 }}/{{ Math.ceil(actions.total / actions.pageSize) }}</span>
      <button @click="actions.fetchPage(token, actions.page + 1)" :disabled="(actions.page + 1) * actions.pageSize >= actions.total" class="text-cyan-500 disabled:opacity-30">NEXT →</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useActionsStore } from '~/stores/actions'
import { useGameStore } from '~/stores/game'

const actions = useActionsStore()
const game = useGameStore()
const token = game.meta?.token || ''
let searchTimer: ReturnType<typeof setTimeout> | null = null

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => actions.fetchPage(token, 0), 300)
}

function statusColor(status: string): string {
  switch (status) {
    case 'success': return 'border-green-500 text-green-300'
    case 'warning': return 'border-amber-500 text-amber-300'
    case 'error': return 'border-red-500 text-red-300'
    default: return 'border-cyan-900 text-cyan-500'
  }
}
</script>
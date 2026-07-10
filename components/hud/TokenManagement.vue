<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '~/stores/game'

const game = useGameStore()
const copiedWhich = ref('')
const mcpUrl = computed(() => {
  if (!game.meta || !game.privateToken)
    return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/api/mcp/sse?token=${game.privateToken}`
})
const watchUrl = computed(() => {
  if (!game.meta)
    return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/watch?token=${game.meta.publicToken}`
})

function copy(text: string, which: string) {
  navigator.clipboard.writeText(text)
  copiedWhich.value = which
  setTimeout(() => {
    copiedWhich.value = ''
  }, 2000)
}

function copyBtn(which: string) {
  return copiedWhich.value === which ? 'border-green-500 text-green-300' : ''
}
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      MCP CONNECTION
    </h3>
    <div class="space-y-2 text-xs">
      <div>
        <p class="text-cyan-500 mb-1">
          MCP URL
        </p>
        <div class="flex gap-1 items-center">
          <input :value="mcpUrl" readonly class="flex-1 bg-black border border-cyan-900 px-2 py-1 text-cyan-300 text-xs">
          <button :class="copyBtn('mcp')" class="px-2 py-1 border border-cyan-700 text-cyan-500 text-xs" @click="copy(mcpUrl, 'mcp')">
            COPY
          </button>
        </div>
      </div>
      <div>
        <p class="text-cyan-500 mb-1">
          SPECTATING LINK
        </p>
        <div class="flex gap-1 items-center">
          <input :value="watchUrl" readonly class="flex-1 bg-black border border-cyan-900 px-2 py-1 text-cyan-300 text-xs">
          <button :class="copyBtn('watch')" class="px-2 py-1 border border-cyan-700 text-cyan-500 text-xs" @click="copy(watchUrl, 'watch')">
            COPY
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

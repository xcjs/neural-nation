<script setup lang="ts">
import { $fetch } from 'ofetch'
import { computed, onMounted, ref } from 'vue'
import { DifficultyPreset } from '~/lib/types/game'

const difficulty = ref<DifficultyPreset>(DifficultyPreset.Normal)
const loading = ref(false)
const error = ref('')
const created = ref<{ token: string, publicToken: string, mcpUrl: string } | null>(null)
const copied = ref(false)
const existingGames = ref<Array<{ publicToken: string, difficulty: string }>>([])

const difficulties = [
  { value: DifficultyPreset.Easy, label: 'EASY' },
  { value: DifficultyPreset.Normal, label: 'NORMAL' },
  { value: DifficultyPreset.Hard, label: 'HARD' },
]

const difficultyDescription = computed(() => {
  switch (difficulty.value) {
    case DifficultyPreset.Easy:
      return 'Generous starting resources. Population 500-1000.'
    case DifficultyPreset.Normal:
      return 'Moderate starting resources. Population 300-700.'
    case DifficultyPreset.Hard:
      return 'Minimal starting resources. Population 200-500.'
    default:
      return ''
  }
})

async function createGame() {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch<{ token: string, publicToken: string, mcpUrl: string }>('/api/game/create', {
      method: 'POST',
      body: { difficulty: difficulty.value },
    })
    created.value = res

    sessionStorage.setItem(`nn-private-${res.publicToken}`, res.token)
    const saved = JSON.parse(localStorage.getItem('neural-nation-games') || '[]')
    saved.push({ publicToken: res.publicToken, difficulty: difficulty.value })
    localStorage.setItem('neural-nation-games', JSON.stringify(saved))
    loadExistingTokens()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create game'
  }
  finally {
    loading.value = false
  }
}

function copyUrl() {
  if (!created.value)
    return
  navigator.clipboard.writeText(created.value.mcpUrl)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function loadExistingTokens() {
  const saved = JSON.parse(localStorage.getItem('neural-nation-games') || '[]')
  existingGames.value = saved
}

onMounted(loadExistingTokens)
</script>

<template>
  <div class="min-h-screen bg-black text-cyan-100 font-mono flex flex-col items-center justify-center p-8">
    <div class="max-w-2xl w-full">
      <h1 class="text-4xl font-bold text-cyan-400 mb-2 tracking-wider">
        NEURAL NATION
      </h1>
      <p class="text-cyan-600 mb-8 text-sm">
        Watch an LLM autonomously build an industrial economy on a 3D Earth.
      </p>

      <div v-if="error" class="text-red-400 mb-4 text-sm">
        {{ error }}
      </div>

      <div class="mb-6">
        <label class="block text-cyan-500 text-sm mb-2">DIFFICULTY</label>
        <div class="flex gap-2">
          <button
            v-for="d in difficulties"
            :key="d.value"
            class="px-4 py-2 border transition-colors" :class="[
              difficulty === d.value
                ? 'border-cyan-400 bg-cyan-950 text-cyan-300'
                : 'border-cyan-900 text-cyan-700 hover:border-cyan-700',
            ]"
            @click="difficulty = d.value"
          >
            {{ d.label }}
          </button>
        </div>
        <p class="text-cyan-700 text-xs mt-1">
          {{ difficultyDescription }}
        </p>
      </div>

      <button
        :disabled="loading"
        class="w-full py-3 border border-cyan-400 bg-cyan-950 text-cyan-300 font-bold tracking-wider hover:bg-cyan-900 transition-colors disabled:opacity-50"
        @click="createGame"
      >
        {{ loading ? 'INITIALIZING...' : 'START NEW GAME' }}
      </button>

      <div v-if="created" class="mt-8 border border-cyan-900 p-4 bg-cyan-950 bg-opacity-30">
        <p class="text-cyan-500 text-sm mb-2">
          MCP CONNECTION URL
        </p>
        <div class="flex gap-2 items-center">
          <input
            :value="created.mcpUrl"
            readonly
            class="flex-1 bg-black border border-cyan-900 px-3 py-2 text-cyan-300 text-sm"
          >
          <button
            class="px-3 py-2 border border-cyan-700 text-cyan-500 hover:bg-cyan-950 text-sm"
            @click="copyUrl"
          >
            {{ copied ? 'COPIED' : 'COPY' }}
          </button>
        </div>
        <p class="text-cyan-700 text-xs mt-2">
          Paste this URL into your LLM client (Claude Desktop, Cursor, etc.) as an MCP server.
        </p>
        <NuxtLink
          :to="`/play?token=${created.publicToken}`"
          class="inline-block mt-4 px-4 py-2 border border-cyan-400 text-cyan-300 hover:bg-cyan-900 text-sm"
        >
          ENTER GAME →
        </NuxtLink>
      </div>

      <div v-if="existingGames.length > 0" class="mt-8">
        <p class="text-cyan-700 text-xs mb-2">
          EXISTING GAMES ON THIS SERVER
        </p>
        <div class="flex flex-col gap-1">
          <NuxtLink
            v-for="(g, i) in existingGames"
            :key="i"
            :to="`/watch?token=${g.publicToken}`"
            class="text-cyan-500 hover:text-cyan-300 text-sm truncate"
          >
            → Game #{{ i + 1 }} ({{ g.difficulty }})
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChangelogEntry } from '~/types/changelog';
import { $fetch } from 'ofetch';
import { computed, onMounted, ref } from 'vue';
import Spinner from '~/components/Spinner.vue';

const loading = ref(false);
const error = ref('');
const created = ref<{ token: string; publicToken: string; mcpUrl: string } | null>(null);
const copied = ref(false);
const playMode = ref<'external' | 'Q3B' | 'E2B' | 'E4B'>('external');
const { version } = useRuntimeConfig().public;
const changelog = ref<ChangelogEntry[]>([]);
const changelogOpen = ref(false);

const playUrl = computed(() => {
  if (!created.value)
    return '';
  const base = `/play?token=${created.value.publicToken}`;
  if (playMode.value === 'external')
    return base;
  return `${base}&mode=inbrowser&model=${playMode.value}`;
});

const showMcpUrl = computed(() => created.value && playMode.value === 'external');

onMounted(async () => {
  changelog.value = await $fetch<ChangelogEntry[]>('/api/changelog');
});

async function createGame() {
  loading.value = true;
  error.value = '';
  try {
    const res = await $fetch<{ token: string; publicToken: string; mcpUrl: string }>('/api/game/create', {
      method: 'POST',
    });
    created.value = res;

    sessionStorage.setItem(`nn-private-${res.publicToken}`, res.token);
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create game';
  }
  finally {
    loading.value = false;
  }
}

function copyUrl() {
  if (!created.value)
    return;
  navigator.clipboard.writeText(created.value.mcpUrl);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div class="min-h-screen bg-black text-cyan-100 font-mono flex flex-col items-center justify-center p-8">
    <div class="max-w-2xl w-full">
      <h1 class="text-4xl font-bold text-cyan-400 mb-2 tracking-wider">
        NEURAL NATION
      </h1>
      <p class="text-cyan-600 mb-8 text-sm">
        Can AI make the world a better place? Watch an LLM autonomously build an industrial economy on a 3D Earth.
      </p>

      <div v-if="error" class="text-red-400 mb-4 text-sm">
        {{ error }}
      </div>

      <button
        v-if="!created"
        :disabled="loading"
        class="w-full py-3 border border-cyan-400 bg-cyan-950 text-cyan-300 font-bold tracking-wider hover:bg-cyan-900 transition-colors disabled:opacity-50"
        @click="createGame"
      >
        {{ loading ? '' : 'START NEW GAME' }}
        <Spinner v-if="loading" size="0.9em" class="mr-2" />
        <span v-if="loading">INITIALIZING...</span>
      </button>

      <div v-if="created" class="mt-8 border border-cyan-900 p-4 bg-cyan-950 bg-opacity-30">
        <p class="text-cyan-500 text-sm mb-2">
          PLAY MODE
        </p>
        <div class="flex gap-2 mb-3 flex-wrap">
          <button
            class="px-3 py-2 text-xs border transition-colors"
            :class="[
              playMode === 'external'
                ? 'border-cyan-400 bg-cyan-950 text-cyan-300'
                : 'border-cyan-900 text-cyan-700 hover:border-cyan-700',
            ]"
            @click="playMode = 'external'"
          >
            EXTERNAL MCP
          </button>
          <button
            class="px-3 py-2 text-xs border transition-colors"
            :class="[
              playMode === 'Q3B'
                ? 'border-cyan-400 bg-cyan-950 text-cyan-300'
                : 'border-cyan-900 text-cyan-700 hover:border-cyan-700',
            ]"
            @click="playMode = 'Q3B'"
          >
            IN-BROWSER (Qwen 3.5)
          </button>
          <button
            class="px-3 py-2 text-xs border transition-colors"
            :class="[
              playMode === 'E2B'
                ? 'border-cyan-400 bg-cyan-950 text-cyan-300'
                : 'border-cyan-900 text-cyan-700 hover:border-cyan-700',
            ]"
            @click="playMode = 'E2B'"
          >
            IN-BROWSER (Gemma E2B)
          </button>
          <button
            class="px-3 py-2 text-xs border transition-colors"
            :class="[
              playMode === 'E4B'
                ? 'border-cyan-400 bg-cyan-950 text-cyan-300'
                : 'border-cyan-900 text-cyan-700 hover:border-cyan-700',
            ]"
            @click="playMode = 'E4B'"
          >
            IN-BROWSER (Gemma E4B)
          </button>
        </div>
        <p v-if="playMode === 'Q3B'" class="text-cyan-700 text-xs mb-3">
          Qwen 3.5 4B runs in your browser via WebGPU. ~2.4GB download (first load), ~3GB VRAM. Most compatible with browser WebGPU buffer limits. Requires Chrome/Edge 113+ or Safari 18+.
        </p>
        <p v-else-if="playMode === 'E2B'" class="text-cyan-700 text-xs mb-3">
          Gemma 4 E2B runs in your browser via WebGPU. ~1.2GB download (first load), ~2GB VRAM. Requires Chrome/Edge 113+ or Safari 18+.
        </p>
        <p v-else-if="playMode === 'E4B'" class="text-cyan-700 text-xs mb-3">
          Gemma 4 E4B runs in your browser via WebGPU. ~2.5GB download (first load), ~4GB VRAM. Requires Chrome/Edge 113+ or Safari 18+.
        </p>

        <template v-if="showMcpUrl">
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
            Configure this URL as an MCP server in your LLM client (Claude Desktop, Cursor, etc.) using its MCP server settings.
          </p>
        </template>
        <p v-else class="text-cyan-700 text-xs mb-3">
          The AI will run directly in your browser. No external application needed — a chat panel will appear in the game.
        </p>

        <div class="flex justify-end mt-4">
          <NuxtLink
            :to="playUrl"
            class="inline-block px-4 py-2 border border-cyan-400 text-cyan-300 hover:bg-cyan-900 text-sm"
          >
            ENTER GAME →
          </NuxtLink>
        </div>
      </div>

      <div class="flex items-center justify-center gap-4 mt-8">
        <p class="text-cyan-800 text-xs">
          v{{ version }}
        </p>
        <button
          v-if="changelog.length"
          class="text-cyan-600 hover:text-cyan-400 text-xs underline"
          @click="changelogOpen = true"
        >
          What's new?
        </button>
        <div v-else class="flex items-center gap-1">
          <Spinner size="0.7rem" class="text-cyan-800" />
        </div>
      </div>
    </div>

    <ChangelogPanel v-if="changelog.length" v-model:open="changelogOpen" :data="changelog" />
  </div>
</template>

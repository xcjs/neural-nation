<script setup lang="ts">
import { $fetch } from 'ofetch';
import { ref } from 'vue';

const loading = ref(false);
const error = ref('');
const created = ref<{ token: string; publicToken: string; mcpUrl: string } | null>(null);
const copied = ref(false);
const { version } = useRuntimeConfig().public;

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

      <p class="text-cyan-800 text-xs mt-8 text-center">
        v{{ version }}
      </p>
    </div>
  </div>
</template>

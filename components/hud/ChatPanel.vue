<script setup lang="ts">
import type { ModelChoice } from '~/stores/chat';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Spinner from '~/components/Spinner.vue';
import { useInBrowserLLM } from '~/composables/useInBrowserLLM';
import { useChatStore } from '~/stores/chat';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ token: string; model?: ModelChoice }>();

const chat = useChatStore();
const game = useGameStore();

const privateToken = game.privateToken || props.token;
const llm = useInBrowserLLM(privateToken);

const messageListRef = ref<HTMLElement | null>(null);
const expandedToolCalls = ref<Set<string>>(new Set());

const statusLabel = computed(() => {
  switch (chat.status) {
    case 'idle': return 'IDLE';
    case 'downloading': return 'DOWNLOADING MODEL';
    case 'loading': return 'LOADING MODEL';
    case 'ready': return 'READY';
    case 'prefilling': return 'PROCESSING PROMPT...';
    case 'generating': return 'GENERATING...';
    case 'executingTool': return 'EXECUTING TOOL...';
    case 'error': return 'ERROR';
    default: return '';
  }
});

const statusColor = computed(() => {
  switch (chat.status) {
    case 'ready': return 'text-green-400';
    case 'generating':
    case 'executingTool':
    case 'downloading':
    case 'loading':
    case 'prefilling': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    default: return 'text-cyan-500';
  }
});

const downloadFiles = computed(() => {
  if (!chat.downloadProgress)
    return [];
  return Object.entries(chat.downloadProgress).map(([file, prog]) => ({
    file,
    percent: prog.total ? Math.round((prog.loaded / prog.total) * 100) : 0,
  }));
});

const canSend = computed(() => {
  return chat.status === 'ready' && chat.input.trim().length > 0;
});

const showModelSelector = computed(() => {
  return !llm.isInitialized.value && props.model;
});

const errorInfo = computed<{ title: string; detail: string; suggestions: string[] } | null>(() => {
  const code = chat.errorCode;
  if (!code || !chat.errorMessage) {
    return null;
  }
  const raw = chat.errorMessage;
  switch (code) {
    case 'oom':
      return {
        title: 'GPU Out of Memory',
        detail: raw,
        suggestions: [
          'Try the smaller Qwen 3.5 model (most browser-compatible)',
          'Close other GPU-heavy browser tabs',
          'Use the External MCP play mode (no local model)',
        ],
      };
    case 'webgpu_unavailable':
      return {
        title: 'WebGPU Not Available',
        detail: raw,
        suggestions: [
          'Use Chrome/Edge 113+ or a WebGPU-enabled browser',
          'Enable "chrome://flags/#enable-unsafe-webgpu" if needed',
          'Use the External MCP play mode (no WebGPU required)',
        ],
      };
    case 'network':
      return {
        title: 'Download Failed',
        detail: raw,
        suggestions: [
          'Check your internet connection',
          'The model downloads from huggingface.co on first load',
          'Once cached, subsequent loads work offline',
        ],
      };
    case 'mcp_connection':
      return {
        title: 'MCP Server Unreachable',
        detail: raw,
        suggestions: [
          'Ensure the game server is running',
          'The AI needs the MCP tool server to call game actions',
        ],
      };
    case 'generation':
      return {
        title: 'Inference Error',
        detail: raw,
        suggestions: ['Try sending your message again', 'If it persists, reload the model'],
      };
    case 'worker_crash':
      return {
        title: 'Worker Crashed',
        detail: raw,
        suggestions: ['Reload the model to restart the worker'],
      };
    default:
      return { title: 'Error', detail: raw, suggestions: [] };
  }
});

watch(() => chat.messages.length, async () => {
  await nextTick();
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  }
});

watch(() => chat.messages.flatMap(m => m.content), async () => {
  await nextTick();
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  }
}, { deep: true });

onMounted(() => {
  if (props.model && !llm.isInitialized.value) {
    llm.init(props.model);
  }
});

function startModel(): void {
  if (props.model) {
    llm.init(props.model);
  }
}

function handleSend(): void {
  if (!canSend.value)
    return;
  llm.send(chat.input);
}

function handleCancel(): void {
  llm.cancel();
}

function handleClear(): void {
  llm.clearConversation();
}

function toggleToolCall(id: string): void {
  if (expandedToolCalls.value.has(id)) {
    expandedToolCalls.value.delete(id);
  }
  else {
    expandedToolCalls.value.add(id);
  }
}

function toolCallStatusColor(status: string): string {
  switch (status) {
    case 'complete': return 'text-green-400';
    case 'executing': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    default: return 'text-cyan-500';
  }
}

function formatResult(result: { status: string; data?: unknown; errorMessage?: string }): string {
  if (result.errorMessage)
    return result.errorMessage;
  if (result.data)
    return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
  return '';
}
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3 flex flex-col" style="height: 400px;">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-cyan-400 text-xs font-bold tracking-wider">
        AI CHAT
      </h3>
      <div class="flex items-center gap-2">
        <span class="text-xs" :class="statusColor">
          {{ statusLabel }}
        </span>
        <button
          v-if="chat.status === 'generating' || chat.status === 'prefilling'"
          class="text-red-400 hover:text-red-300 text-xs"
          @click="handleCancel"
        >
          STOP
        </button>
        <button
          v-if="chat.messages.length > 0 && chat.status === 'ready'"
          class="text-cyan-700 hover:text-cyan-500 text-xs"
          @click="handleClear"
        >
          CLEAR
        </button>
      </div>
    </div>

    <div v-if="errorInfo && chat.status === 'error'" class="flex-1 flex flex-col items-center justify-center gap-2 px-2">
      <div class="border border-red-900/60 bg-red-950/30 rounded p-3 text-xs space-y-2 w-full max-w-xs">
        <div class="text-red-400 font-bold tracking-wide">
          {{ errorInfo.title }}
        </div>
        <div class="text-red-300 break-words">
          {{ errorInfo.detail }}
        </div>
        <ul v-if="errorInfo.suggestions.length" class="text-red-500/70 list-disc list-inside space-y-0.5">
          <li v-for="(s, i) in errorInfo.suggestions" :key="i">
            {{ s }}
          </li>
        </ul>
        <div class="flex justify-center mt-1">
          <button
            v-if="props.model"
            class="px-4 py-2 border border-cyan-400 bg-cyan-950 text-cyan-300 hover:bg-cyan-900 text-xs tracking-wider"
            @click="startModel"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="showModelSelector" class="flex-1 flex flex-col items-center justify-center gap-3">
      <p class="text-cyan-500 text-xs text-center">
        Model: <span class="text-cyan-300 font-bold">{{ props.model }}</span>
      </p>
      <p class="text-cyan-700 text-xs text-center">
        {{
          props.model === 'Q3B' ? '~2.4GB download, ~3GB VRAM'
          : props.model === 'E2B' ? '~1.2GB download, ~2GB VRAM'
            : '~2.5GB download, ~4GB VRAM'
        }}
      </p>
      <button
        class="px-4 py-2 border border-cyan-400 bg-cyan-950 text-cyan-300 hover:bg-cyan-900 text-xs tracking-wider"
        @click="startModel"
      >
        LOAD MODEL
      </button>
    </div>

    <div v-else-if="chat.status === 'downloading' || chat.status === 'loading'" class="flex-1 flex flex-col items-center justify-center gap-3 overflow-y-auto min-h-0">
      <Spinner size="1.2rem" class="text-cyan-500" />
      <p class="text-cyan-500 text-xs">
        {{ chat.status === 'downloading' ? 'Downloading model weights...' : 'Loading model into WebGPU...' }}
      </p>
      <div v-if="downloadFiles.length" class="w-full max-w-xs space-y-2">
        <div v-for="f in downloadFiles" :key="f.file">
          <p class="text-cyan-700 text-xs truncate">
            {{ f.file.split('/').pop() }}
          </p>
          <div class="bg-cyan-950 h-2 rounded-full overflow-hidden border border-cyan-900">
            <div
              class="bg-cyan-500 h-full transition-all"
              :style="{ width: `${f.percent}%` }"
            />
          </div>
          <p class="text-cyan-700 text-xs text-right">
            {{ f.percent }}%
          </p>
        </div>
      </div>
    </div>

    <template v-else>
      <div ref="messageListRef" class="flex-1 overflow-y-auto space-y-2 mb-2 min-h-0">
        <div v-if="chat.messages.length === 0" class="text-cyan-700 text-xs text-center py-4">
          Send a message to start playing.
        </div>

        <div
          v-for="msg in chat.messages"
          :key="msg.id"
          class="space-y-1"
        >
          <div
            class="text-xs py-1 px-2 rounded"
            :class="[
              msg.role === 'user'
                ? 'bg-cyan-950/50 border-l-2 border-cyan-500 text-cyan-300'
                : 'bg-black/50 border-l-2 border-green-700 text-green-300',
            ]"
          >
            <span class="text-cyan-700 font-bold">
              {{ msg.role === 'user' ? 'YOU' : 'AI' }}
            </span>
            <p class="whitespace-pre-wrap break-words mt-0.5">
              {{ msg.content }}<span v-if="msg.isStreaming" class="animate-pulse">|</span>
            </p>
          </div>

          <div
            v-for="tc in msg.toolCalls"
            :key="tc.id"
            class="border border-cyan-900/50 bg-cyan-950/30 rounded p-2"
          >
            <button
              class="flex items-center justify-between w-full text-xs"
              @click="toggleToolCall(tc.id)"
            >
              <span class="flex items-center gap-1">
                <span class="text-cyan-700">[TOOL]</span>
                <span class="text-cyan-300 font-bold">{{ tc.toolName }}</span>
                <span class="text-xs" :class="toolCallStatusColor(tc.status)">
                  {{ tc.status === 'executing' ? '...' : tc.status === 'complete' ? ' OK' : tc.status === 'error' ? ' ERR' : '' }}
                </span>
              </span>
              <span class="text-cyan-700">
                {{ expandedToolCalls.has(tc.id) ? '-' : '+' }}
              </span>
            </button>
            <div v-if="expandedToolCalls.has(tc.id)" class="mt-1 space-y-1">
              <div class="text-xs text-cyan-700">
                Args:
              </div>
              <pre class="text-xs text-cyan-500 bg-black/50 p-1 rounded overflow-x-auto">{{ JSON.stringify(tc.args, null, 2) }}</pre>
              <div v-if="tc.result" class="text-xs text-cyan-700 mt-1">
                Result:
              </div>
              <pre
                v-if="tc.result"
                class="text-xs p-1 rounded overflow-x-auto"
                :class="tc.status === 'error' ? 'text-red-400 bg-red-950/30' : 'text-green-400 bg-black/50'"
              >{{ formatResult(tc.result) }}</pre>
            </div>
          </div>
        </div>
      </div>

      <div v-if="errorInfo" class="border border-red-900/60 bg-red-950/30 rounded p-2 mb-2 text-xs space-y-1">
        <div class="text-red-400 font-bold tracking-wide">
          {{ errorInfo.title }}
        </div>
        <div class="text-red-300 break-words">
          {{ errorInfo.detail }}
        </div>
        <ul v-if="errorInfo.suggestions.length" class="text-red-500/70 list-disc list-inside space-y-0.5">
          <li v-for="(s, i) in errorInfo.suggestions" :key="i">
            {{ s }}
          </li>
        </ul>
        <div class="flex justify-center mt-1">
          <button
            v-if="props.model"
            class="px-4 py-2 border border-cyan-400 bg-cyan-950 text-cyan-300 hover:bg-cyan-900 text-xs tracking-wider"
            @click="startModel"
          >
            Try Again
          </button>
        </div>
      </div>

      <div class="flex gap-1">
        <input
          v-model="chat.input"
          placeholder="Direct the AI overseer..."
          class="flex-1 bg-black border border-cyan-900 px-2 py-1 text-cyan-300 text-xs"
          :disabled="chat.status !== 'ready'"
          @keydown.enter="handleSend"
        >
        <button
          :disabled="!canSend"
          class="px-3 py-1 border border-cyan-700 text-cyan-500 hover:bg-cyan-950 text-xs disabled:opacity-30"
          @click="handleSend"
        >
          SEND
        </button>
      </div>
    </template>
  </div>
</template>

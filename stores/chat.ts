import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ChatRole = 'user' | 'assistant' | 'tool';

export interface ToolCallRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result: { status: string; data?: unknown; errorMessage?: string } | null;
  status: 'pending' | 'executing' | 'complete' | 'error';
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls: ToolCallRecord[];
  isStreaming: boolean;
  timestamp: number;
}

export type LlmStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'generating' | 'executingTool' | 'error';

export type ModelChoice = 'E2B' | 'E4B';

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([]);
  const input = ref('');
  const status = ref<LlmStatus>('idle');
  const currentModel = ref<ModelChoice | null>(null);
  const downloadProgress = ref<{ loaded: number; total: number } | null>(null);
  const errorMessage = ref('');
  const activeToolCallId = ref<string | null>(null);

  function addMessage(msg: ChatMessage): void {
    messages.value.push(msg);
  }

  function updateMessageContent(id: string, content: string): void {
    const msg = messages.value.find(m => m.id === id);
    if (msg)
      msg.content = content;
  }

  function appendMessageContent(id: string, chunk: string): void {
    const msg = messages.value.find(m => m.id === id);
    if (msg)
      msg.content += chunk;
  }

  function finishStreaming(id: string): void {
    const msg = messages.value.find(m => m.id === id);
    if (msg)
      msg.isStreaming = false;
  }

  function addToolCall(messageId: string, call: ToolCallRecord): void {
    const msg = messages.value.find(m => m.id === messageId);
    if (msg)
      msg.toolCalls.push(call);
  }

  function updateToolCall(messageId: string, callId: string, updates: Partial<ToolCallRecord>): void {
    const msg = messages.value.find(m => m.id === messageId);
    if (!msg)
      return;
    const call = msg.toolCalls.find(c => c.id === callId);
    if (call)
      Object.assign(call, updates);
  }

  function clear(): void {
    messages.value = [];
    input.value = '';
    status.value = 'idle';
    errorMessage.value = '';
    activeToolCallId.value = null;
  }

  function reset(): void {
    clear();
    currentModel.value = null;
    downloadProgress.value = null;
  }

  return {
    messages,
    input,
    status,
    currentModel,
    downloadProgress,
    errorMessage,
    activeToolCallId,
    addMessage,
    updateMessageContent,
    appendMessageContent,
    finishStreaming,
    addToolCall,
    updateToolCall,
    clear,
    reset,
  };
});

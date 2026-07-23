import type { McpToolDef } from '~/composables/useMcpClient';
import type { ChatMessage, LlmErrorCode, ModelChoice, ToolCallRecord } from '~/stores/chat';
import { onUnmounted, ref, toRaw } from 'vue';
import { useMcpClient } from '~/composables/useMcpClient';
import { useChatStore } from '~/stores/chat';

interface WorkerInitMessage { type: 'init'; model: 'Q25B' | 'E2B' | 'E4B' | 'Q3B' }
interface WorkerGenerateMessage {
  type: 'generate';
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>; tool_call_id?: string }>;
  tools: McpToolDef[];
}
interface WorkerCancelMessage { type: 'cancel' }
type WorkerRequest = WorkerInitMessage | WorkerGenerateMessage | WorkerCancelMessage;

interface WorkerTokenMessage { type: 'token'; text: string }
interface WorkerToolCallMessage { type: 'tool_call'; name: string; args: Record<string, unknown> }
interface WorkerProgressMessage { type: 'progress'; loaded: number; total: number; file: string }
interface WorkerReadyMessage { type: 'ready' }
interface WorkerLoadingMessage { type: 'loading' }
interface WorkerPrefillMessage { type: 'prefill' }
interface WorkerDoneMessage { type: 'done' }
interface WorkerErrorMessage { type: 'error'; message: string; code?: LlmErrorCode }
type WorkerResponse = WorkerTokenMessage | WorkerToolCallMessage | WorkerProgressMessage | WorkerReadyMessage | WorkerLoadingMessage | WorkerPrefillMessage | WorkerDoneMessage | WorkerErrorMessage;

const SYSTEM_PROMPT = `You are the AI overseer of Neural Nation, a planetary industrial economy simulation. You play the game by calling tools via the MCP protocol. Each tool call advances the simulation by one tick (one day). Your goal is to build a sustainable economy: extract resources, build facilities, establish supply chains, research technology, and manage environmental impact. Plan multi-step strategies. Call tools to survey, build, and manage. Observe the results and adapt your strategy. Be efficient with resources — if they run out, the game ends.`;

const MAX_TOOL_ITERATIONS = 20;

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useInBrowserLLM(token: string) {
  const chat = useChatStore();
  const mcpClient = useMcpClient(token);

  const worker = ref<Worker | null>(null);
  const toolDefs = ref<McpToolDef[]>([]);
  const modelReady = ref(false);
  const isInitialized = ref(false);
  const conversationHistory = ref<Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>; tool_call_id?: string }>>([]);

  function init(modelChoice: ModelChoice): void {
    if (isInitialized.value)
      return;

    isInitialized.value = true;
    chat.currentModel = modelChoice;
    chat.status = 'downloading';

    worker.value = new Worker(new URL('~/workers/llm-worker.ts', import.meta.url), { type: 'module' });

    worker.value.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      handleWorkerMessage(e.data);
    });

    worker.value.addEventListener('error', (e: ErrorEvent) => {
      chat.status = 'error';
      chat.errorMessage = e.message || 'Worker crashed unexpectedly';
      chat.errorCode = 'worker_crash';
      isInitialized.value = false;
      modelReady.value = false;
    });

    conversationHistory.value = [{ role: 'system', content: SYSTEM_PROMPT }];

    postToWorker({ type: 'init', model: modelChoice });
  }

  let currentAssistantId = '';
  let pendingToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  function handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'loading':
        chat.status = 'loading';
        break;
      case 'progress':
        chat.downloadProgress = {
          ...(chat.downloadProgress ?? {}),
          [msg.file]: { loaded: msg.loaded, total: msg.total },
        };
        chat.status = 'downloading';
        break;
      case 'ready':
        chat.status = 'ready';
        chat.downloadProgress = null;
        modelReady.value = true;
        loadToolDefs();
        break;
      case 'prefill':
        chat.status = 'prefilling';
        break;
      case 'token':
        if (chat.status === 'prefilling')
          chat.status = 'generating';
        chat.appendMessageContent(currentAssistantId, msg.text);
        break;
      case 'tool_call':
        handleToolCallFromWorker(msg.name, msg.args);
        break;
      case 'done':
        handleGenerationDone();
        break;
      case 'error':
        chat.status = 'error';
        chat.errorMessage = msg.message;
        chat.errorCode = msg.code ?? 'unknown';
        isInitialized.value = false;
        if (worker.value) {
          worker.value.terminate();
          worker.value = null;
        }
        modelReady.value = false;
        break;
    }
  }

  function sanitizeBigInt(obj: unknown): unknown {
    if (typeof obj === 'bigint')
      return String(obj);
    if (Array.isArray(obj))
      return obj.map(sanitizeBigInt);
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(obj))
        result[key] = sanitizeBigInt((obj as Record<string, unknown>)[key]);
      return result;
    }
    return obj;
  }

  async function loadToolDefs(): Promise<void> {
    try {
      await mcpClient.connect();
      const tools = await mcpClient.listTools();
      toolDefs.value = sanitizeBigInt(tools) as McpToolDef[];
    }
    catch (error) {
      chat.status = 'error';
      chat.errorCode = 'mcp_connection';
      chat.errorMessage = `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function send(userText: string): Promise<void> {
    if (!modelReady.value || !worker.value) {
      chat.errorMessage = 'Model not ready. Please wait for model to load.';
      return;
    }

    if (chat.status === 'generating' || chat.status === 'executingTool')
      return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: userText,
      toolCalls: [],
      isStreaming: false,
      timestamp: Date.now(),
    };
    chat.addMessage(userMsg);
    conversationHistory.value.push({ role: 'user', content: userText });

    chat.input = '';
    await startGeneration();
  }

  async function startGeneration(): Promise<void> {
    currentAssistantId = genId();
    pendingToolCalls = [];

    const assistantMsg: ChatMessage = {
      id: currentAssistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
      timestamp: Date.now(),
    };
    chat.addMessage(assistantMsg);
    chat.status = 'prefilling';

    postToWorker({
      type: 'generate',
      messages: conversationHistory.value,
      tools: toolDefs.value,
    });
  }

  async function handleToolCallFromWorker(name: string, args: Record<string, unknown>): Promise<void> {
    const callId = genId();
    const toolCall: ToolCallRecord = {
      id: callId,
      toolName: name,
      args,
      result: null,
      status: 'executing',
    };
    chat.addToolCall(currentAssistantId, toolCall);
    chat.activeToolCallId = callId;
    chat.status = 'executingTool';

    pendingToolCalls.push({ name, arguments: args });

    try {
      const result = await mcpClient.callTool(name, args);
      const resultText = result.content
        ?.map(c => c.type === 'text' ? c.text : '')
        .join('\n') ?? '';

      const parsed = result.isError
        ? { status: 'error', errorMessage: resultText }
        : { status: 'success', data: safeParse(resultText) };

      chat.updateToolCall(currentAssistantId, callId, {
        result: parsed,
        status: result.isError ? 'error' : 'complete',
      });

      conversationHistory.value.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ name, arguments: args }],
      });

      conversationHistory.value.push({
        role: 'tool',
        content: resultText,
        tool_call_id: callId,
      });
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      chat.updateToolCall(currentAssistantId, callId, {
        result: { status: 'error', errorMessage: errMsg },
        status: 'error',
      });

      conversationHistory.value.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ name, arguments: args }],
      });

      conversationHistory.value.push({
        role: 'tool',
        content: `Error: ${errMsg}`,
        tool_call_id: callId,
      });
    }

    chat.activeToolCallId = null;
    chat.status = 'prefilling';

    if (pendingToolCalls.length >= MAX_TOOL_ITERATIONS) {
      chat.errorMessage = `Max tool iterations (${MAX_TOOL_ITERATIONS}) reached. Stopping.`;
      chat.finishStreaming(currentAssistantId);
      chat.status = 'ready';
      return;
    }

    pendingToolCalls = [];
    currentAssistantId = genId();

    const continueMsg: ChatMessage = {
      id: currentAssistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
      timestamp: Date.now(),
    };
    chat.addMessage(continueMsg);

    postToWorker({
      type: 'generate',
      messages: conversationHistory.value,
      tools: toolDefs.value,
    });
  }

  function handleGenerationDone(): void {
    chat.finishStreaming(currentAssistantId);

    const lastMsg = chat.messages.find(m => m.id === currentAssistantId);
    if (lastMsg) {
      conversationHistory.value.push({
        role: 'assistant',
        content: lastMsg.content,
      });
    }

    chat.status = modelReady.value ? 'ready' : 'idle';
  }

  function cancel(): void {
    if (worker.value) {
      postToWorker({ type: 'cancel' });
    }
    chat.finishStreaming(currentAssistantId);
    chat.status = 'ready';
  }

  function clearConversation(): void {
    conversationHistory.value = [{ role: 'system', content: SYSTEM_PROMPT }];
    chat.clear();
    chat.status = modelReady.value ? 'ready' : 'idle';
  }

  function deepToRaw<T>(obj: T): T {
    const raw = toRaw(obj as object) as T;
    if (raw === null || typeof raw !== 'object')
      return raw;
    if (Array.isArray(raw))
      return raw.map(item => deepToRaw(item)) as unknown as T;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(raw as object))
      result[key] = deepToRaw((raw as Record<string, unknown>)[key]);
    return result as unknown as T;
  }

  function postToWorker(msg: WorkerRequest): void {
    if (worker.value) {
      try {
        const raw = deepToRaw(msg);
        const sanitized = sanitizeBigInt(raw);
        console.warn('[useInBrowserLLM] postToWorker sanitized, has bigint:', JSON.stringify(sanitized, (_k, v) => typeof v === 'bigint' ? `[BIGINT]` : v).includes('[BIGINT]'));
        worker.value.postMessage(structuredClone(sanitized));
      }
      catch (err) {
        console.error('[useInBrowserLLM] postToWorker failed:', err);
        chat.status = 'error';
        chat.errorCode = 'unknown';
        chat.errorMessage = `Failed to send to worker: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  function safeParse(text: string): unknown {
    try {
      return JSON.parse(text);
    }
    catch {
      return text;
    }
  }

  onUnmounted(() => {
    if (worker.value) {
      worker.value.terminate();
      worker.value = null;
    }
    mcpClient.disconnect();
  });

  return {
    init,
    send,
    cancel,
    clearConversation,
    modelReady,
    isInitialized,
    toolDefs,
  };
}

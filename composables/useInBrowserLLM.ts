import type { McpToolDef } from '~/composables/useMcpClient';
import type { ChatMessage, LlmErrorCode, ModelChoice, ToolCallRecord } from '~/stores/chat';
import { onUnmounted, ref, toRaw } from 'vue';
import { useMcpClient } from '~/composables/useMcpClient';
import { useChatStore } from '~/stores/chat';

interface WorkerInitMessage { type: 'init'; model: 'Q25B' | 'E2B' | 'E4B' | 'Q3B' }
interface ToolCallEntry {
  id: string;
  type: 'function';
  function: { name: string; arguments: Record<string, unknown> };
}
interface ChatHistoryMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCallEntry[];
  tool_call_id?: string;
}
// OpenAI function-tool shape: { function: { name, description, parameters } }.
// Gemma/Qwen chat templates access tool_data['function']['name'] and
// ['function']['parameters'], so the flat { name, description, inputSchema }
// shape from MCP produces empty declarations and the model hallucinates names.
interface OpenAiToolDef {
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
interface WorkerGenerateMessage {
  type: 'generate';
  messages: ChatHistoryMessage[];
  tools: OpenAiToolDef[];
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
  const seeded = ref(false);
  const conversationHistory = ref<ChatHistoryMessage[]>([]);

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
        handleModelReady();
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
        // Only destroy the worker for fatal errors that require a full reload.
        // Generation/oom errors leave the model loaded — just reset status for retry.
        if (msg.code === 'generation' || msg.code === 'oom') {
          modelReady.value = true;
        }
        else {
          isInitialized.value = false;
          if (worker.value) {
            worker.value.terminate();
            worker.value = null;
          }
          modelReady.value = false;
        }
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

  function compactSchema(schema: Record<string, unknown>): Record<string, unknown> {
    if (!schema || typeof schema !== 'object')
      return schema;
    const { description: _d, title: _t, $schema: _s, ...rest } = schema;
    if (rest.properties && typeof rest.properties === 'object') {
      const props: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rest.properties as Record<string, unknown>)) {
        if (val && typeof val === 'object') {
          const { description: _pd, title: _pt, default: _def, ...pRest } = val as Record<string, unknown>;
          props[key] = pRest;
        }
        else {
          props[key] = val;
        }
      }
      rest.properties = props;
    }
    return rest;
  }

  function compactToolDefs(tools: McpToolDef[]): McpToolDef[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description.length > 120 ? `${t.description.slice(0, 117)}...` : t.description,
      inputSchema: compactSchema(t.inputSchema),
    }));
  }

  function toOpenAiTools(tools: McpToolDef[]): OpenAiToolDef[] {
    return tools.map(t => ({
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  async function handleModelReady(): Promise<void> {
    await loadToolDefs();
    if (!seeded.value && modelReady.value && chat.status === 'ready') {
      seeded.value = true;
      await send('Let\'s play Neural Nation!');
    }
  }

  async function loadToolDefs(): Promise<void> {
    try {
      await mcpClient.connect();
      const tools = await mcpClient.listTools();
      toolDefs.value = compactToolDefs(sanitizeBigInt(tools) as McpToolDef[]);
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
      tools: toOpenAiTools(toolDefs.value),
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
      const fullText = result.content
        ?.map(c => c.type === 'text' ? c.text : '')
        .join('\n') ?? '';

      // UI gets the full, untruncated result.
      const parsed = result.isError
        ? { status: 'error', errorMessage: fullText }
        : { status: 'success', data: safeParse(fullText) };

      chat.updateToolCall(currentAssistantId, callId, {
        result: parsed,
        status: result.isError ? 'error' : 'complete',
      });

      // The model gets a bounded copy: long collection arrays are capped so the
      // total stays within small-model context windows. Hard-cap remains a
      // safety net for non-JSON or pathological payloads.
      let modelText = truncateCollections(fullText);
      const MAX_TOOL_RESULT_CHARS = 2000;
      if (modelText.length > MAX_TOOL_RESULT_CHARS) {
        modelText = `${modelText.slice(0, MAX_TOOL_RESULT_CHARS)}\n...[truncated, ${modelText.length} total chars]`;
      }

      // Capture the assistant's streamed text before the tool call (not empty string)
      const assistantMsg = chat.messages.find(m => m.id === currentAssistantId);
      const assistantText = assistantMsg?.content ?? '';

      conversationHistory.value.push({
        role: 'assistant',
        content: assistantText,
        // OpenAI tool_calls shape — required by the Qwen2.5/Gemma chat templates
        // which access tool_call['function']['name']. The flat { name, arguments }
        // form makes tool_call.function undefined and trips Jinja2's
        // "Cannot perform operation + on undefined values" error.
        tool_calls: [{ id: callId, type: 'function', function: { name, arguments: args } }],
      });

      conversationHistory.value.push({
        role: 'tool',
        content: modelText,
        tool_call_id: callId,
      });
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      chat.updateToolCall(currentAssistantId, callId, {
        result: { status: 'error', errorMessage: errMsg },
        status: 'error',
      });

      const assistantMsg = chat.messages.find(m => m.id === currentAssistantId);
      const assistantText = assistantMsg?.content ?? '';

      conversationHistory.value.push({
        role: 'assistant',
        content: assistantText,
        tool_calls: [{ id: callId, type: 'function', function: { name, arguments: args } }],
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
      tools: toOpenAiTools(toolDefs.value),
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

  function retry(): void {
    // For generation/oom errors where the model is still loaded, just re-trigger
    // generation from the current conversation context without reloading the model.
    if (modelReady.value && worker.value) {
      chat.errorMessage = '';
      chat.errorCode = null;
      chat.status = 'ready';
      // Re-send the last user message to re-trigger generation from current context
      const lastUser = [...conversationHistory.value].reverse().find(m => m.role === 'user');
      if (lastUser) {
        startGeneration();
      }
      else {
        seeded.value = false;
        handleModelReady();
      }
    }
    else {
      // Model not loaded — fall back to full init
      init(chat.currentModel!);
    }
  }

  function clearConversation(): void {
    conversationHistory.value = [{ role: 'system', content: SYSTEM_PROMPT }];
    seeded.value = false;
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
        worker.value.postMessage(structuredClone(sanitized));
      }
      catch (err) {
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

  // Max array length kept per collection in tool results sent to the model.
  // Longer arrays are capped to the first N entries plus a count marker so the
  // model sees a representative sample and the total size, without the full
  // payload overflowing small-model context windows on WebGPU.
  const MAX_COLLECTION_ITEMS = 8;

  function capCollections(value: unknown): unknown {
    if (Array.isArray(value)) {
      if (value.length > MAX_COLLECTION_ITEMS) {
        return [
          ...value.slice(0, MAX_COLLECTION_ITEMS).map(capCollections),
          `... ${value.length - MAX_COLLECTION_ITEMS} more omitted`,
        ];
      }
      return value.map(capCollections);
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>))
        out[k] = capCollections(v);
      return out;
    }
    return value;
  }

  function truncateCollections(text: string): string {
    const parsed = safeParse(text);
    if (typeof parsed === 'string')
      return text;
    try {
      return JSON.stringify(capCollections(parsed));
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
    retry,
    clearConversation,
    modelReady,
    isInitialized,
    toolDefs,
  };
}

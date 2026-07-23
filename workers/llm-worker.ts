import type { PreTrainedModel, PreTrainedTokenizer } from '@huggingface/transformers';
import { AutoModelForCausalLM, AutoTokenizer, env, TextStreamer } from '@huggingface/transformers';
import { createStreamingToolCallParser, type ToolCallToken } from './llm-tool-call-parser';

// ORT/Transformers.js internally JSON.stringify BigInt tensor IDs, which throws.
// Patch JSON.stringify to coerce BigInt to Number (safe for tensor IDs < 2^53).
const origStringify = JSON.stringify;
JSON.stringify = function (value: unknown, replacer?: unknown, space?: unknown): string {
  const bigintReplacer = (_k: string, v: unknown) => typeof v === 'bigint' ? Number(v) : v;
  const r = replacer ?? bigintReplacer;
  // @ts-expect-error — patched signature with our default replacer
  return origStringify(value, r, space);
} as typeof JSON.stringify;

interface GPUAdapterLike {
  limits: { maxUniformBufferBindingSize: number };
  features: { has: (name: string) => boolean };
  requestDevice: (descriptor?: Record<string, unknown>) => Promise<unknown>;
}

let webgpuConfigured = false;

async function configureWebGPU(): Promise<void> {
  if (webgpuConfigured) {
    return;
  }
  webgpuConfigured = true;
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return;
  }
  const gpu = (navigator as unknown as { gpu: { requestAdapter: (opts?: Record<string, unknown>) => Promise<GPUAdapterLike | null> } }).gpu;
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    return;
  }
  console.warn('[llm-worker] adapter limits:', {
    maxBufferSize: (adapter.limits as Record<string, number>).maxBufferSize,
    maxStorageBufferBindingSize: (adapter.limits as Record<string, number>).maxStorageBufferBindingSize,
    maxUniformBufferBindingSize: adapter.limits.maxUniformBufferBindingSize,
  });
  const adapterMaxBuffer = (adapter.limits as Record<string, number>).maxBufferSize ?? 1024 * 1024 * 1024;
  const adapterMaxStorage = (adapter.limits as Record<string, number>).maxStorageBufferBindingSize ?? 1024 * 1024 * 1024;
  const RAISED_LIMITS = {
    maxBufferSize: Math.max(4 * 1024 * 1024 * 1024, adapterMaxBuffer * 2),
    maxStorageBufferBindingSize: Math.max(4 * 1024 * 1024 * 1024, adapterMaxStorage * 2),
    maxUniformBufferBindingSize: adapter.limits.maxUniformBufferBindingSize,
  };
  (env as unknown as { webgpu: { adapter: GPUAdapterLike } }).webgpu = {
    adapter: new Proxy(adapter, {
      get(target, prop, receiver) {
        if (prop === 'requestDevice') {
          return (opts: Record<string, unknown> = {}) => {
            console.warn('[llm-worker] requestDevice intercepted, requiredLimits:', {
              ...(opts.requiredLimits as Record<string, unknown>),
              ...RAISED_LIMITS,
            });
            return target.requestDevice({
              ...opts,
              requiredLimits: { ...(opts.requiredLimits as Record<string, unknown>), ...RAISED_LIMITS },
            });
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }),
  };
}

const MODEL_IDS = {
  Q25B: 'onnx-community/Qwen2.5-1.5B-Instruct',
  E2B: 'onnx-community/gemma-4-E2B-it-ONNX',
  E4B: 'onnx-community/gemma-4-E4B-it-ONNX',
  Q3B: 'onnx-community/Qwen3.5-4B-ONNX',
} as const;

interface ChatMessageForModel {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  tool_call_id?: string;
}

interface InitMessage {
  type: 'init';
  model: 'Q25B' | 'E2B' | 'E4B' | 'Q3B';
}

interface GenerateMessage {
  type: 'generate';
  messages: ChatMessageForModel[];
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}

interface CancelMessage {
  type: 'cancel';
}

type WorkerRequest = InitMessage | GenerateMessage | CancelMessage;

type LlmErrorCode =
  | 'oom'
  | 'webgpu_unavailable'
  | 'network'
  | 'mcp_connection'
  | 'generation'
  | 'worker_crash'
  | 'deserialize'
  | 'unknown';

function classifyInitError(rawMsg: string): LlmErrorCode {
  if (/out of memory|oom/i.test(rawMsg)) {
    return 'oom';
  }
  if (/deserialize|external data file|memory copy/i.test(rawMsg)) {
    return 'deserialize';
  }
  if (/webgpu.*(?:not|unavailable|unsupported)|navigator\.gpu/i.test(rawMsg)) {
    return 'webgpu_unavailable';
  }
  if (/fetch|network|failed to fetch|download|connection/i.test(rawMsg)) {
    return 'network';
  }
  return 'unknown';
}

function classifyGenerationError(rawMsg: string): LlmErrorCode {
  if (/out of memory|oom/i.test(rawMsg)) {
    return 'oom';
  }
  return 'generation';
}

let model: PreTrainedModel | null = null;
let tokenizer: PreTrainedTokenizer | null = null;
let currentModelId: string | null = null;
let abortController: AbortController | null = null;

globalThis.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  console.warn('[llm-worker] received message:', msg.type);

  if (msg.type === 'init') {
    await handleInit(msg.model);
  }
  else if (msg.type === 'generate') {
    console.warn('[llm-worker] generate messages:', msg.messages?.length, 'tools:', msg.tools?.length);
    console.warn('[llm-worker] tools sample:', JSON.stringify(msg.tools?.[0], (_k, v) => typeof v === 'bigint' ? '[BIGINT]' : v, 2)?.slice(0, 300));
    await handleGenerate(msg.messages, msg.tools);
  }
  else if (msg.type === 'cancel') {
    handleCancel();
  }
});

async function handleInit(modelChoice: 'Q25B' | 'E2B' | 'E4B' | 'Q3B'): Promise<void> {
  const modelId = MODEL_IDS[modelChoice];

  if (currentModelId === modelId && model && tokenizer) {
    globalThis.postMessage({ type: 'ready' });
    return;
  }

  if (!(currentModelId === modelId && model && tokenizer)) {
    console.warn('[llm-worker] clearing browser cache before model load...');
    try {
      if ('caches' in globalThis) {
        const keys = await globalThis.caches.keys();
        await Promise.all(keys.map(key => globalThis.caches.delete(key)));
      }
    }
    catch (err) {
      console.warn('[llm-worker] cache clear failed:', err);
    }
  }

  try {
    globalThis.postMessage({ type: 'loading' });

    await configureWebGPU();

    const progressCallback = (data: { status: string; progress?: number; loaded?: number; total?: number; file?: string }) => {
      if (data.status === 'progress' && data.progress !== undefined) {
        globalThis.postMessage({
          type: 'progress',
          loaded: data.loaded ?? 0,
          total: data.total ?? 0,
          file: data.file ?? 'unknown',
        });
      }
      else if (data.status === 'ready') {
        globalThis.postMessage({ type: 'loading' });
      }
    };

    model = await AutoModelForCausalLM.from_pretrained(modelId, {
      dtype: 'q4',
      device: 'webgpu',
      progress_callback: progressCallback,
    }) as PreTrainedModel;

    tokenizer = await AutoTokenizer.from_pretrained(modelId);

    currentModelId = modelId;
    globalThis.postMessage({ type: 'ready' });
  }
  catch (error) {
    const rawMsg = error instanceof Error ? error.message : 'Failed to load model';
    const code = classifyInitError(rawMsg);
    globalThis.postMessage({ type: 'error', message: rawMsg, code });
  }
}

async function handleGenerate(
  messages: ChatMessageForModel[],
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
): Promise<void> {
  if (!model || !tokenizer) {
    globalThis.postMessage({ type: 'error', message: 'Model not loaded' });
    return;
  }

  abortController = new AbortController();

  try {
    console.warn('[llm-worker] applying chat template...');
    console.warn('[llm-worker] tools for template:', JSON.stringify(tools, (_k, v) => typeof v === 'bigint' ? '[BIGINT]' : v)?.slice(0, 200));
    let inputs;
    try {
      inputs = tokenizer.apply_chat_template(messages, {
        tools,
        add_generation_prompt: true,
      });
    }
    catch (tplErr) {
      console.error('[llm-worker] apply_chat_template FAILED:', tplErr);
      throw tplErr;
    }
    console.warn('[llm-worker] chat template applied, keys:', Object.keys(inputs), 'input_ids type:', inputs.input_ids?.constructor?.name);

    const parser = createStreamingToolCallParser();

    const emitTokens = (tokens: ToolCallToken[]): void => {
      for (const t of tokens) {
        if (t.kind === 'text') {
          globalThis.postMessage({ type: 'token', text: t.text });
        }
        else {
          globalThis.postMessage({
            type: 'tool_call',
            name: t.call.name,
            args: t.call.arguments,
          });
        }
      }
    };

    let cancelled = false;
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        if (cancelled)
          return;
        emitTokens(parser.push(text));
      },
    });

    abortController.signal.addEventListener('abort', () => {
      cancelled = true;
    });

    console.warn('[llm-worker] starting model.generate()...');
    console.warn('[llm-worker] model type:', model?.constructor?.name, 'device:', (env as unknown as { webgpu?: unknown }).webgpu ? 'webgpu' : 'wasm');
    console.warn('[llm-worker] input_ids type:', inputs.input_ids?.constructor?.name, 'dims:', inputs.input_ids?.dims);
    console.warn('[llm-worker] attention_mask type:', inputs.attention_mask?.constructor?.name, 'dims:', inputs.attention_mask?.dims);
    globalThis.postMessage({ type: 'prefill' });

    // Diagnostic: try a single forward pass to see if the model executes at all
    console.warn('[llm-worker] testing single forward pass...');
    try {
      const testOutput = await model(inputs);
      console.warn('[llm-worker] forward pass succeeded, output keys:', Object.keys(testOutput), 'logits type:', testOutput.logits?.constructor?.name, 'dims:', testOutput.logits?.dims);
    }
    catch (fwdErr) {
      console.error('[llm-worker] forward pass FAILED:', fwdErr);
      throw fwdErr;
    }

    await model.generate({
      ...inputs,
      streamer,
      sampling_temperature: 0.7,
      max_new_tokens: 2048,
      signal: abortController.signal,
    });

    console.warn('[llm-worker] model.generate() completed');

    emitTokens(parser.flush());

    globalThis.postMessage({ type: 'done' });
  }
  catch (error) {
    if (abortController?.signal.aborted) {
      globalThis.postMessage({ type: 'done', reason: 'cancelled' as never });
    }
    else {
      globalThis.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Generation failed',
        code: classifyGenerationError(error instanceof Error ? error.message : ''),
      });
    }
  }
  finally {
    abortController = null;
  }
}

function handleCancel(): void {
  if (abortController) {
    abortController.abort();
  }
}

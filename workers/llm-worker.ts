import type { PreTrainedTokenizer, TextStreamer } from '@huggingface/transformers';
import { AutoTokenizer, Gemma4ForConditionalGeneration } from '@huggingface/transformers';
import { createStreamingToolCallParser, type ToolCallToken } from './llm-tool-call-parser';

const MODEL_IDS = {
  E2B: 'onnx-community/gemma-4-E2B-it-ONNX',
  E4B: 'onnx-community/gemma-4-E4B-it-ONNX',
} as const;

interface ChatMessageForModel {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  tool_call_id?: string;
}

interface InitMessage {
  type: 'init';
  model: 'E2B' | 'E4B';
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

let model: Gemma4ForConditionalGeneration | null = null;
let tokenizer: PreTrainedTokenizer | null = null;
let currentModelId: string | null = null;
let abortController: AbortController | null = null;

globalThis.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    await handleInit(msg.model);
  }
  else if (msg.type === 'generate') {
    await handleGenerate(msg.messages, msg.tools);
  }
  else if (msg.type === 'cancel') {
    handleCancel();
  }
});

async function handleInit(modelChoice: 'E2B' | 'E4B'): Promise<void> {
  const modelId = MODEL_IDS[modelChoice];

  if (currentModelId === modelId && model && tokenizer) {
    globalThis.postMessage({ type: 'ready' });
    return;
  }

  try {
    globalThis.postMessage({ type: 'loading' });

    const progressCallback = (data: { status: string; progress?: number; loaded?: number; total?: number; file?: string }) => {
      if (data.status === 'progress' && data.progress !== undefined) {
        globalThis.postMessage({
          type: 'progress',
          loaded: data.loaded ?? 0,
          total: data.total ?? 0,
        });
      }
      else if (data.status === 'ready') {
        globalThis.postMessage({ type: 'loading' });
      }
    };

    model = await Gemma4ForConditionalGeneration.from_pretrained(modelId, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: progressCallback,
    }) as Gemma4ForConditionalGeneration;

    tokenizer = await AutoTokenizer.from_pretrained(modelId);

    currentModelId = modelId;
    globalThis.postMessage({ type: 'ready' });
  }
  catch (error) {
    globalThis.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to load model',
    });
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
    const inputs = tokenizer.apply_chat_template(messages, {
      tools,
      add_generation_prompt: true,
    });

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

    const streamer = {
      token_fn: (token: string) => {
        if (abortController?.signal.aborted)
          return false;

        emitTokens(parser.push(token));
        return true;
      },
      decode_fn: (tokens: number[]) => {
        return tokenizer!.decode(tokens, { skip_special_tokens: true });
      },
    } as unknown as TextStreamer;

    await model.generate({
      ...inputs,
      streamer,
      sampling_temperature: 0.7,
      max_new_tokens: 2048,
      signal: abortController.signal,
    });

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

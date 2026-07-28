# ADR-0028: In-Browser WebGPU LLM Option

| Field      | Value                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| Status     | Proposed                                                                                   |
| Date       | 2026-07-22                                                                                 |
| Deciders   | Project owner                                                                              |
| Relates to | ADR-0004, ADR-0006, ADR-0019, ADR-0026                                                     |

## Context

Neural Nation's gameplay model (ADR-0006) requires the player to bring their
own MCP-compatible LLM client (Claude Desktop, Cursor, etc.) that connects to
the game's MCP server over HTTP/SSE. This creates a friction barrier: the
player must install and configure a separate application before they can play.

WebGPU is now stable in Chrome/Edge 113+ and Safari 18+, enabling in-browser
LLM inference without external applications. HuggingFace's Transformers.js
library (`@huggingface/transformers`) can run ONNX-quantized models on WebGPU
directly in the browser, downloading weights from HuggingFace on first load
and caching them for subsequent sessions.

Gemma 4 models are available in ONNX format from the `onnx-community` HF org:
- `onnx-community/gemma-4-E2B-it-ONNX` (Effective 2B, ~1.2GB q4f16 download)
- `onnx-community/gemma-4-E4B-it-ONNX` (Effective 4B, ~2.5GB q4f16 download)

Both models support native function calling, which maps directly to the game's
~30+ MCP tools. The game already depends on `@modelcontextprotocol/sdk`
(v1.29), which includes a client-side `SSEClientTransport` that can connect to
our existing MCP server endpoints — no new server endpoints are needed.

This ADR proposes adding an **optional** in-browser LLM mode alongside the
existing BYO-client mode. The player chooses at game creation time.

## Decision

### 1. Runtime — Transformers.js + ONNX/WebGPU

Use `@huggingface/transformers` (v4+) as the in-browser LLM runtime. Models
are loaded via `Gemma4ForConditionalGeneration.from_pretrained(modelId, {
dtype: 'q4f16', device: 'webgpu' })` inside a Web Worker to avoid blocking the
Three.js render loop.

**Model options** (player selects at game start):

| Model | HF Repo                          | Download (q4f16) | VRAM     | Min System RAM |
| ----- | -------------------------------- | ---------------- | -------- | -------------- |
| E2B   | `onnx-community/gemma-4-E2B-it-ONNX` | ~1.2 GB          | ~1.5–2.0 GB | 4 GB           |
| E4B   | `onnx-community/gemma-4-E4B-it-ONNX` | ~2.5 GB          | ~3.0–4.0 GB | 8 GB           |

Models download directly from HuggingFace on first load. Transformers.js
caches weights in the browser (Cache API / IndexedDB) automatically. No
proxying or self-hosting of model weights. The download progress is reported
via a `progress_callback` to the Web Worker, which streams progress updates to
the main thread. The chat panel displays a **progress bar** showing
percentage complete during the initial download so the player knows the
download is progressing and roughly how long remains.

### 2. Tool Execution — Reuse MCP SSE Transport

The in-browser LLM acts as a **client-side MCP client**, connecting to the
same `/api/mcp/sse` and `/api/mcp/messages` endpoints used by external
clients. This uses the `@modelcontextprotocol/sdk` client classes
(`Client` + `SSEClientTransport`), which are already a project dependency.

```
Browser (Web Worker: LLM inference)
  │
  ↓ messages with tool calls
Browser (main thread: useMcpClient composable)
  │
  ↓ SSE connection
GET /api/mcp/sse?token=...        (existing endpoint)
  │
  ↓ JSON-RPC tool calls
POST /api/mcp/messages?token=...  (existing endpoint)
  │
  ↓
McpDispatcher.executeTool()       (existing — runs tool + advances one tick)
  │
  ↓ SSE events
Browser (useGameSSE → Pinia stores → UI updates)
```

This preserves the "one MCP call = one tick" rule (ADR-0006) without
modification — each tool call from the in-browser LLM triggers exactly one
tick, same as external clients.

### 3. Tool-Calling Loop — Multi-Step Autonomous

The in-browser LLM operates autonomously within a single user message turn.
When the model emits a tool call:

1. The Web Worker streams the tool call to the main thread.
2. `useInBrowserLLM` composable calls `mcpClient.callTool(name, args)`.
3. The tool result is fed back to the model as a tool-response message.
4. The model continues generation, potentially issuing more tool calls.
5. The loop repeats until the model produces a final text response (no tool
   call) or a maximum iteration limit is reached (safety guard).

Each tool call triggers one tick via the MCP dispatcher. A multi-step
planning response (e.g., "survey → build → assign") advances multiple ticks
in one turn, matching how an external LLM client would behave over multiple
messages.

### 4. Chat Panel — Built-In UI

A new `ChatPanel.vue` component is added to the HUD's right panel stack,
toggleable via the bottom panel bar like existing panels. It provides:

- **Model selector**: E2B / E4B choice (shown before first model load).
- **Download progress**: Progress bar during initial model weight download.
- **Message list**: User messages, assistant messages (streaming), tool-call
  cards (collapsible, showing tool name + args + result), and tool-response
  bubbles.
- **Input box**: For the player to send directives to the in-browser LLM.
- **Status indicators**: "Loading model...", "Generating...", "Executing
  tool: {name}...".

The chat panel is only functional when the player chose an in-browser mode at
game creation. In BYO-client mode, the panel is hidden (or shows a message
directing the player to their MCP client).

### 5. Game Creation Flow — Mode Selection

The index page (game creation) offers three play modes:

1. **External MCP Client** (existing default) — shows the MCP URL for the
   player to configure in their LLM client.
2. **In-Browser AI (E2B)** — routes to `play.vue?token=...&mode=inbrowser&model=E2B`.
3. **In-Browser AI (E4B)** — routes to `play.vue?token=...&mode=inbrowser&model=E4B`.

The `mode` and `model` query params are passed through `play.vue` to
`GameScreen.vue`, which initializes the chat panel and MCP client
automatically if `mode=inbrowser`.

### 6. Architecture — Web Worker + Composable + Store

```
stores/chat.ts              Pinia store: messages, status, tool call history
composables/useMcpClient.ts Client-side MCP SSE client (sdk Client + SSEClientTransport)
workers/llm-worker.ts       Transformers.js inference in Web Worker
composables/useInBrowserLLM.ts  Orchestrates worker + MCP client + tool loop
components/hud/ChatPanel.vue    Chat UI (model selector, messages, input, streaming)
```

The LLM inference runs entirely in a Web Worker. The main thread handles:
- MCP client communication (SSE connection, tool calls).
- Pinia store updates (chat messages, game state via existing SSE).
- UI rendering.

The worker communicates with the main thread via `postMessage`:
- `init` → load model (streams download progress).
- `generate` → run inference with messages + tool definitions (streams
  tokens + tool calls).
- `cancel` → abort current generation.
- Responses: `token` (streamed text), `tool_call` (parsed function call),
  `done` (generation complete), `error`, `progress` (download progress).

### 7. VRAM / System Requirements

The chat panel displays estimated requirements before model download:

| Requirement            | E2B          | E4B          |
| ---------------------- | ------------ | ------------ |
| VRAM (WebGPU)          | ~1.5–2.0 GB  | ~3.0–4.0 GB  |
| Download (first load)  | ~1.2 GB      | ~2.5 GB      |
| Minimum system RAM     | 4 GB         | 8 GB         |
| Recommended browser    | Chrome/Edge 113+ or Safari 18+ |

WebGPU is not stable in Firefox (behind flag as of 2026-07). The game already
shows a "DESKTOP ONLY" overlay for mobile — the in-browser LLM mode adds a
WebGPU availability check that shows a fallback message if WebGPU is
unavailable.

## Consequences

**Positive:**

- **Zero-setup play**: No external application required. Player creates a game,
  selects a model, and starts playing immediately.
- **Self-contained**: The entire game runs in the browser — 3D rendering,
  LLM inference, and game state. No server-side LLM costs.
- **Reuses existing MCP infrastructure**: Tool execution flows through the
  same MCP dispatcher, preserving the tick model (ADR-0006) and response
  budget (ADR-0019). No new server endpoints.
- **Model flexibility**: Player chooses E2B (lighter, faster) or E4B
  (smarter, heavier) based on their hardware.
- **Offline-capable after first load**: Model weights are cached by the
  browser. Subsequent sessions don't re-download.
- **Privacy**: LLM inference is fully local. No data leaves the browser
  except MCP tool calls to the game server.

**Negative:**

- **Memory pressure**: E2B needs ~2GB VRAM, E4B needs ~4GB. On low-end
  devices, this may crash the tab or cause the 3D globe to fail. WebGPU + 3D
  rendering competing for VRAM is a real concern.
- **Browser support**: WebGPU is Chrome/Edge/Safari only. Firefox users
  cannot use the in-browser mode (must fall back to external MCP client).
- **Download time**: First load downloads 1.2–2.5GB from HuggingFace. This
  requires a stable connection and may take minutes on slower links.
- **LLM quality gap**: Gemma 4 E2B/E4B are smaller models than Claude/GPT-4.
  The in-browser LLM will make poorer strategic decisions than an external
  frontier-model client. This is an expected trade-off for zero-setup play.
- **Function-calling reliability**: Gemma 4's native function calling is less
  robust than frontier models. The tool-call parsing needs a fallback to
  prompt-based JSON extraction if the model's structured output is malformed.
- **Bundle size**: `@huggingface/transformers` adds to the client bundle.
  Mitigated by loading it inside the Web Worker (separate bundle) and only
  when in-browser mode is selected.
- **MCP SDK in browser**: The `@modelcontextprotocol/sdk` client classes
  were designed for Node.js but work in browsers. Edge cases (e.g., SSE
  reconnection behavior) may differ from external clients.

## Alternatives Considered

### WebLLM (`@mlc-ai/web-llm`)

High-performance WebGPU LLM engine with OpenAI-compatible API (streaming,
function calling). Rejected — no pre-compiled MLC builds for Gemma 4 models
exist. Would require compiling Gemma 4 to MLC format using the MLC LLM
toolchain + emscripten, which is non-trivial and unmaintained for this model
family.

### New direct HTTP endpoints (`/api/tools/execute`, `/api/tools/list`)

Instead of reusing the MCP SSE transport, create simple REST endpoints that
call `McpDispatcher.executeTool()` directly. Simpler than JSON-RPC over SSE.
Rejected — the user chose to reuse MCP SSE transport to maintain a single
transport path and avoid duplicating authentication, session management, and
tool-list logic. The MCP SDK's client classes handle JSON-RPC framing
transparently.

### Prompt-based tool use (no native function calling)

Describe tools in the system prompt and parse JSON tool calls from text
output, instead of using Gemma 4's native function-calling support. More
portable across models but less reliable. Rejected — Gemma 4's native
function calling produces structured output that's easier to parse and less
prone to format errors. Prompt-based parsing kept as a fallback.

### QAT mobile-optimized model variants

`google/gemma-4-E2B-it-qat-mobile-transformers` uses wNa8o8 quantization for
lower memory. Rejected for initial implementation — the standard
`onnx-community` ONNX builds have broader community usage (9.8k+ downloads/mo)
and well-tested Transformers.js compatibility. QAT variants can be added
later as a "low memory" option.

### wllama (llama.cpp WASM)

Runs GGUF models in the browser via WASM. Rejected — slower than WebGPU
inference, no native function-calling support, and would require a different
model format (GGUF) not available for Gemma 4 in the standard ecosystem.
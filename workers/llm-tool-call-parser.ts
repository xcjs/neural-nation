export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolCallToken =
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; call: ParsedToolCall };

const TC_START = String.fromCharCode(91, 84, 79, 79, 76, 95, 67, 65, 76, 76, 93);
const TC_END = String.fromCharCode(91, 47, 84, 79, 79, 76, 95, 67, 65, 76, 76, 93);

export { TC_END, TC_START };

export function parseToolCallJson(jsonStr: string): ParsedToolCall | null {
  try {
    const parsed = JSON.parse(jsonStr) as { name: string; arguments: Record<string, unknown> };
    if (typeof parsed.name !== 'string')
      return null;
    return { name: parsed.name, arguments: parsed.arguments || {} };
  }
  catch {
    return null;
  }
}

export interface StreamingToolCallParser {
  push: (token: string) => ToolCallToken[];
  flush: () => ToolCallToken[];
}

function partialMarkerSuffixLen(buf: string): number {
  const max = Math.min(buf.length, TC_START.length - 1);
  for (let len = max; len > 0; len--) {
    if (TC_START.startsWith(buf.slice(-len)))
      return len;
  }
  return 0;
}

export function createStreamingToolCallParser(): StreamingToolCallParser {
  let buffer = '';
  let toolCallDetected = false;
  let textBeforeToolCall = '';

  function emitTextBefore(): ToolCallToken[] {
    const trimmed = textBeforeToolCall.trim();
    textBeforeToolCall = '';
    return trimmed ? [{ kind: 'text', text: trimmed }] : [];
  }

  function processBuffer(): ToolCallToken[] {
    const out: ToolCallToken[] = [];

    if (!toolCallDetected) {
      const tcStartIdx = buffer.indexOf(TC_START);
      if (tcStartIdx !== -1) {
        toolCallDetected = true;
        textBeforeToolCall = buffer.slice(0, tcStartIdx);
        buffer = buffer.slice(tcStartIdx + TC_START.length);
        out.push(...processBuffer());
      }
      else {
        const partialLen = partialMarkerSuffixLen(buffer);
        const safeEnd = buffer.length - partialLen;
        if (safeEnd > 0) {
          out.push({ kind: 'text', text: buffer.slice(0, safeEnd) });
          buffer = buffer.slice(safeEnd);
        }
      }
    }
    else {
      const tcEndIdx = buffer.indexOf(TC_END);
      if (tcEndIdx !== -1) {
        out.push(...emitTextBefore());
        const jsonStr = buffer.slice(0, tcEndIdx).trim();
        const parsed = parseToolCallJson(jsonStr);
        if (parsed)
          out.push({ kind: 'tool_call', call: parsed });
        else
          out.push({ kind: 'text', text: `${TC_START}${jsonStr}${TC_END}` });
        buffer = buffer.slice(tcEndIdx + TC_END.length);
        toolCallDetected = false;
        if (buffer)
          out.push(...processBuffer());
      }
    }

    return out;
  }

  return {
    push: (token: string): ToolCallToken[] => {
      buffer += token;
      return processBuffer();
    },
    flush: (): ToolCallToken[] => {
      const out: ToolCallToken[] = [];
      if (toolCallDetected)
        out.push(...emitTextBefore());
      else if (buffer)
        out.push({ kind: 'text', text: buffer });
      buffer = '';
      toolCallDetected = false;
      textBeforeToolCall = '';
      return out;
    },
  };
}

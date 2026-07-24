export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolCallToken =
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; call: ParsedToolCall };

const TC_START = String.fromCharCode(91, 84, 79, 79, 76, 95, 67, 65, 76, 76, 93);
const TC_END = String.fromCharCode(91, 47, 84, 79, 79, 76, 95, 67, 65, 76, 76, 93);

const QWEN_START = String.fromCharCode(60, 116, 111, 111, 108, 95, 99, 97, 108, 108, 62);
const QWEN_END = String.fromCharCode(60, 47, 116, 111, 111, 108, 95, 99, 97, 108, 108, 62);

const BARE_CALL_PREFIX = String.fromCharCode(99, 97, 108, 108, 58);

const GEMMA_STR_DELIM = String.fromCharCode(60, 124, 34, 62);

export { TC_END, TC_START };

const MARKER_FORMATS: Array<{ start: string; end: string }> = [
  { start: TC_START, end: TC_END },
  { start: QWEN_START, end: QWEN_END },
];

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

export function parseGemmaArgs(content: string): Record<string, unknown> {
  const parser = new GemmaValueParser(content);
  return parser.parseObject();
}

class GemmaValueParser {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos]!))
      this.pos++;
  }

  private peek(): string {
    return this.pos < this.input.length ? this.input[this.pos]! : '';
  }

  private consume(str: string): boolean {
    if (this.input.slice(this.pos, this.pos + str.length) === str) {
      this.pos += str.length;
      return true;
    }
    return false;
  }

  parseObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.skipWhitespace();

    while (this.pos < this.input.length && this.peek() !== '}') {
      this.skipWhitespace();
      if (this.peek() === ',' || this.peek() === ';') {
        this.pos++;
        continue;
      }
      if (this.peek() === '}' || this.peek() === '')
        break;

      const key = this.parseKey();
      if (key === '')
        break;

      this.skipWhitespace();
      if (this.peek() === ':' || this.peek() === '=') {
        this.pos++;
      }
      else {
        break;
      }

      this.skipWhitespace();
      const value = this.parseValue();
      result[key] = value;

      this.skipWhitespace();
      if (this.peek() === ',' || this.peek() === ';')
        this.pos++;
    }

    return result;
  }

  private parseKey(): string {
    if (this.consume(GEMMA_STR_DELIM)) {
      const start = this.pos;
      while (this.pos < this.input.length && !this.consume(GEMMA_STR_DELIM))
        this.pos++;
      return this.input.slice(start, this.pos - GEMMA_STR_DELIM.length);
    }
    const start = this.pos;
    while (this.pos < this.input.length && /\w/.test(this.input[this.pos]!))
      this.pos++;
    return this.input.slice(start, this.pos);
  }

  private parseValue(): unknown {
    this.skipWhitespace();

    if (this.consume(GEMMA_STR_DELIM)) {
      const start = this.pos;
      while (this.pos < this.input.length && !this.consume(GEMMA_STR_DELIM))
        this.pos++;
      return this.input.slice(start, this.pos - GEMMA_STR_DELIM.length);
    }

    if (this.peek() === '{') {
      this.pos++;
      const obj = this.parseObject();
      if (this.peek() === '}')
        this.pos++;
      return obj;
    }

    if (this.peek() === '[') {
      this.pos++;
      return this.parseArray();
    }

    if (this.input.slice(this.pos, this.pos + 4) === 'true') {
      this.pos += 4;
      return true;
    }
    if (this.input.slice(this.pos, this.pos + 5) === 'false') {
      this.pos += 5;
      return false;
    }
    if (this.input.slice(this.pos, this.pos + 4) === 'null') {
      this.pos += 4;
      return null;
    }

    const numStart = this.pos;
    if (this.peek() === '-' || this.peek() === '+')
      this.pos++;
    while (this.pos < this.input.length && /[0-9.e+\-]/i.test(this.input[this.pos]!))
      this.pos++;
    const numStr = this.input.slice(numStart, this.pos);
    if (numStr !== '' && numStr !== '-' && numStr !== '+' && /\d/.test(numStr)) {
      const num = Number(numStr);
      if (!Number.isNaN(num))
        return num;
    }
    this.pos = numStart;

    const strStart = this.pos;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]!;
      if (ch === ',' || ch === ';' || ch === '}' || ch === ']' || ch === ')' || /\s/.test(ch))
        break;
      this.pos++;
    }
    return this.input.slice(strStart, this.pos);
  }

  private parseArray(): unknown[] {
    const arr: unknown[] = [];
    this.skipWhitespace();

    while (this.pos < this.input.length && this.peek() !== ']') {
      this.skipWhitespace();
      if (this.peek() === ',' || this.peek() === ';') {
        this.pos++;
        continue;
      }
      if (this.peek() === ']' || this.peek() === '')
        break;

      arr.push(this.parseValue());

      this.skipWhitespace();
      if (this.peek() === ',' || this.peek() === ';')
        this.pos++;
    }

    if (this.peek() === ']')
      this.pos++;

    return arr;
  }
}

export function parseBareCall(content: string): ParsedToolCall | null {
  const nameMatch = content.match(/^([a-z_]\w*)\{([\s\S]*)\}\s*$/i);
  if (!nameMatch)
    return null;

  const name = nameMatch[1]!;
  const argsContent = nameMatch[2]!;

  let arguments_: Record<string, unknown>;
  if (argsContent.trim() === '') {
    arguments_ = {};
  }
  else {
    try {
      arguments_ = parseGemmaArgs(argsContent);
    }
    catch {
      arguments_ = {};
    }
  }

  return { name, arguments: arguments_ };
}

export interface StreamingToolCallParser {
  push: (token: string) => ToolCallToken[];
  flush: () => ToolCallToken[];
}

const ALL_START_PATTERNS: string[] = [
  TC_START,
  QWEN_START,
  BARE_CALL_PREFIX,
];

function partialStartSuffixLen(buf: string): number {
  let maxLen = 0;
  for (const pattern of ALL_START_PATTERNS) {
    const max = Math.min(buf.length, pattern.length - 1);
    for (let len = max; len > maxLen; len--) {
      if (pattern.startsWith(buf.slice(-len))) {
        if (pattern === BARE_CALL_PREFIX && len < 2)
          continue;
        maxLen = len;
        break;
      }
    }
  }
  return maxLen;
}

type ParserState = 'scan' | 'in_marker_call' | 'in_bare_call';

export function createStreamingToolCallParser(): StreamingToolCallParser {
  let buffer = '';
  let state: ParserState = 'scan';
  let textBefore = '';
  let activeEndMarker = '';
  let bareCallName = '';

  function emitTextBefore(): ToolCallToken[] {
    const trimmed = textBefore.trim();
    textBefore = '';
    return trimmed ? [{ kind: 'text', text: trimmed }] : [];
  }

  function processBuffer(): ToolCallToken[] {
    const out: ToolCallToken[] = [];

    if (state === 'scan') {
      let found = false;
      for (const fmt of MARKER_FORMATS) {
        const idx = buffer.indexOf(fmt.start);
        if (idx !== -1) {
          textBefore = buffer.slice(0, idx);
          buffer = buffer.slice(idx + fmt.start.length);
          state = 'in_marker_call';
          activeEndMarker = fmt.end;
          found = true;
          break;
        }
      }

      if (found) {
        out.push(...processBuffer());
        return out;
      }

      const bareIdx = buffer.indexOf(BARE_CALL_PREFIX);
      if (bareIdx !== -1) {
        const afterPrefix = buffer.slice(bareIdx + BARE_CALL_PREFIX.length);
        const nameMatch = afterPrefix.match(/^([a-z_]\w*)\{/i);
        if (nameMatch) {
          textBefore = buffer.slice(0, bareIdx);
          bareCallName = nameMatch[1]!;
          buffer = afterPrefix.slice(nameMatch[0].length);
          state = 'in_bare_call';
          out.push(...processBuffer());
          return out;
        }
        const couldBeForming = afterPrefix === ''
          || /^[a-z_]*$/i.test(afterPrefix)
          || /^[a-z_]+\{?$/i.test(afterPrefix);
        if (couldBeForming) {
          if (bareIdx > 0) {
            out.push({ kind: 'text', text: buffer.slice(0, bareIdx) });
            buffer = buffer.slice(bareIdx);
          }
          return out;
        }
      }

      const partialLen = partialStartSuffixLen(buffer);
      const safeEnd = buffer.length - partialLen;
      if (safeEnd > 0) {
        out.push({ kind: 'text', text: buffer.slice(0, safeEnd) });
        buffer = buffer.slice(safeEnd);
      }
    }
    else if (state === 'in_marker_call') {
      const endIdx = buffer.indexOf(activeEndMarker);
      if (endIdx !== -1) {
        out.push(...emitTextBefore());
        const jsonStr = buffer.slice(0, endIdx).trim();
        const parsed = parseToolCallJson(jsonStr);
        if (parsed) {
          out.push({ kind: 'tool_call', call: parsed });
        }
        else {
          const bareParsed = parseBareCall(jsonStr);
          if (bareParsed) {
            out.push({ kind: 'tool_call', call: bareParsed });
          }
          else {
            out.push({ kind: 'text', text: jsonStr });
          }
        }
        buffer = buffer.slice(endIdx + activeEndMarker.length);
        state = 'scan';
        activeEndMarker = '';
        if (buffer)
          out.push(...processBuffer());
      }
    }
    else if (state === 'in_bare_call') {
      let depth = 1;
      let i = 0;
      while (i < buffer.length) {
        const ch = buffer[i]!;
        if (ch === '{')
          depth++;
        else if (ch === '}')
          depth--;
        if (depth === 0)
          break;
        i++;
      }

      if (depth === 0 && i < buffer.length) {
        out.push(...emitTextBefore());
        const argsContent = buffer.slice(0, i);
        const parsed = parseBareCall(`${bareCallName}{${argsContent}}`);
        if (parsed) {
          out.push({ kind: 'tool_call', call: parsed });
        }
        else {
          out.push({ kind: 'tool_call', call: { name: bareCallName, arguments: {} } });
        }
        buffer = buffer.slice(i + 1);
        state = 'scan';
        bareCallName = '';
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
      if (state === 'in_marker_call') {
        out.push(...emitTextBefore());
      }
      else if (state === 'in_bare_call') {
        out.push(...emitTextBefore());
        if (buffer.trim() || bareCallName) {
          let args: Record<string, unknown> = {};
          try {
            args = parseGemmaArgs(buffer);
          }
          catch {
            args = {};
          }
          out.push({ kind: 'tool_call', call: { name: bareCallName, arguments: args } });
        }
      }
      else if (buffer) {
        out.push({ kind: 'text', text: buffer });
      }
      buffer = '';
      state = 'scan';
      textBefore = '';
      activeEndMarker = '';
      bareCallName = '';
      return out;
    },
  };
}

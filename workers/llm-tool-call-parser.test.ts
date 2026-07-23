import { describe, expect, it } from 'vitest';
import { createStreamingToolCallParser, parseToolCallJson, TC_END, TC_START } from './llm-tool-call-parser';

describe('parseToolCallJson', () => {
  it('parses a well-formed tool call JSON', () => {
    const result = parseToolCallJson(JSON.stringify({ name: 'get_game_state', arguments: { foo: 1 } }));
    expect(result).toEqual({ name: 'get_game_state', arguments: { foo: 1 } });
  });

  it('defaults arguments to empty object when missing', () => {
    const result = parseToolCallJson(JSON.stringify({ name: 'build_facility' }));
    expect(result).toEqual({ name: 'build_facility', arguments: {} });
  });

  it('returns null when name is not a string', () => {
    const result = parseToolCallJson(JSON.stringify({ name: 42, arguments: {} }));
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseToolCallJson('not json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseToolCallJson('')).toBeNull();
  });
});

describe('createStreamingToolCallParser', () => {
  it('emits plain text tokens unchanged', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('Hello world');
    expect(out).toEqual([{ kind: 'text', text: 'Hello world' }]);
  });

  it('detects a complete tool call in a single token', () => {
    const parser = createStreamingToolCallParser();
    const payload = JSON.stringify({ name: 'advance_tick', arguments: {} });
    const out = parser.push(`${TC_START}${payload}${TC_END}`);
    expect(out).toEqual([{ kind: 'tool_call', call: { name: 'advance_tick', arguments: {} } }]);
  });

  it('emits text preceding a tool call', () => {
    const parser = createStreamingToolCallParser();
    const payload = JSON.stringify({ name: 'advance_tick', arguments: {} });
    const out = parser.push(`Thinking... ${TC_START}${payload}${TC_END}`);
    expect(out[0]).toMatchObject({ kind: 'text', text: 'Thinking...' });
    expect(out[1]).toMatchObject({ kind: 'tool_call', call: { name: 'advance_tick' } });
  });

  it('handles a tool call split across multiple tokens', () => {
    const parser = createStreamingToolCallParser();
    const payload = JSON.stringify({ name: 'build_facility', arguments: { type: 'Extractor' } });
    const part1 = `${TC_START}${payload.slice(0, 10)}`;
    const part2 = `${payload.slice(10)}${TC_END} done`;

    const out1 = parser.push(part1);
    const out2 = parser.push(part2);

    expect(out1).toEqual([]);
    expect(out2[0]).toMatchObject({ kind: 'tool_call', call: { name: 'build_facility' } });
    expect(out2[1]).toMatchObject({ kind: 'text', text: ' done' });
  });

  it('emits incomplete text as text token only when safe (not partial marker prefix)', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('abc');
    expect(out).toEqual([{ kind: 'text', text: 'abc' }]);
  });

  it('holds back text that could be the start of a tool-call marker', () => {
    const parser = createStreamingToolCallParser();
    // TC_START begins with '[' — push text that ends with a prefix of TC_START
    const partial = `x${TC_START.slice(0, 3)}`;
    const out = parser.push(partial);
    // The parser keeps the partial-marker suffix in the buffer, emits only the safe prefix
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('text');
    const textTok = out[0]!;
    if (textTok.kind === 'text')
      expect(textTok.text).toBe('x');
  });

  it('flush emits buffered text held back as a partial marker prefix', () => {
    const parser = createStreamingToolCallParser();
    // 'foo[' ends with a one-char prefix of TC_START ('['), so push emits 'foo' and holds back '['
    const pushed = parser.push('foo[');
    expect(pushed).toEqual([{ kind: 'text', text: 'foo' }]);
    const out = parser.flush();
    expect(out).toEqual([{ kind: 'text', text: '[' }]);
  });

  it('flush emits text-before-tool-call when a tool call marker was started but never closed', () => {
    const parser = createStreamingToolCallParser();
    parser.push(`text before ${TC_START}incomplete`);
    const out = parser.flush();
    expect(out).toEqual([{ kind: 'text', text: 'text before' }]);
  });

  it('detects multiple tool calls in a single token', () => {
    const parser = createStreamingToolCallParser();
    const p1 = JSON.stringify({ name: 'a', arguments: {} });
    const p2 = JSON.stringify({ name: 'b', arguments: { x: 1 } });
    const out = parser.push(`${TC_START}${p1}${TC_END}${TC_START}${p2}${TC_END}`);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: 'tool_call', call: { name: 'a' } });
    expect(out[1]).toMatchObject({ kind: 'tool_call', call: { name: 'b', arguments: { x: 1 } } });
  });

  it('emits malformed tool-call payload back as text', () => {
    const parser = createStreamingToolCallParser();
    const bad = 'not json';
    const out = parser.push(`${TC_START}${bad}${TC_END}`);
    expect(out).toEqual([{ kind: 'text', text: `${TC_START}${bad}${TC_END}` }]);
  });
});

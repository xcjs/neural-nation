import { describe, expect, it } from 'vitest';
import { createStreamingToolCallParser, parseBareCall, parseToolCallJson, TC_END, TC_START } from './llm-tool-call-parser';

const QWEN_START = String.fromCharCode(60, 116, 111, 111, 108, 95, 99, 97, 108, 108, 62);
const QWEN_END = String.fromCharCode(60, 47, 116, 111, 111, 108, 95, 99, 97, 108, 108, 62);

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

describe('parseBareCall', () => {
  it('parses a bare call with empty args', () => {
    const result = parseBareCall('survey_planet{}');
    expect(result).toEqual({ name: 'survey_planet', arguments: {} });
  });

  it('parses a bare call with string value', () => {
    const result = parseBareCall('build_facility{type:Extractor}');
    expect(result).toEqual({ name: 'build_facility', arguments: { type: 'Extractor' } });
  });

  it('parses a bare call with multiple args', () => {
    const result = parseBareCall('build_facility{type:Extractor,lat:40.0,lon:-75.0}');
    expect(result).toEqual({
      name: 'build_facility',
      arguments: { type: 'Extractor', lat: 40.0, lon: -75.0 },
    });
  });

  it('parses a bare call with boolean and null values', () => {
    const result = parseBareCall('set_flag{enabled:true,disabled:false,thing:null}');
    expect(result).toEqual({
      name: 'set_flag',
      arguments: { enabled: true, disabled: false, thing: null },
    });
  });

  it('parses a bare call with nested object', () => {
    const result = parseBareCall('do_thing{config:{name:test,value:42}}');
    expect(result).toEqual({
      name: 'do_thing',
      arguments: { config: { name: 'test', value: 42 } },
    });
  });

  it('parses a bare call with array', () => {
    const result = parseBareCall('do_thing{items:[a,b,c]}');
    expect(result).toEqual({
      name: 'do_thing',
      arguments: { items: ['a', 'b', 'c'] },
    });
  });

  it('returns null for invalid format', () => {
    expect(parseBareCall('not a call')).toBeNull();
  });

  it('returns null for missing braces', () => {
    expect(parseBareCall('survey_planet')).toBeNull();
  });
});

describe('createStreamingToolCallParser - legacy format', () => {
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
    const partial = `x${TC_START.slice(0, 3)}`;
    const out = parser.push(partial);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('text');
    const textTok = out[0]!;
    if (textTok.kind === 'text')
      expect(textTok.text).toBe('x');
  });

  it('flush emits buffered text held back as a partial marker prefix', () => {
    const parser = createStreamingToolCallParser();
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
    expect(out).toEqual([{ kind: 'text', text: 'not json' }]);
  });
});

describe('createStreamingToolCallParser - Qwen format', () => {
  it('detects a complete Qwen-format tool call', () => {
    const parser = createStreamingToolCallParser();
    const payload = JSON.stringify({ name: 'get_game_state', arguments: {} });
    const out = parser.push(`${QWEN_START}${payload}${QWEN_END}`);
    expect(out).toEqual([{ kind: 'tool_call', call: { name: 'get_game_state', arguments: {} } }]);
  });

  it('emits text before a Qwen-format tool call', () => {
    const parser = createStreamingToolCallParser();
    const payload = JSON.stringify({ name: 'survey_region', arguments: { lat: 0, lon: 0, radius: 1.0 } });
    const out = parser.push(`Sure! ${QWEN_START}${payload}${QWEN_END}`);
    expect(out[0]).toMatchObject({ kind: 'text', text: 'Sure!' });
    expect(out[1]).toMatchObject({ kind: 'tool_call', call: { name: 'survey_region' } });
  });

  it('handles Qwen tool call split across tokens', () => {
    const parser = createStreamingToolCallParser();
    const payload = JSON.stringify({ name: 'advance_tick', arguments: {} });
    const part1 = `${QWEN_START}${payload.slice(0, 5)}`;
    const part2 = `${payload.slice(5)}${QWEN_END} done`;

    const out1 = parser.push(part1);
    const out2 = parser.push(part2);

    expect(out1).toEqual([]);
    expect(out2[0]).toMatchObject({ kind: 'tool_call', call: { name: 'advance_tick' } });
    expect(out2[1]).toMatchObject({ kind: 'text', text: ' done' });
  });
});

describe('createStreamingToolCallParser - bare call format', () => {
  it('detects a bare call with empty args in a single token', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('I will survey now. call:survey_planet{}');
    expect(out[out.length - 1]).toMatchObject({ kind: 'tool_call', call: { name: 'survey_planet', arguments: {} } });
  });

  it('detects a bare call with args', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('call:build_facility{type:Extractor,lat:40.0}');
    expect(out).toContainEqual({ kind: 'tool_call', call: { name: 'build_facility', arguments: { type: 'Extractor', lat: 40.0 } } });
  });

  it('detects a bare call with nested braces', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('call:do_thing{config:{name:test,value:42}}');
    expect(out).toContainEqual({
      kind: 'tool_call',
      call: { name: 'do_thing', arguments: { config: { name: 'test', value: 42 } } },
    });
  });

  it('emits text before a bare call', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('Initiating survey. call:survey_planet{}');
    expect(out[0]).toMatchObject({ kind: 'text', text: 'Initiating survey.' });
    expect(out[out.length - 1]).toMatchObject({ kind: 'tool_call', call: { name: 'survey_planet' } });
  });

  it('handles bare call split across tokens', () => {
    const parser = createStreamingToolCallParser();
    const out1 = parser.push('call:survey_planet{');
    const out2 = parser.push('} done');
    expect(out1).toEqual([]);
    expect(out2[0]).toMatchObject({ kind: 'tool_call', call: { name: 'survey_planet', arguments: {} } });
    expect(out2[1]).toMatchObject({ kind: 'text', text: ' done' });
  });

  it('handles bare call with args split across tokens', () => {
    const parser = createStreamingToolCallParser();
    const out1 = parser.push('call:build_facility{type:Extra');
    const out2 = parser.push('ctor,lat:40.0} done');
    expect(out1).toEqual([]);
    expect(out2[0]).toMatchObject({ kind: 'tool_call', call: { name: 'build_facility' } });
    expect(out2[out2.length - 1]).toMatchObject({ kind: 'text', text: ' done' });
  });

  it('flush emits buffered bare call content', () => {
    const parser = createStreamingToolCallParser();
    parser.push('call:survey_planet{incomplete');
    const out = parser.flush();
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]).toMatchObject({ kind: 'tool_call', call: { name: 'survey_planet' } });
  });

  it('does not false-positive on the word call in prose', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('I will call you tomorrow');
    expect(out).toEqual([{ kind: 'text', text: 'I will call you tomorrow' }]);
  });

  it('does not false-positive on call: in prose without a valid name+brace', () => {
    const parser = createStreamingToolCallParser();
    const out = parser.push('Please call: the office');
    const text = out.filter(t => t.kind === 'text').map(t => t.kind === 'text' ? t.text : '').join('');
    expect(text).toContain('call');
  });
});

import type { ChatMessage, ToolCallRecord } from './chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from './chat';

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hi',
    toolCalls: [],
    isStreaming: false,
    timestamp: 1000,
    ...overrides,
  };
}

function makeToolCall(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: 'tc1',
    toolName: 'get_game_state',
    args: {},
    result: null,
    status: 'executing',
    ...overrides,
  };
}

describe('chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('addMessage', () => {
    it('appends a message to the list', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      expect(chat.messages).toHaveLength(1);
      expect(chat.messages[0]!.id).toBe('m1');
    });
  });

  describe('updateMessageContent', () => {
    it('replaces content for the matching id', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.updateMessageContent('m1', 'updated');
      expect(chat.messages[0]!.content).toBe('updated');
    });

    it('no-ops for unknown id', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.updateMessageContent('missing', 'x');
      expect(chat.messages[0]!.content).toBe('hi');
    });
  });

  describe('appendMessageContent', () => {
    it('appends a chunk to existing content', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg({ content: 'foo' }));
      chat.appendMessageContent('m1', 'bar');
      expect(chat.messages[0]!.content).toBe('foobar');
    });

    it('no-ops for unknown id', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.appendMessageContent('missing', 'bar');
      expect(chat.messages[0]!.content).toBe('hi');
    });
  });

  describe('finishStreaming', () => {
    it('sets isStreaming false for the matching id', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg({ isStreaming: true }));
      chat.finishStreaming('m1');
      expect(chat.messages[0]!.isStreaming).toBe(false);
    });

    it('no-ops for unknown id', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg({ isStreaming: true }));
      chat.finishStreaming('missing');
      expect(chat.messages[0]!.isStreaming).toBe(true);
    });
  });

  describe('tool calls', () => {
    it('addToolCall attaches a call to the matching message', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.addToolCall('m1', makeToolCall());
      expect(chat.messages[0]!.toolCalls).toHaveLength(1);
      expect(chat.messages[0]!.toolCalls[0]!.toolName).toBe('get_game_state');
    });

    it('addToolCall no-ops for unknown messageId', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.addToolCall('missing', makeToolCall());
      expect(chat.messages[0]!.toolCalls).toHaveLength(0);
    });

    it('updateToolCall merges updates into the matching call', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.addToolCall('m1', makeToolCall());
      chat.updateToolCall('m1', 'tc1', { status: 'complete', result: { status: 'success', data: { tick: 5 } } });
      expect(chat.messages[0]!.toolCalls[0]!.status).toBe('complete');
      expect(chat.messages[0]!.toolCalls[0]!.result).toEqual({ status: 'success', data: { tick: 5 } });
    });

    it('updateToolCall no-ops for unknown messageId', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.addToolCall('m1', makeToolCall());
      chat.updateToolCall('missing', 'tc1', { status: 'complete' });
      expect(chat.messages[0]!.toolCalls[0]!.status).toBe('executing');
    });

    it('updateToolCall no-ops for unknown callId', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.addToolCall('m1', makeToolCall());
      chat.updateToolCall('m1', 'missing', { status: 'complete' });
      expect(chat.messages[0]!.toolCalls[0]!.status).toBe('executing');
    });
  });

  describe('clear', () => {
    it('empties messages, input, and resets status/error/activeToolCallId', () => {
      const chat = useChatStore();
      chat.addMessage(makeMsg());
      chat.input = 'pending text';
      chat.status = 'generating';
      chat.errorMessage = 'boom';
      chat.activeToolCallId = 'tc1';

      chat.clear();

      expect(chat.messages).toHaveLength(0);
      expect(chat.input).toBe('');
      expect(chat.status).toBe('idle');
      expect(chat.errorMessage).toBe('');
      expect(chat.activeToolCallId).toBeNull();
    });

    it('preserves currentModel and downloadProgress', () => {
      const chat = useChatStore();
      chat.currentModel = 'E2B';
      chat.downloadProgress = { 'model.onnx': { loaded: 50, total: 100 } };
      chat.addMessage(makeMsg());

      chat.clear();

      expect(chat.currentModel).toBe('E2B');
      expect(chat.downloadProgress).toEqual({ 'model.onnx': { loaded: 50, total: 100 } });
    });
  });

  describe('reset', () => {
    it('clears everything including currentModel and downloadProgress', () => {
      const chat = useChatStore();
      chat.currentModel = 'E2B';
      chat.downloadProgress = { 'model.onnx': { loaded: 50, total: 100 } };
      chat.addMessage(makeMsg());
      chat.status = 'generating';

      chat.reset();

      expect(chat.messages).toHaveLength(0);
      expect(chat.currentModel).toBeNull();
      expect(chat.downloadProgress).toBeNull();
      expect(chat.status).toBe('idle');
    });
  });
});

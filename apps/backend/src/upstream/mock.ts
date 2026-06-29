import type { ChunkEvent, DoneEvent, ToolCallEvent } from '@sage/sse-contract';
import type { InferenceRequest, InferenceUpstream } from './types';

function lastUserText(req: InferenceRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m && m.role === 'user' && 'content' in m) return m.content;
  }
  return '';
}

/**
 * Deterministic mock upstream. Streams a few chunks, optionally demonstrates a
 * cloud tool_call (when the prompt mentions search/research), and returns a
 * done event. Requires no API key — lets the whole contract run in CI / here.
 */
export function createMockUpstream(): InferenceUpstream {
  return {
    async *stream(
      req: InferenceRequest,
      signal: AbortSignal,
    ): AsyncGenerator<ChunkEvent | ToolCallEvent, DoneEvent> {
      const text = `Mock response from ${req.model}. The device owns the loop; the server returned one cycle.`;
      const tokens = text.match(/\S+\s*/g) ?? [text];
      let index = 0;
      for (const tok of tokens) {
        if (signal.aborted) break;
        yield { type: 'chunk', delta: tok, index: index++, finish_reason: null };
      }

      if (/search|research|look up/i.test(lastUserText(req))) {
        yield {
          type: 'tool_call',
          id: 'tc_mock_1',
          name: 'web_search',
          arguments: { query: lastUserText(req).slice(0, 64) },
          domain: 'cloud',
        };
      }

      const completion = index;
      return {
        type: 'done',
        stop_reason: 'stop',
        model: req.model,
        usage: {
          prompt_tokens: req.messages.length * 8,
          completion_tokens: completion,
          total_tokens: req.messages.length * 8 + completion,
        },
      };
    },
  };
}

import type { SageErrorCode, ToolCall, ToolResult } from '@sage/shared-types';
import type { InferenceEvent, InferenceTarget } from './events';
import type { CloudToolClient, MobileToolHandler } from './toolDomainRouter';

/**
 * Scripted inference target for tests: returns one pre-baked event list per
 * cycle (run() call), so multi-cycle tool loops are deterministic.
 */
export function createScriptedTarget(cycles: InferenceEvent[][]): InferenceTarget {
  let i = 0;
  return {
    async *run(): AsyncIterable<InferenceEvent> {
      const cycle = cycles[i] ?? [{ type: 'done', stopReason: 'stop', model: 'mock' }];
      i += 1;
      for (const evt of cycle) yield evt;
    },
  };
}

/** A target whose first event is always a retryable error (for degradation tests). */
export function createFailingTarget(code: SageErrorCode = 'UPSTREAM_ERROR'): InferenceTarget {
  return {
    async *run(): AsyncIterable<InferenceEvent> {
      yield { type: 'error', code, message: 'mock failure', retryable: true };
    },
  };
}

/** Mobile tool handler that echoes a success result. */
export const okMobileHandler: MobileToolHandler = async (call: ToolCall) => ({
  tool_call_id: call.id,
  name: call.name,
  content: JSON.stringify({ ok: true, tool: call.name, args: call.arguments }),
});

/** Cloud tool client that echoes a success result. */
export const okCloudClient: CloudToolClient = {
  async call(call: ToolCall): Promise<ToolResult> {
    return {
      tool_call_id: call.id,
      name: call.name,
      content: JSON.stringify({ ok: true, tool: call.name, cloud: true }),
    };
  },
};

/** Convenience builders for scripted cycles. */
export const cycle = {
  toolCall(call: ToolCall): InferenceEvent[] {
    return [
      { type: 'tool_call', call },
      { type: 'done', stopReason: 'tool_calls', model: 'mock' },
    ];
  },
  text(s: string): InferenceEvent[] {
    return [
      { type: 'text', delta: s },
      { type: 'done', stopReason: 'stop', model: 'mock' },
    ];
  },
};

import type {
  MemoryFragment,
  Message,
  RoutingTarget,
  SageErrorCode,
  ToolCall,
} from '@sage/shared-types';

/**
 * Normalized inference event. Both the local (llama.cpp) and cloud
 * (/api/sage/infer SSE) targets produce this same stream, so the ReActLoop is
 * uniform across targets.
 */
export type InferenceEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; stopReason: string; model: string }
  | { type: 'error'; code: SageErrorCode; message: string; retryable: boolean };

export interface InferenceRequest {
  model: string;
  messages: Message[];
  memories?: MemoryFragment[];
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
}

/** One inference cycle. Yields a normalized event stream; never loops. */
export interface InferenceTarget {
  run(req: InferenceRequest, signal: AbortSignal): AsyncIterable<InferenceEvent>;
}

/** Resolves a routing target to its concrete engine. */
export interface TargetResolver {
  local: InferenceTarget;
  cloud: InferenceTarget;
}

export function resolveTarget(
  resolver: TargetResolver,
  target: RoutingTarget,
): InferenceTarget {
  return target === 'local' ? resolver.local : resolver.cloud;
}

import type { Message, MemoryFragment } from '@sage/shared-types';
import type { ChunkEvent, DoneEvent, ToolCallEvent } from '@sage/sse-contract';

export interface InferenceRequest {
  model: string;
  /** Messages with memories already injected verbatim by the route. */
  messages: Message[];
  /** Original opaque memory fragments (count used for diagnostics only). */
  memories: MemoryFragment[];
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * One inference cycle. Yields chunk/tool_call events and RETURNS the terminal
 * done event. Constitutional Constraint 3: this is a single pass — no looping,
 * no cross-call state. The route frames it with heartbeats and error handling.
 */
export interface InferenceUpstream {
  stream(
    req: InferenceRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChunkEvent | ToolCallEvent, DoneEvent>;
}

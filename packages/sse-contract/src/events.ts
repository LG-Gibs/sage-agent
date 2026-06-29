import type { SageErrorCode, ToolDomain, ToolName } from '@sage/shared-types';

/**
 * SAGE Backend v3 SSE stream contract.
 *
 * POST /api/sage/infer streams exactly these five event types. The mobile
 * ReActLoop (Phase 3) must handle all of them; `heartbeat` resets the
 * connection timeout and is otherwise ignored.
 */

export interface ChunkEvent {
  type: 'chunk';
  delta: string;
  index: number;
  finish_reason: string | null;
}

export interface ToolCallEvent {
  type: 'tool_call';
  id: string;
  name: ToolName;
  arguments: Record<string, unknown>;
  domain: ToolDomain;
}

export interface DoneEvent {
  type: 'done';
  stop_reason: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ErrorEvent {
  type: 'error';
  code: SageErrorCode;
  message: string;
  retryable: boolean;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  ts: number;
}

export type SageStreamEvent =
  | ChunkEvent
  | ToolCallEvent
  | DoneEvent
  | ErrorEvent
  | HeartbeatEvent;

export type SageEventType = SageStreamEvent['type'];

export const SAGE_EVENT_TYPES: readonly SageEventType[] = [
  'chunk',
  'tool_call',
  'done',
  'error',
  'heartbeat',
];

export function isSageEventType(name: string): name is SageEventType {
  return (SAGE_EVENT_TYPES as readonly string[]).includes(name);
}

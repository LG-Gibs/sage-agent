import type { ToolCall } from './tools';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface TextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Tool calls requested on an assistant turn. */
  tool_calls?: ToolCall[];
}

export interface ToolMessage {
  role: 'tool';
  tool_call_id: string;
  name: string;
  content: string;
}

export type Message = TextMessage | ToolMessage;

/**
 * Opaque memory fragment retrieved on-device from sqlite-vec and injected into
 * an inference request as `memories[]`.
 *
 * Constitutional Constraint 5 — MEMORY IS ON-DEVICE AND NEVER SYNCED.
 * The backend receives these as opaque prompt fragments and does not store,
 * search, rank or embed them. `score` is local-only context for the device.
 */
export interface MemoryFragment {
  id: string;
  text: string;
  score?: number;
}

import type { SageErrorCode, ToolName } from '@sage/shared-types';
import {
  type SageStreamEvent,
  type SageEventType,
  isSageEventType,
} from './events';

/** Thrown when a known event type arrives with a malformed payload. */
export class SseProtocolError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = 'SseProtocolError';
  }
}

/**
 * Incremental, allocation-frugal SSE parser.
 *
 * Feed it arbitrary text chunks (which may split mid-event); it buffers and
 * emits whole `SageStreamEvent`s as event blocks complete. Unknown event names
 * are ignored for forward-compatibility; known-but-malformed payloads throw
 * `SseProtocolError` so contract drift is caught loudly in tests.
 */
export class SseParser {
  private buffer = '';

  push(textChunk: string): SageStreamEvent[] {
    // Normalize CRLF -> LF so boundary detection is uniform.
    this.buffer += textChunk.replace(/\r\n/g, '\n');
    const out: SageStreamEvent[] = [];
    let sep: number;
    while ((sep = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      const evt = this.parseBlock(block);
      if (evt) out.push(evt);
    }
    return out;
  }

  /** Flush any trailing block not terminated by a blank line (end of stream). */
  flush(): SageStreamEvent[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    if (!rest) return [];
    const evt = this.parseBlock(rest);
    return evt ? [evt] : [];
  }

  private parseBlock(block: string): SageStreamEvent | null {
    let eventName: string | null = null;
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue; // blank or comment
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1); // SSE: strip one leading space
      if (field === 'event') eventName = value;
      else if (field === 'data') dataLines.push(value);
      // `id` / `retry` fields are accepted and ignored by this contract.
    }

    if (eventName === null) return null;
    if (!isSageEventType(eventName)) return null; // forward-compatible: ignore unknown

    const dataRaw = dataLines.join('\n');
    let data: Record<string, unknown>;
    try {
      data = dataRaw ? JSON.parse(dataRaw) : {};
    } catch {
      throw new SseProtocolError(
        `Invalid JSON for "${eventName}" event`,
        dataRaw,
      );
    }
    return this.toEvent(eventName, data, dataRaw);
  }

  private toEvent(
    type: SageEventType,
    d: Record<string, unknown>,
    raw: string,
  ): SageStreamEvent {
    switch (type) {
      case 'chunk':
        req(typeof d.delta === 'string', 'chunk.delta', raw);
        req(typeof d.index === 'number', 'chunk.index', raw);
        req(
          d.finish_reason === null || typeof d.finish_reason === 'string',
          'chunk.finish_reason',
          raw,
        );
        return {
          type,
          delta: d.delta as string,
          index: d.index as number,
          finish_reason: (d.finish_reason as string | null) ?? null,
        };
      case 'tool_call':
        req(typeof d.id === 'string', 'tool_call.id', raw);
        req(typeof d.name === 'string', 'tool_call.name', raw);
        req(
          d.domain === 'mobile' || d.domain === 'cloud',
          'tool_call.domain',
          raw,
        );
        req(
          typeof d.arguments === 'object' && d.arguments !== null,
          'tool_call.arguments',
          raw,
        );
        return {
          type,
          id: d.id as string,
          name: d.name as ToolName,
          arguments: d.arguments as Record<string, unknown>,
          domain: d.domain as 'mobile' | 'cloud',
        };
      case 'done':
        req(typeof d.stop_reason === 'string', 'done.stop_reason', raw);
        req(typeof d.model === 'string', 'done.model', raw);
        req(
          typeof d.usage === 'object' && d.usage !== null,
          'done.usage',
          raw,
        );
        return {
          type,
          stop_reason: d.stop_reason as string,
          model: d.model as string,
          usage: d.usage as DoneUsage,
        };
      case 'error':
        req(typeof d.code === 'string', 'error.code', raw);
        req(typeof d.message === 'string', 'error.message', raw);
        req(typeof d.retryable === 'boolean', 'error.retryable', raw);
        return {
          type,
          code: d.code as SageErrorCode,
          message: d.message as string,
          retryable: d.retryable as boolean,
        };
      case 'heartbeat':
        req(typeof d.ts === 'number', 'heartbeat.ts', raw);
        return { type, ts: d.ts as number };
    }
  }
}

interface DoneUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

function req(cond: boolean, field: string, raw: string): asserts cond {
  if (!cond) throw new SseProtocolError(`Missing/invalid field: ${field}`, raw);
}

/** Serialize an event to the canonical SSE wire format (used by the server). */
export function serializeSseEvent(evt: SageStreamEvent): string {
  const { type, ...rest } = evt;
  return `event: ${type}\ndata: ${JSON.stringify(rest)}\n\n`;
}

/**
 * Decode a binary SSE response body into typed events.
 * Convenience for the ReActLoop and for integration tests using fetch().
 */
export async function* decodeSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SageStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const evt of parser.push(decoder.decode(value, { stream: true }))) {
        yield evt;
      }
    }
    for (const evt of parser.flush()) yield evt;
  } finally {
    reader.releaseLock();
  }
}

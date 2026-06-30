import { decodeSseStream } from '@sage/sse-contract';
import type { SageErrorCode } from '@sage/shared-types';
import type { InferenceEvent, InferenceRequest, InferenceTarget } from './events';

export interface CloudTargetConfig {
  /** SAGE Backend v3 base URL, e.g. https://api.sage.example */
  baseUrl: string;
  /** SAGE session token (NOT an upstream provider key). */
  sessionToken?: string;
}

/**
 * Cloud inference target — calls POST /api/sage/infer and maps the Backend v3
 * SSE stream into normalized InferenceEvents. The device sends the model the
 * SageRouter chose plus opaque memories[]; the server validates, allowlist-
 * checks, and streams one cycle back (Constraints 2, 3, 5).
 */
export function createCloudTarget(config: CloudTargetConfig): InferenceTarget {
  return {
    async *run(req: InferenceRequest, signal: AbortSignal): AsyncIterable<InferenceEvent> {
      let res: Response;
      try {
        res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/sage/infer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.sessionToken
              ? { Authorization: `Bearer ${config.sessionToken}` }
              : {}),
          },
          body: JSON.stringify({
            model: req.model,
            target: 'cloud',
            messages: req.messages,
            memories: req.memories ?? [],
            tools: req.tools,
            temperature: req.temperature,
            max_tokens: req.maxTokens,
          }),
          signal,
        });
      } catch (err) {
        yield {
          type: 'error',
          code: 'TIMEOUT',
          message: err instanceof Error ? err.message : 'network error',
          retryable: true,
        };
        return;
      }

      // Non-streaming error responses (e.g. 403 allowlist, 400 validation).
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code?: SageErrorCode; message?: string; retryable?: boolean };
        } | null;
        const e = body?.error;
        yield {
          type: 'error',
          code: e?.code ?? 'UPSTREAM_ERROR',
          message: e?.message ?? `Backend returned ${res.status}`,
          retryable: e?.retryable ?? res.status >= 500,
        };
        return;
      }

      for await (const evt of decodeSseStream(res.body as ReadableStream<Uint8Array>)) {
        switch (evt.type) {
          case 'chunk':
            if (evt.delta) yield { type: 'text', delta: evt.delta };
            break;
          case 'tool_call':
            yield {
              type: 'tool_call',
              call: {
                id: evt.id,
                name: evt.name,
                arguments: evt.arguments,
                domain: evt.domain,
              },
            };
            break;
          case 'done':
            yield { type: 'done', stopReason: evt.stop_reason, model: evt.model };
            break;
          case 'error':
            yield {
              type: 'error',
              code: evt.code,
              message: evt.message,
              retryable: evt.retryable,
            };
            break;
          case 'heartbeat':
            break; // reset-timeout only; nothing to process
        }
      }
    },
  };
}

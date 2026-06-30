import type { ToolCall, ToolDomain, ToolName } from '@sage/shared-types';
import type { InferenceEvent, InferenceRequest, InferenceTarget } from './events';

/**
 * Streams tokens from an on-device model (llama.cpp). The mobile app supplies
 * this by wrapping its llama.rn engine; core stays platform-agnostic.
 */
export type LocalGenerate = (
  req: InferenceRequest,
  onToken: (token: string) => void,
  signal: AbortSignal,
) => Promise<{ stopReason: string }>;

export interface LocalTargetOptions {
  /** Resolves a tool name to its domain (defaults stamp 'mobile'). */
  domainOf?: (name: string) => ToolDomain;
}

const TOOL_CALL_RE = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

/**
 * Local inference target. Local GGUF models don't have a native tool-call
 * channel, so we adopt a simple convention: the model emits one or more
 * <tool_call>{"name":...,"arguments":{...}}</tool_call> blocks. We stream the
 * surrounding prose as text and surface parsed tool calls, then `done`.
 */
export function createLocalTarget(
  generate: LocalGenerate,
  options: LocalTargetOptions = {},
): InferenceTarget {
  const domainOf = options.domainOf ?? (() => 'mobile' as ToolDomain);

  return {
    async *run(req: InferenceRequest, signal: AbortSignal): AsyncIterable<InferenceEvent> {
      let buffer = '';
      const queue: string[] = [];
      let stop = { stopReason: 'stop' };
      try {
        stop = await generate(
          req,
          (tok) => {
            buffer += tok;
            queue.push(tok);
          },
          signal,
        );
      } catch (err) {
        yield {
          type: 'error',
          code: 'NOT_INSTALLED',
          message: err instanceof Error ? err.message : 'local inference failed',
          retryable: true,
        };
        return;
      }

      // Emit prose with tool-call markup stripped.
      const prose = buffer.replace(TOOL_CALL_RE, '').trim();
      if (prose) yield { type: 'text', delta: prose };

      // Emit any parsed tool calls.
      let m: RegExpExecArray | null;
      let i = 0;
      TOOL_CALL_RE.lastIndex = 0;
      while ((m = TOOL_CALL_RE.exec(buffer)) !== null) {
        const parsed = safeParse(m[1] ?? '');
        if (!parsed?.name) continue;
        const name = parsed.name as ToolName;
        const call: ToolCall = {
          id: `local_tc_${i++}`,
          name,
          arguments: (parsed.arguments as Record<string, unknown>) ?? {},
          domain: domainOf(name),
        };
        yield { type: 'tool_call', call };
      }

      yield { type: 'done', stopReason: stop.stopReason, model: req.model };
    },
  };
}

function safeParse(s: string): { name?: string; arguments?: unknown } | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

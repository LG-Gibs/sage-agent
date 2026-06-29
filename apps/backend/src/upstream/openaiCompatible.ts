import type { ChunkEvent, DoneEvent, ToolCallEvent } from '@sage/sse-contract';
import type { ToolDomain, ToolName } from '@sage/shared-types';
import { defaultToolRegistry } from '@sage/tool-registry';
import type { BackendConfig } from '../config';
import type { InferenceRequest, InferenceUpstream } from './types';

/**
 * A single OpenAI-compatible streaming adapter that serves BOTH:
 *  - OpenRouter      (spec's prescribed Cloud Inference Gateway), and
 *  - Azure AI Foundry (the user's stated provider preference) —
 * since both speak the OpenAI /chat/completions streaming schema. The only
 * differences (base URL shape and auth header) are config-driven.
 */
export function createOpenAiCompatibleUpstream(
  config: BackendConfig,
): InferenceUpstream {
  return {
    async *stream(
      req: InferenceRequest,
      signal: AbortSignal,
    ): AsyncGenerator<ChunkEvent | ToolCallEvent, DoneEvent> {
      const { url, headers } = buildEndpoint(config, req.model);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          tools: req.tools,
        }),
        signal,
      });

      if (!res.ok || !res.body) {
        const detail = await safeText(res);
        throw new Error(`Upstream ${res.status}: ${detail}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let index = 0;
      let model = req.model;
      let stopReason = 'stop';
      let usage: DoneEvent['usage'] = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      const toolAcc = new Map<number, { id: string; name: string; args: string }>();

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let json: OpenAiChunk;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          if (json.model) model = json.model;
          if (json.usage) usage = normalizeUsage(json.usage);
          const choice = json.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) stopReason = choice.finish_reason;

          const delta = choice.delta?.content;
          if (typeof delta === 'string' && delta.length) {
            yield {
              type: 'chunk',
              delta,
              index: index++,
              finish_reason: choice.finish_reason ?? null,
            };
          }

          for (const tc of choice.delta?.tool_calls ?? []) {
            const slot = toolAcc.get(tc.index) ?? { id: '', name: '', args: '' };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments) slot.args += tc.function.arguments;
            toolAcc.set(tc.index, slot);
          }
        }
      }

      // Emit any fully-assembled tool calls, domain-stamped from the registry.
      for (const slot of toolAcc.values()) {
        if (!slot.name) continue;
        const name = slot.name as ToolName;
        let domain: ToolDomain;
        try {
          domain = defaultToolRegistry.domainOf(name);
        } catch {
          // Unknown tool from the model — default to cloud and let the device
          // ToolDomainRouter reject it; never silently execute.
          domain = 'cloud';
        }
        yield {
          type: 'tool_call',
          id: slot.id || `tc_${Math.random().toString(36).slice(2)}`,
          name,
          arguments: parseArgs(slot.args),
          domain,
        };
      }

      return { type: 'done', stop_reason: stopReason, model, usage };
    },
  };
}

interface OpenAiChunk {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

function buildEndpoint(
  config: BackendConfig,
  model: string,
): { url: string; headers: Record<string, string> } {
  if (config.provider === 'azure-foundry') {
    // {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=...
    const base = config.upstreamBaseUrl.replace(/\/$/, '');
    return {
      url: `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${config.azureApiVersion}`,
      headers: { 'api-key': config.upstreamApiKey },
    };
  }
  // OpenRouter / generic OpenAI-compatible
  const base = config.upstreamBaseUrl.replace(/\/$/, '') || 'https://openrouter.ai/api/v1';
  return {
    url: `${base}/chat/completions`,
    headers: { Authorization: `Bearer ${config.upstreamApiKey}` },
  };
}

function normalizeUsage(u: NonNullable<OpenAiChunk['usage']>): DoneEvent['usage'] {
  const prompt = u.prompt_tokens ?? 0;
  const completion = u.completion_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: u.total_tokens ?? prompt + completion,
  };
}

function parseArgs(s: string): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '<no body>';
  }
}

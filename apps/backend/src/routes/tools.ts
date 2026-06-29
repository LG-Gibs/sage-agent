import { Router } from 'express';
import { z } from 'zod';
import type { BackendConfig } from '../config';

/**
 * Cloud tool runtime — POST /api/sage/tools/:name.
 *
 * These run server-side and assume connectivity (the device's ToolDomainRouter
 * has already returned the OFFLINE envelope if the radio was down, so a request
 * reaching here means the device believes it is online). When the relevant
 * upstream key is unset, handlers return a clearly-labelled stub so the path is
 * exercisable without secrets; with keys, they call the real provider.
 */
export function toolsRouter(config: BackendConfig): Router {
  const router = Router();

  router.post('/search', async (req, res) => {
    const schema = z.object({ query: z.string(), maxResults: z.number().optional() });
    const p = schema.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error.message);

    if (!config.tavilyApiKey) {
      return res.json(stub('web_search', { query: p.data.query }));
    }
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.tavilyApiKey,
          query: p.data.query,
          max_results: p.data.maxResults ?? 5,
        }),
      });
      return res.status(r.ok ? 200 : 502).json(await r.json());
    } catch (e) {
      return upstreamError(res, e);
    }
  });

  router.post('/fetch', async (req, res) => {
    const schema = z.object({ url: z.string().url() });
    const p = schema.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error.message);

    try {
      // Jina Reader: prefix the target URL; key is optional (raises rate limits).
      const headers: Record<string, string> = {};
      if (config.jinaApiKey) headers.Authorization = `Bearer ${config.jinaApiKey}`;
      const r = await fetch(`https://r.jina.ai/${p.data.url}`, { headers });
      const text = await r.text();
      return res.json({ url: p.data.url, markdown: text.slice(0, 100_000) });
    } catch (e) {
      return upstreamError(res, e);
    }
  });

  router.post('/execute', async (req, res) => {
    const schema = z.object({ code: z.string(), timeoutMs: z.number().optional() });
    const p = schema.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error.message);

    if (!config.e2bApiKey) {
      return res.json(
        stub('execute_python', {
          note: 'E2B not configured; wire E2B_API_KEY to enable Firecracker microVM execution.',
        }),
      );
    }
    // Real E2B execution is wired in Phase 4 (Code Sandbox) via the E2B SDK.
    return res.status(501).json({
      error: {
        code: 'SANDBOX_ERROR',
        message: 'E2B execution lands in Phase 4 (Code Sandbox).',
        retryable: false,
      },
    });
  });

  router.post('/research', async (req, res) => {
    const schema = z.object({
      topic: z.string(),
      depth: z.enum(['shallow', 'standard', 'deep']).optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error.message);
    return res.json(
      stub('deep_research', {
        topic: p.data.topic,
        depth: p.data.depth ?? 'standard',
        note: 'Deep research orchestration is fleshed out in Phase 5 (Search & Synthesis).',
      }),
    );
  });

  return router;
}

function stub(tool: string, extra: Record<string, unknown>) {
  return { tool, stub: true, ...extra };
}
function badRequest(res: import('express').Response, message: string) {
  return res
    .status(400)
    .json({ error: { code: 'INVALID_REQUEST', message, retryable: false } });
}
function upstreamError(res: import('express').Response, e: unknown) {
  return res.status(502).json({
    error: {
      code: 'UPSTREAM_ERROR',
      message: e instanceof Error ? e.message : 'tool upstream failure',
      retryable: true,
    },
  });
}

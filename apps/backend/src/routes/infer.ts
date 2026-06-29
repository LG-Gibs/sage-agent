import { Router } from 'express';
import { z } from 'zod';
import type { Message, MemoryFragment } from '@sage/shared-types';
import type { BackendConfig } from '../config';
import { isModelAllowed } from '../allowlist';
import { SseEmitter } from '../sse/emitter';
import { selectUpstream } from '../upstream';

const memorySchema = z.object({
  id: z.string(),
  text: z.string(),
  score: z.number().optional(),
});

const inferSchema = z.object({
  model: z.string().min(1),
  // The server only serves the cloud target; 'local' never reaches it.
  target: z.literal('cloud').optional(),
  messages: z.array(z.record(z.unknown())).min(1),
  memories: z.array(memorySchema).optional(),
  tools: z.array(z.unknown()).optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
});

/**
 * Inject opaque memory fragments verbatim as a single system block.
 * Constitutional Constraint 5: the backend treats memories as opaque prompt
 * text — it does not store, search, rank or embed them, and never logs content.
 */
function injectMemories(
  messages: Message[],
  memories: MemoryFragment[],
): Message[] {
  if (memories.length === 0) return messages;
  const block =
    'Relevant on-device memories (use if helpful):\n' +
    memories.map((m) => `- ${m.text}`).join('\n');
  return [{ role: 'system', content: block }, ...messages];
}

export function inferRouter(config: BackendConfig): Router {
  const upstream = selectUpstream(config);
  const router = Router();

  // POST /api/sage/infer — stateless, one inference cycle per request.
  router.post('/infer', async (req, res) => {
    const parsed = inferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          retryable: false,
        },
      });
    }
    const body = parsed.data;

    // Constraint 2: allowlist check ONLY — no routing override.
    if (!isModelAllowed(body.model, config.allowedModels)) {
      return res.status(403).json({
        error: {
          code: 'MODEL_NOT_ALLOWED',
          message: `Model not on allowlist: ${body.model}`,
          retryable: false,
        },
      });
    }

    const messages = injectMemories(
      body.messages as unknown as Message[],
      (body.memories ?? []) as MemoryFragment[],
    );

    // Privacy audit: log COUNTS only, never memory text or message content.
    // eslint-disable-next-line no-console
    console.log(
      `[infer] model=${body.model} messages=${messages.length} memories=${body.memories?.length ?? 0}`,
    );

    const emitter = new SseEmitter(res, config.heartbeatMs);
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    emitter.open();

    try {
      const gen = upstream.stream(
        {
          model: body.model,
          messages,
          memories: (body.memories ?? []) as MemoryFragment[],
          tools: body.tools,
          temperature: body.temperature,
          maxTokens: body.max_tokens,
        },
        abort.signal,
      );
      let step = await gen.next();
      while (!step.done) {
        emitter.send(step.value);
        step = await gen.next();
      }
      // Generator return value is the terminal `done` event.
      emitter.send(step.value);
    } catch (err) {
      emitter.send({
        type: 'error',
        code: 'UPSTREAM_ERROR',
        message: err instanceof Error ? err.message : 'upstream failure',
        retryable: true,
      });
    } finally {
      emitter.close();
    }
  });

  return router;
}

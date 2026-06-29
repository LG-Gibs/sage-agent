import type { MemoryFragment } from '@sage/shared-types';
import type { RetrievalHit } from './types';

export interface InjectionOptions {
  /** Drop hits below this cosine score (default 0 — keep all). */
  minScore?: number;
  /** Cap the number of fragments injected. */
  maxFragments?: number;
}

/**
 * Convert retrieval hits into opaque MemoryFragment[] for the
 * POST /api/sage/infer `memories[]` payload. Constitutional Constraint 5: these
 * are opaque prompt text the device sends up; the backend never stores, ranks,
 * or embeds them.
 */
export function toMemoryFragments(
  hits: RetrievalHit[],
  opts: InjectionOptions = {},
): MemoryFragment[] {
  const minScore = opts.minScore ?? 0;
  let filtered = hits.filter((h) => h.score >= minScore);
  if (opts.maxFragments !== undefined) filtered = filtered.slice(0, opts.maxFragments);
  return filtered.map((h) => ({ id: h.record.id, text: h.record.text, score: h.score }));
}

import { l2normalize } from './cosine';
import type { Embedder, MemoryRecord, MemoryStore, RetrievalHit } from './types';

export interface MemoryManagerOptions {
  /** Max records retained; lowest-relevance are pruned beyond this. */
  capacity?: number;
  /** Default TTL applied to new memories when not specified per-record. */
  defaultTtlMs?: number;
  /** Recency half-life (ms) for the relevance score. Default 30 days. */
  recencyHalfLifeMs?: number;
  now?: () => number;
}

export interface RememberInput {
  id?: string;
  text: string;
  category?: string;
  ttlMs?: number;
}

let counter = 0;
function genId(): string {
  return `mem_${Date.now().toString(36)}_${(counter++).toString(36)}`;
}

/**
 * Memory lifecycle: creation (embed + store), recall (embed query + top-k,
 * bumping access stats and skipping expired), relevance scoring (recency +
 * frequency, similarity-independent), and pruning (TTL expiry + capacity
 * eviction of the lowest-relevance records).
 */
export class MemoryManager {
  private readonly capacity: number;
  private readonly defaultTtlMs?: number;
  private readonly halfLife: number;
  private readonly now: () => number;

  constructor(
    private readonly store: MemoryStore,
    private readonly embedder: Embedder,
    opts: MemoryManagerOptions = {},
  ) {
    this.capacity = opts.capacity ?? 10_000;
    this.defaultTtlMs = opts.defaultTtlMs;
    this.halfLife = opts.recencyHalfLifeMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  async remember(input: RememberInput): Promise<MemoryRecord> {
    const t = this.now();
    const record: MemoryRecord = {
      id: input.id ?? genId(),
      text: input.text,
      embedding: l2normalize(this.embedder.embed(input.text)),
      createdAt: t,
      lastAccessedAt: t,
      accessCount: 0,
      category: input.category,
      ttlMs: input.ttlMs ?? this.defaultTtlMs,
    };
    await this.store.upsert(record);
    await this.prune();
    return record;
  }

  async recall(query: string, topK = 5): Promise<RetrievalHit[]> {
    const now = this.now();
    const queryEmbedding = l2normalize(this.embedder.embed(query));
    // Over-fetch so expired records can be filtered without starving results.
    const raw = await this.store.search(queryEmbedding, topK * 2);
    const hits: RetrievalHit[] = [];
    for (const hit of raw) {
      if (this.isExpired(hit.record, now)) {
        await this.store.delete(hit.record.id);
        continue;
      }
      hit.record.lastAccessedAt = now;
      hit.record.accessCount += 1;
      await this.store.upsert(hit.record);
      hits.push(hit);
      if (hits.length >= topK) break;
    }
    return hits;
  }

  isExpired(record: MemoryRecord, now: number): boolean {
    return record.ttlMs !== undefined && now > record.createdAt + record.ttlMs;
  }

  /** Recency (exponential decay) + frequency. Higher = more worth keeping. */
  relevanceScore(record: MemoryRecord, now: number): number {
    const ageMs = Math.max(0, now - record.lastAccessedAt);
    const recency = Math.pow(0.5, ageMs / this.halfLife); // 1 → 0 as it ages
    const frequency = Math.log2(record.accessCount + 1);
    return recency + 0.25 * frequency;
  }

  /** Remove expired records, then evict lowest-relevance beyond capacity. */
  async prune(): Promise<number> {
    const now = this.now();
    const all = await this.store.all();
    let removed = 0;

    for (const r of all) {
      if (this.isExpired(r, now)) {
        await this.store.delete(r.id);
        removed += 1;
      }
    }

    const live = all.filter((r) => !this.isExpired(r, now));
    if (live.length > this.capacity) {
      live.sort((a, b) => this.relevanceScore(a, now) - this.relevanceScore(b, now));
      const evictCount = live.length - this.capacity;
      for (let i = 0; i < evictCount; i++) {
        await this.store.delete(live[i]!.id);
        removed += 1;
      }
    }
    return removed;
  }
}

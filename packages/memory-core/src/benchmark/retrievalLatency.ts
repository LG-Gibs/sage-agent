import { FlatVectorIndex } from '../flatIndex';

export interface LatencyReport {
  vectors: number;
  dim: number;
  topK: number;
  queries: number;
  p50Ms: number;
  p95Ms: number;
  /** Querying a known stored vector returns it as top-1 (search correctness). */
  correctTop1: boolean;
  buildMs: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomUnit(rng: () => number, dim: number, out: number[]): void {
  let norm = 0;
  for (let d = 0; d < dim; d++) {
    const x = rng() * 2 - 1;
    out[d] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < dim; d++) out[d]! /= norm;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

/**
 * Retrieval-latency harness. Builds an index of N normalized vectors and times
 * top-k search. The Phase 5 gate is "<100ms top-5 at 100k vectors on device"
 * (sqlite-vec HNSW); this brute-force Float32 reference measures the same
 * workload in CI and verifies search correctness.
 */
export function runRetrievalLatency(
  opts: { vectors?: number; dim?: number; topK?: number; queries?: number; seed?: number } = {},
): LatencyReport {
  const vectors = opts.vectors ?? 100_000;
  const dim = opts.dim ?? 256;
  const topK = opts.topK ?? 5;
  const queries = opts.queries ?? 20;
  const rng = mulberry32(opts.seed ?? 42);

  const index = new FlatVectorIndex(dim, vectors);
  const scratch = new Array<number>(dim);
  const knownIndex = Math.floor(vectors / 2);
  let knownVector: number[] = [];

  const buildStart = performance.now();
  for (let i = 0; i < vectors; i++) {
    randomUnit(rng, dim, scratch);
    if (i === knownIndex) knownVector = scratch.slice();
    index.add(`v${i}`, scratch);
  }
  const buildMs = performance.now() - buildStart;

  const times: number[] = [];
  const query = new Array<number>(dim);
  for (let q = 0; q < queries; q++) {
    randomUnit(rng, dim, query);
    const t0 = performance.now();
    index.search(query, topK);
    times.push(performance.now() - t0);
  }

  // Correctness: a known stored vector must come back as its own nearest neighbor.
  const knownResult = index.search(knownVector, topK);
  const correctTop1 = knownResult[0]?.id === `v${knownIndex}`;

  times.sort((a, b) => a - b);
  return {
    vectors,
    dim,
    topK,
    queries,
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    correctTop1,
    buildMs,
  };
}

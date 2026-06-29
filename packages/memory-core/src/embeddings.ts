import type { Embedder } from './types';

/** FNV-1a hash of a token into [0, mod). */
function fnv1a(token: string, mod: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % mod;
}

/**
 * Deterministic offline embedder via signed feature hashing (bag-of-words).
 * No model download, no network — works fully offline and gives meaningful
 * cosine similarity for lexical overlap. It is the Phase 5 on-device embedder;
 * a neural embedding GGUF can be swapped in behind the same Embedder interface
 * without touching the store, lifecycle, or retrieval code.
 */
export function createHashingEmbedder(dim = 256): Embedder {
  return {
    dim,
    embed(text: string): number[] {
      const v = new Array<number>(dim).fill(0);
      const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      for (const t of tokens) {
        const idx = fnv1a(t, dim);
        const sign = fnv1a(`${t}#sign`, 2) === 0 ? 1 : -1; // reduce collision bias
        v[idx]! += sign;
      }
      let norm = 0;
      for (const x of v) norm += x * x;
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) v[i]! /= norm;
      return v;
    },
  };
}

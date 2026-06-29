export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export function l2normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** Cosine similarity for arbitrary (possibly unnormalized) vectors. */
export function cosineSim(a: number[], b: number[]): number {
  let na = 0;
  let nb = 0;
  for (const x of a) na += x * x;
  for (const x of b) nb += x * x;
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot(a, b) / denom;
}

export interface Scored<T> {
  item: T;
  score: number;
}

/**
 * Bounded top-k selection. Keeps a small ascending-sorted buffer of size k, so
 * the whole scan is O(n·k) with no full sort of n — fine for brute-force search
 * over large stores.
 */
export function topK<T>(items: Iterable<T>, score: (t: T) => number, k: number): Scored<T>[] {
  if (k <= 0) return [];
  const buf: Scored<T>[] = []; // ascending by score; buf[0] is the weakest kept
  for (const item of items) {
    const s = score(item);
    if (buf.length < k) {
      insertAscending(buf, { item, score: s });
    } else if (s > buf[0]!.score) {
      buf.shift();
      insertAscending(buf, { item, score: s });
    }
  }
  return buf.reverse(); // descending by score
}

function insertAscending<T>(buf: Scored<T>[], entry: Scored<T>): void {
  let lo = 0;
  let hi = buf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (buf[mid]!.score < entry.score) lo = mid + 1;
    else hi = mid;
  }
  buf.splice(lo, 0, entry);
}

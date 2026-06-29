/**
 * Flat brute-force vector index backed by a single Float32Array. Used by the
 * retrieval-latency harness at 100k vectors: contiguous memory + dot products
 * over normalized rows keep it fast and GC-friendly. On device, sqlite-vec
 * (HNSW) is the production index — this is the verifiable reference.
 */
export class FlatVectorIndex {
  private data: Float32Array;
  private ids: string[] = [];
  private count = 0;

  constructor(
    private readonly dim: number,
    capacity = 1024,
  ) {
    this.data = new Float32Array(capacity * dim);
  }

  get size(): number {
    return this.count;
  }

  add(id: string, vector: number[]): void {
    if ((this.count + 1) * this.dim > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data.set(vector, this.count * this.dim);
    this.ids[this.count] = id;
    this.count += 1;
  }

  /** Top-k by dot product (== cosine for normalized vectors). */
  search(query: number[], k: number): Array<{ id: string; score: number }> {
    const { data, dim, count } = this;
    const ids = new Array<string>(k).fill('');
    const scores = new Array<number>(k).fill(-Infinity);
    let min = -Infinity;

    for (let i = 0; i < count; i++) {
      const base = i * dim;
      let s = 0;
      for (let d = 0; d < dim; d++) s += data[base + d]! * query[d]!;
      if (s <= min && scores[k - 1] !== -Infinity) continue;
      // Insertion into the ascending-by-score top-k buffer (buffer end = best).
      let j = 0;
      while (j < k && scores[j]! < s) j++;
      if (j > 0) {
        for (let t = 0; t < j - 1; t++) {
          scores[t] = scores[t + 1]!;
          ids[t] = ids[t + 1]!;
        }
        scores[j - 1] = s;
        ids[j - 1] = this.ids[i]!;
        min = scores[0]!;
      }
    }

    const out: Array<{ id: string; score: number }> = [];
    for (let i = k - 1; i >= 0; i--) {
      if (scores[i] === -Infinity) continue;
      out.push({ id: ids[i]!, score: scores[i]! });
    }
    return out;
  }
}

import { dot, topK } from './cosine';
import type { MemoryRecord, MemoryStore, RetrievalHit } from './types';

/**
 * Brute-force in-memory vector store — the testable reference implementation of
 * MemoryStore. Embeddings are L2-normalized, so cosine similarity is a dot
 * product. On device this is replaced by sqlite-vec (same interface).
 */
export class InMemoryVectorStore implements MemoryStore {
  private readonly records = new Map<string, MemoryRecord>();

  async upsert(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async search(queryEmbedding: number[], k: number): Promise<RetrievalHit[]> {
    return topK(
      this.records.values(),
      (r) => dot(r.embedding, queryEmbedding),
      k,
    ).map(({ item, score }) => ({ record: item, score }));
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async all(): Promise<MemoryRecord[]> {
    return [...this.records.values()];
  }

  async size(): Promise<number> {
    return this.records.size;
  }
}

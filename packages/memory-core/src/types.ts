export interface MemoryRecord {
  id: string;
  text: string;
  /** L2-normalized embedding, so cosine similarity reduces to a dot product. */
  embedding: number[];
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  category?: string;
  /** Optional time-to-live in ms; record expires at createdAt + ttlMs. */
  ttlMs?: number;
}

export interface RetrievalHit {
  record: MemoryRecord;
  /** Cosine similarity in [-1, 1]. */
  score: number;
}

/**
 * Local-only vector store. Constitutional Constraint 5: this lives entirely
 * on-device (sqlite-vec on the phone; the in-memory store here is the testable
 * reference). It is never synced; the backend never sees it.
 */
export interface MemoryStore {
  upsert(record: MemoryRecord): Promise<void>;
  search(queryEmbedding: number[], topK: number): Promise<RetrievalHit[]>;
  delete(id: string): Promise<void>;
  all(): Promise<MemoryRecord[]>;
  size(): Promise<number>;
}

/** Deterministic, offline text → vector embedder. */
export interface Embedder {
  readonly dim: number;
  embed(text: string): number[];
}

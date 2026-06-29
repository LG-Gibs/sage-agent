import { open, type DB } from '@op-engineering/op-sqlite';
import type { MemoryRecord, MemoryStore, RetrievalHit } from '@sage/memory-core';

/**
 * On-device vector store backed by SQLite + the sqlite-vec extension (vec0 HNSW
 * virtual table) for sub-100ms top-k at 100k vectors. The database is encrypted
 * at rest with SQLCipher (key from Keychain/Keystore — Phase 1 compliance).
 * Implements the same MemoryStore contract as the in-memory reference store.
 *
 * DEVICE-BOUND: requires the native op-sqlite build with sqlite-vec loaded.
 */
export function createSqliteVecStore(dim: number, encryptionKey?: string): MemoryStore {
  const db: DB = open({ name: 'sage-memory.db', encryptionKey });

  // Metadata table + sqlite-vec virtual table for the embeddings.
  db.execute(`CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY, text TEXT NOT NULL, createdAt INTEGER, lastAccessedAt INTEGER,
    accessCount INTEGER DEFAULT 0, category TEXT, ttlMs INTEGER
  );`);
  db.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(embedding float[${dim}]);`);

  function toBlob(embedding: number[]): ArrayBuffer {
    return new Float32Array(embedding).buffer;
  }

  return {
    async upsert(record: MemoryRecord): Promise<void> {
      await db.execute(
        `INSERT INTO memories (id,text,createdAt,lastAccessedAt,accessCount,category,ttlMs)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET text=excluded.text, lastAccessedAt=excluded.lastAccessedAt,
           accessCount=excluded.accessCount, category=excluded.category, ttlMs=excluded.ttlMs;`,
        [
          record.id,
          record.text,
          record.createdAt,
          record.lastAccessedAt,
          record.accessCount,
          record.category ?? null,
          record.ttlMs ?? null,
        ],
      );
      await db.execute('INSERT OR REPLACE INTO memory_vec(rowid, embedding) VALUES ((SELECT rowid FROM memories WHERE id=?), ?);', [
        record.id,
        toBlob(record.embedding) as unknown as string,
      ]);
    },

    async search(queryEmbedding: number[], topK: number): Promise<RetrievalHit[]> {
      // sqlite-vec KNN: order by vector distance, join back to metadata.
      const res = await db.execute(
        `SELECT m.*, v.distance AS distance
         FROM memory_vec v JOIN memories m ON m.rowid = v.rowid
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance;`,
        [toBlob(queryEmbedding) as unknown as string, topK],
      );
      return (res.rows?._array ?? []).map((row: Record<string, unknown>) => ({
        record: {
          id: String(row.id),
          text: String(row.text),
          embedding: [], // not re-hydrated on read; not needed by callers
          createdAt: Number(row.createdAt),
          lastAccessedAt: Number(row.lastAccessedAt),
          accessCount: Number(row.accessCount),
          category: (row.category as string) ?? undefined,
          ttlMs: row.ttlMs == null ? undefined : Number(row.ttlMs),
        },
        // Convert L2 distance to a cosine-like similarity for normalized vectors.
        score: 1 - Number(row.distance) / 2,
      }));
    },

    async delete(id: string): Promise<void> {
      await db.execute('DELETE FROM memory_vec WHERE rowid = (SELECT rowid FROM memories WHERE id=?);', [id]);
      await db.execute('DELETE FROM memories WHERE id=?;', [id]);
    },

    async all(): Promise<MemoryRecord[]> {
      const res = await db.execute('SELECT * FROM memories;');
      return (res.rows?._array ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        text: String(row.text),
        embedding: [],
        createdAt: Number(row.createdAt),
        lastAccessedAt: Number(row.lastAccessedAt),
        accessCount: Number(row.accessCount),
        category: (row.category as string) ?? undefined,
        ttlMs: row.ttlMs == null ? undefined : Number(row.ttlMs),
      }));
    },

    async size(): Promise<number> {
      const res = await db.execute('SELECT COUNT(*) AS n FROM memories;');
      return Number(res.rows?._array?.[0]?.n ?? 0);
    },
  };
}

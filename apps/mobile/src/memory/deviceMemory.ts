import { MemoryManager, createHashingEmbedder } from '@sage/memory-core';
import { createSqliteVecStore } from './sqliteVecStore';

const DIM = 256;

let manager: MemoryManager | null = null;

/**
 * Singleton on-device memory manager: an offline hashing embedder over a
 * sqlite-vec store. Local-only and never synced (Constraint 5). A neural
 * embedding GGUF can replace the embedder behind the same interface later.
 */
export function deviceMemory(): MemoryManager {
  if (!manager) {
    manager = new MemoryManager(createSqliteVecStore(DIM), createHashingEmbedder(DIM), {
      capacity: 50_000,
    });
  }
  return manager;
}

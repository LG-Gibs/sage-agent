/**
 * @sage/memory-core — on-device RAG memory pipeline.
 * Offline embedder, vector stores (in-memory reference + flat index), lifecycle
 * manager, opaque injection, retrieval-latency harness, and session simulation.
 */
export * from './types';
export * from './embeddings';
export * from './cosine';
export * from './flatIndex';
export * from './inMemoryStore';
export * from './lifecycle';
export * from './injection';
export * from './benchmark/retrievalLatency';
export * from './simulation/sessionSim';

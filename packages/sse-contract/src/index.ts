/**
 * @sage/sse-contract — the SAGE Backend v3 streaming contract.
 * Event type definitions + an incremental parser + a symmetric serializer,
 * so the server and the device's ReActLoop are provably byte-compatible.
 */
export * from './events';
export * from './parser';

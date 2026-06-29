/**
 * @sage/arbiter-core — the on-device intelligence kernel.
 *
 * Phases 0–1 ship the signal-reading infrastructure and the Capability
 * Manifest builder (both fully implemented and tested here). The ArbiterRouter
 * routing engine and the ReActLoop/ToolDomainRouter land in Phase 3; their
 * interfaces are exported now so the architecture can be wired against them.
 */
export * from './signals/types';
export * from './signals/reader';
export * from './signals/mockProviders';
export * from './classifier/complexity';
export * from './capability/types';
export * from './capability/manifest';
export * from './capability/mockProbe';
export * from './capability/gating';
export * from './router';

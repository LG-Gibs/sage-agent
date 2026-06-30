/**
 * The SageRouter's output. Constitutional Constraint 2: routing happens
 * entirely on-device. The server accepts `model` as an allowlist check only —
 * it never overrides this decision.
 */
export type RoutingTarget = 'local' | 'cloud';

export interface RoutingDecision {
  /** Model id, e.g. 'gemma-4-2b', 'gemma-4-9b', or a cloud model identifier. */
  model: string;
  target: RoutingTarget;
  /** Auditable, human-readable explanation of the route chosen. */
  rationale: string;
}

/** Model tiers. The two local tiers map to GGUF weights run via llama.cpp. */
export type ModelTier = 'local-efficient' | 'local-default' | 'cloud-efficient' | 'cloud-capable';

export interface ModelDescriptor {
  id: string;
  tier: ModelTier;
  target: RoutingTarget;
  /** For local models: minimum device RAM in bytes required to load. */
  minRamBytes?: number;
}

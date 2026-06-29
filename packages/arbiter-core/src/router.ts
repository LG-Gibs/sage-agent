import type {
  ArbiterSignals,
  CapabilityManifest,
  RoutingDecision,
} from '@sage/shared-types';

export interface ArbiterRouterInputs {
  signals: ArbiterSignals;
  capability: CapabilityManifest;
}

export interface IArbiterRouter {
  route(input: ArbiterRouterInputs): RoutingDecision;
}

/**
 * PHASE 3 COMPONENT — interface only at Phases 0–1.
 *
 * The complete 5-signal routing engine (hard overrides, soft guidance, default
 * cloud path, and the graceful-degradation hierarchy) is implemented and
 * benchmarked in Phase 3 against the 50-case expert suite (>=85% agreement).
 * This stub exists so the public surface and the architecture docs can
 * reference the contract now. Calling route() before Phase 3 is a programmer
 * error and throws loudly rather than guessing a route.
 */
export function createArbiterRouter(): IArbiterRouter {
  return {
    route(): RoutingDecision {
      throw new Error(
        'ArbiterRouter routing logic is implemented in Phase 3 (Arbiter Core). ' +
          'Phases 0–1 deliver the signal readers and capability manifest only.',
      );
    },
  };
}

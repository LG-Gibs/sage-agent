import {
  LOCAL_MODELS,
  type SageSignals,
  type CapabilityManifest,
  type RoutingDecision,
} from '@sage/shared-types';

export interface SageRouterInputs {
  signals: SageSignals;
  capability: CapabilityManifest;
}

export interface ISageRouter {
  route(input: SageRouterInputs): RoutingDecision;
}

/** Cloud model tiers the router can select (must be on the backend allowlist). */
export interface CloudModelCatalog {
  efficient: string;
  capable: string;
}

export const DEFAULT_CLOUD_CATALOG: CloudModelCatalog = {
  efficient: 'google/gemini-2.5-flash',
  capable: 'anthropic/claude-sonnet-4',
};

export interface SageRouterOptions {
  cloud?: CloudModelCatalog;
}

/**
 * SageRouter (Constitutional Constraint 2): the only component authorised to
 * select a model/target, evaluated entirely on-device with no network access.
 *
 * Precedence: hard overrides (always local) → explicit cloud preference →
 * soft guidance (lean local) → default cloud (tier matched to complexity).
 * Local routes never silently escalate to cloud (privacy/offline reasons), so
 * the decision is safe by construction.
 */
export function createSageRouter(opts: SageRouterOptions = {}): ISageRouter {
  const cloud = opts.cloud ?? DEFAULT_CLOUD_CATALOG;
  return { route: (input) => route(input, cloud) };
}

function has9B(capability: CapabilityManifest): boolean {
  return (
    capability.supports9B &&
    capability.installedModels.some((m) => m.id === LOCAL_MODELS.capable && m.verified)
  );
}

function chooseLocalModel(
  complexity: SageSignals['complexity'],
  capability: CapabilityManifest,
  forceEfficient: boolean,
): string {
  if (forceEfficient) return LOCAL_MODELS.default; // 2B = the efficient tier
  if (complexity === 'complex' && has9B(capability)) return LOCAL_MODELS.capable;
  return LOCAL_MODELS.default;
}

function route(
  { signals, capability }: SageRouterInputs,
  cloud: CloudModelCatalog,
): RoutingDecision {
  const { network, power, complexity, privacy, preference } = signals;

  // ── Hard overrides → always local, no exceptions ──
  const hard =
    network === 'offline'
      ? 'device is offline'
      : power === 'critical'
        ? 'battery critical'
        : privacy === 'sensitive'
          ? 'sensitive privacy context'
          : preference === 'prefer_local'
            ? 'user prefers local'
            : null;

  if (hard) {
    const model = chooseLocalModel(complexity, capability, power === 'critical');
    return {
      model,
      target: 'local',
      rationale: `Hard override (${hard}) → local ${model}`,
    };
  }

  // ── Explicit cloud preference skips the soft local heuristics ──
  if (preference === 'prefer_cloud') {
    const model = complexity === 'complex' ? cloud.capable : cloud.efficient;
    return {
      model,
      target: 'cloud',
      rationale: `User prefers cloud → ${model} (complexity ${complexity})`,
    };
  }

  // ── Soft guidance → lean local ──
  if (network === 'poor' && complexity === 'simple') {
    return {
      model: LOCAL_MODELS.default,
      target: 'local',
      rationale: 'Soft guidance: poor network + simple task → local',
    };
  }
  if (power === 'low' && complexity !== 'complex') {
    return {
      model: LOCAL_MODELS.default,
      target: 'local',
      rationale: 'Soft guidance: low battery + non-complex task → local efficient',
    };
  }

  // ── Default: cloud, tier matched to task complexity ──
  const model = complexity === 'complex' ? cloud.capable : cloud.efficient;
  return {
    model,
    target: 'cloud',
    rationale: `Default cloud route (complexity ${complexity})`,
  };
}

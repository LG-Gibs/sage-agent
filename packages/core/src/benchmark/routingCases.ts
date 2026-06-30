import type {
  SageSignals,
  NetworkQuality,
  PowerState,
  PrivacyContext,
  RoutingTarget,
  TaskComplexity,
  UserPreference,
} from '@sage/shared-types';
import type { ISageRouter } from '../router';
import { createMockCapabilityProbe } from '../capability/mockProbe';
import { buildCapabilityManifest } from '../capability/manifest';

export interface RoutingCase {
  signals: SageSignals;
  /** Expert-labelled expected target, derived from the spec's routing policy. */
  expect: RoutingTarget;
  note?: string;
}

function s(
  network: NetworkQuality,
  power: PowerState,
  complexity: TaskComplexity,
  privacy: PrivacyContext,
  preference: UserPreference,
): SageSignals {
  return { network, power, complexity, privacy, preference };
}

/**
 * 50-case expert routing benchmark. Labels encode the spec's policy:
 *   hard overrides (offline / critical / sensitive / prefer_local) → local;
 *   prefer_cloud → cloud (skips soft guidance);
 *   soft guidance (poor+simple, low+non-complex) → local;
 *   otherwise default → cloud.
 */
export const ROUTING_BENCHMARK: RoutingCase[] = [
  // ── Hard override: offline (5) ──
  { signals: s('offline', 'normal', 'simple', 'standard', 'auto'), expect: 'local' },
  { signals: s('offline', 'charging', 'complex', 'standard', 'prefer_cloud'), expect: 'local', note: 'offline beats prefer_cloud' },
  { signals: s('offline', 'low', 'moderate', 'private', 'auto'), expect: 'local' },
  { signals: s('offline', 'critical', 'complex', 'sensitive', 'prefer_local'), expect: 'local' },
  { signals: s('offline', 'normal', 'complex', 'standard', 'auto'), expect: 'local' },

  // ── Hard override: critical battery (4) ──
  { signals: s('good', 'critical', 'simple', 'standard', 'auto'), expect: 'local' },
  { signals: s('fair', 'critical', 'complex', 'standard', 'prefer_cloud'), expect: 'local', note: 'critical beats prefer_cloud' },
  { signals: s('poor', 'critical', 'moderate', 'standard', 'auto'), expect: 'local' },
  { signals: s('good', 'critical', 'complex', 'standard', 'auto'), expect: 'local' },

  // ── Hard override: sensitive privacy (4) ──
  { signals: s('good', 'normal', 'simple', 'sensitive', 'auto'), expect: 'local' },
  { signals: s('good', 'charging', 'complex', 'sensitive', 'prefer_cloud'), expect: 'local', note: 'sensitive beats prefer_cloud' },
  { signals: s('fair', 'low', 'moderate', 'sensitive', 'auto'), expect: 'local' },
  { signals: s('good', 'normal', 'complex', 'sensitive', 'auto'), expect: 'local' },

  // ── Hard override: prefer_local (4) ──
  { signals: s('good', 'normal', 'simple', 'standard', 'prefer_local'), expect: 'local' },
  { signals: s('fair', 'charging', 'complex', 'private', 'prefer_local'), expect: 'local' },
  { signals: s('good', 'normal', 'complex', 'standard', 'prefer_local'), expect: 'local' },
  { signals: s('poor', 'low', 'moderate', 'private', 'prefer_local'), expect: 'local' },

  // ── prefer_cloud skips soft guidance (5) ──
  { signals: s('good', 'normal', 'simple', 'standard', 'prefer_cloud'), expect: 'cloud' },
  { signals: s('poor', 'normal', 'simple', 'standard', 'prefer_cloud'), expect: 'cloud', note: 'prefer_cloud overrides poor+simple' },
  { signals: s('fair', 'low', 'moderate', 'private', 'prefer_cloud'), expect: 'cloud', note: 'prefer_cloud overrides low-battery soft' },
  { signals: s('good', 'charging', 'complex', 'private', 'prefer_cloud'), expect: 'cloud' },
  { signals: s('poor', 'low', 'simple', 'standard', 'prefer_cloud'), expect: 'cloud' },

  // ── Soft guidance: poor network + simple (4) ──
  { signals: s('poor', 'normal', 'simple', 'standard', 'auto'), expect: 'local' },
  { signals: s('poor', 'charging', 'simple', 'standard', 'auto'), expect: 'local' },
  { signals: s('poor', 'normal', 'simple', 'private', 'auto'), expect: 'local' },
  { signals: s('poor', 'low', 'simple', 'standard', 'auto'), expect: 'local' },

  // ── Soft guidance: low battery + non-complex (6) ──
  { signals: s('good', 'low', 'simple', 'standard', 'auto'), expect: 'local' },
  { signals: s('good', 'low', 'moderate', 'standard', 'auto'), expect: 'local' },
  { signals: s('fair', 'low', 'moderate', 'private', 'auto'), expect: 'local' },
  { signals: s('fair', 'low', 'simple', 'standard', 'auto'), expect: 'local' },
  { signals: s('good', 'low', 'complex', 'standard', 'auto'), expect: 'cloud', note: 'low+complex is NOT soft-local → default cloud' },
  { signals: s('poor', 'low', 'complex', 'standard', 'auto'), expect: 'cloud', note: 'complex; neither soft rule applies' },

  // ── Default cloud (18) ──
  { signals: s('good', 'normal', 'simple', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('good', 'normal', 'moderate', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('good', 'normal', 'complex', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('fair', 'normal', 'simple', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('fair', 'normal', 'moderate', 'private', 'auto'), expect: 'cloud' },
  { signals: s('fair', 'normal', 'complex', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('good', 'charging', 'simple', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('good', 'charging', 'moderate', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('good', 'charging', 'complex', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('fair', 'charging', 'complex', 'private', 'auto'), expect: 'cloud' },
  { signals: s('good', 'normal', 'moderate', 'private', 'auto'), expect: 'cloud' },
  { signals: s('fair', 'charging', 'moderate', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('poor', 'normal', 'moderate', 'standard', 'auto'), expect: 'cloud', note: 'poor+moderate: poor-soft rule is simple-only' },
  { signals: s('poor', 'charging', 'complex', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('poor', 'normal', 'complex', 'private', 'auto'), expect: 'cloud' },
  { signals: s('fair', 'low', 'complex', 'standard', 'auto'), expect: 'cloud' },
  { signals: s('good', 'charging', 'simple', 'private', 'auto'), expect: 'cloud' },
  { signals: s('fair', 'normal', 'simple', 'private', 'auto'), expect: 'cloud' },
];

export interface BenchmarkResult {
  total: number;
  agreements: number;
  rate: number;
  disagreements: Array<{ signals: SageSignals; expected: RoutingTarget; got: RoutingTarget }>;
}

/** Runs the router across the benchmark and reports agreement on target. */
export async function runRoutingBenchmark(router: ISageRouter): Promise<BenchmarkResult> {
  // A capable device (8GB, verified 2B + 9B) so model tiering is exercised.
  const capability = await buildCapabilityManifest(
    createMockCapabilityProbe({
      installedModels: [
        { id: 'gemma-4-2b', path: '/2b.gguf', sizeBytes: 1, verified: true },
        { id: 'gemma-4-9b', path: '/9b.gguf', sizeBytes: 1, verified: true },
      ],
    }),
    { signalsReady: true },
  );

  const disagreements: BenchmarkResult['disagreements'] = [];
  let agreements = 0;
  for (const c of ROUTING_BENCHMARK) {
    const got = router.route({ signals: c.signals, capability }).target;
    if (got === c.expect) agreements += 1;
    else disagreements.push({ signals: c.signals, expected: c.expect, got });
  }
  return {
    total: ROUTING_BENCHMARK.length,
    agreements,
    rate: agreements / ROUTING_BENCHMARK.length,
    disagreements,
  };
}

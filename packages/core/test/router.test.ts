import { describe, it, expect, beforeAll } from 'vitest';
import type { SageSignals, CapabilityManifest } from '@sage/shared-types';
import {
  createSageRouter,
  buildCapabilityManifest,
  createMockCapabilityProbe,
} from '../src/index';

const router = createSageRouter();
let capability: CapabilityManifest;

beforeAll(async () => {
  // Capable device: 8GB + verified 2B & 9B, so model tiering is exercised.
  capability = await buildCapabilityManifest(
    createMockCapabilityProbe({
      installedModels: [
        { id: 'gemma-4-2b', path: '/2b.gguf', sizeBytes: 1, verified: true },
        { id: 'gemma-4-9b', path: '/9b.gguf', sizeBytes: 1, verified: true },
      ],
    }),
    { signalsReady: true },
  );
});

const sig = (
  network: SageSignals['network'],
  power: SageSignals['power'],
  complexity: SageSignals['complexity'],
  privacy: SageSignals['privacy'],
  preference: SageSignals['preference'],
): SageSignals => ({ network, power, complexity, privacy, preference });

const route = (s: SageSignals) => router.route({ signals: s, capability });

describe('SageRouter — 10 distinct signal-combination scenarios', () => {
  it('1. offline → local', () => {
    expect(route(sig('offline', 'normal', 'simple', 'standard', 'auto')).target).toBe('local');
  });

  it('2. critical battery → local efficient (2B even for complex)', () => {
    const d = route(sig('good', 'critical', 'complex', 'standard', 'auto'));
    expect(d.target).toBe('local');
    expect(d.model).toBe('gemma-4-2b');
  });

  it('3. sensitive privacy + complex → local capable (9B)', () => {
    const d = route(sig('good', 'normal', 'complex', 'sensitive', 'auto'));
    expect(d.target).toBe('local');
    expect(d.model).toBe('gemma-4-9b');
  });

  it('4. prefer_local → local', () => {
    expect(route(sig('good', 'normal', 'simple', 'standard', 'prefer_local')).target).toBe('local');
  });

  it('5. poor network + simple → local (soft)', () => {
    expect(route(sig('poor', 'normal', 'simple', 'standard', 'auto')).target).toBe('local');
  });

  it('6. low battery + moderate → local (soft)', () => {
    expect(route(sig('good', 'low', 'moderate', 'standard', 'auto')).target).toBe('local');
  });

  it('7. good + simple → cloud efficient', () => {
    const d = route(sig('good', 'normal', 'simple', 'standard', 'auto'));
    expect(d.target).toBe('cloud');
    expect(d.model).toBe('google/gemini-2.5-flash');
  });

  it('8. good + complex → cloud capable', () => {
    const d = route(sig('good', 'normal', 'complex', 'standard', 'auto'));
    expect(d.target).toBe('cloud');
    expect(d.model).toBe('anthropic/claude-sonnet-4');
  });

  it('9. prefer_cloud + simple → cloud (overrides soft guidance)', () => {
    expect(route(sig('poor', 'normal', 'simple', 'standard', 'prefer_cloud')).target).toBe('cloud');
  });

  it('10. stacked hard overrides → local (offline wins, 2B from critical)', () => {
    const d = route(sig('offline', 'critical', 'complex', 'sensitive', 'prefer_local'));
    expect(d.target).toBe('local');
    expect(d.model).toBe('gemma-4-2b');
  });

  it('low battery + COMPLEX is not soft-local → cloud', () => {
    expect(route(sig('good', 'low', 'complex', 'standard', 'auto')).target).toBe('cloud');
  });

  it('every decision carries a rationale', () => {
    const d = route(sig('good', 'normal', 'simple', 'standard', 'auto'));
    expect(d.rationale.length).toBeGreaterThan(0);
  });
});

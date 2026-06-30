import { describe, it, expect } from 'vitest';
import { SIGNAL_DOMAINS, type SageSignals } from '@sage/shared-types';
import {
  readSignals,
  readSignalsSafe,
  SignalReadError,
  createMockSignalProvider,
  createFailingNetworkProvider,
  type SignalProvider,
} from '../src/index';

function inDomain(s: SageSignals): boolean {
  return (Object.keys(SIGNAL_DOMAINS) as (keyof SageSignals)[]).every((k) =>
    (SIGNAL_DOMAINS[k] as readonly string[]).includes(s[k]),
  );
}

describe('readSignals — Phase 0 cold-start guarantee', () => {
  it('returns a fully valid five-signal vector', async () => {
    const provider = createMockSignalProvider();
    const signals = await readSignals(provider, { taskText: 'hi' });
    expect(Object.keys(signals).sort()).toEqual(
      ['complexity', 'network', 'power', 'preference', 'privacy'].sort(),
    );
    expect(inDomain(signals)).toBe(true);
  });

  it('honors provider overrides', async () => {
    const provider = createMockSignalProvider({
      network: 'offline',
      power: 'critical',
      privacy: 'sensitive',
      preference: 'prefer_local',
    });
    const s = await readSignals(provider, { taskText: 'note' });
    expect(s).toMatchObject({
      network: 'offline',
      power: 'critical',
      privacy: 'sensitive',
      preference: 'prefer_local',
    });
  });

  it('throws when a reader returns an out-of-domain value', async () => {
    const bad: SignalProvider = {
      ...createMockSignalProvider(),
      // @ts-expect-error — deliberately invalid value for the test
      async readNetwork() {
        return 'lte';
      },
    };
    await expect(readSignals(bad, { taskText: 'x' })).rejects.toBeInstanceOf(
      SignalReadError,
    );
  });
});

describe('readSignalsSafe — resilient cold start', () => {
  it('substitutes a conservative fallback when a reader fails', async () => {
    const provider = createFailingNetworkProvider();
    const res = await readSignalsSafe(provider, { taskText: 'x' });
    expect(res.degraded).toBe(true);
    expect(res.failed).toContain('network');
    // Failed network must fall back to offline (forces local routing).
    expect(res.signals.network).toBe('offline');
    expect(inDomain(res.signals)).toBe(true);
  });

  it('reports no degradation when all readers succeed', async () => {
    const res = await readSignalsSafe(createMockSignalProvider(), {
      taskText: 'x',
    });
    expect(res.degraded).toBe(false);
    expect(res.failed).toEqual([]);
  });
});

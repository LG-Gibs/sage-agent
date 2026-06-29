import { SIGNAL_DOMAINS, type ArbiterSignals } from '@sage/shared-types';
import type { SignalProvider } from './types';

export class SignalReadError extends Error {}

function ensureInDomain<K extends keyof ArbiterSignals>(
  key: K,
  value: ArbiterSignals[K],
): ArbiterSignals[K] {
  const allowed = SIGNAL_DOMAINS[key] as readonly string[];
  if (!allowed.includes(value as unknown as string)) {
    throw new SignalReadError(
      `Signal "${key}" returned out-of-domain value: ${String(value)}`,
    );
  }
  return value;
}

export interface ReadSignalsContext {
  /** Latest user input, used by the complexity classifier (Signal 3). */
  taskText: string;
}

/**
 * Read all five signals concurrently and validate each is within its allowed
 * domain. Guarantees a valid `ArbiterSignals` vector — the Phase 0 success
 * criterion "all five ArbiterRouter signals return valid values at cold start."
 * Never contacts the network.
 */
export async function readSignals(
  provider: SignalProvider,
  ctx: ReadSignalsContext,
): Promise<ArbiterSignals> {
  const [network, power, complexity, privacy, preference] = await Promise.all([
    provider.readNetwork(),
    provider.readPower(),
    provider.readComplexity(ctx.taskText),
    provider.readPrivacy(),
    provider.readPreference(),
  ]);
  return {
    network: ensureInDomain('network', network),
    power: ensureInDomain('power', power),
    complexity: ensureInDomain('complexity', complexity),
    privacy: ensureInDomain('privacy', privacy),
    preference: ensureInDomain('preference', preference),
  };
}

/**
 * Conservative, offline-leaning fallbacks. If a reader fails we must never
 * accidentally route private data to the cloud, so the default is to look
 * offline (which the ArbiterRouter treats as a hard local override).
 */
const SAFE_FALLBACK: ArbiterSignals = {
  network: 'offline',
  power: 'low',
  complexity: 'simple',
  privacy: 'standard',
  preference: 'auto',
};

export interface SafeSignalsResult {
  signals: ArbiterSignals;
  /** True if any individual reader failed and a fallback was substituted. */
  degraded: boolean;
  /** Which signals fell back, for diagnostics / the capability manifest. */
  failed: (keyof ArbiterSignals)[];
}

async function safeRead<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<{ value: T; ok: boolean }> {
  try {
    return { value: await fn(), ok: true };
  } catch {
    return { value: fallback, ok: false };
  }
}

/**
 * Resilient variant: reads each signal independently with a per-signal
 * fallback so the app can still reach `ready` state even if one OS probe
 * misbehaves at cold start. Reports which signals degraded.
 */
export async function readSignalsSafe(
  provider: SignalProvider,
  ctx: ReadSignalsContext,
): Promise<SafeSignalsResult> {
  const [network, power, complexity, privacy, preference] = await Promise.all([
    safeRead(() => provider.readNetwork(), SAFE_FALLBACK.network),
    safeRead(() => provider.readPower(), SAFE_FALLBACK.power),
    safeRead(() => provider.readComplexity(ctx.taskText), SAFE_FALLBACK.complexity),
    safeRead(() => provider.readPrivacy(), SAFE_FALLBACK.privacy),
    safeRead(() => provider.readPreference(), SAFE_FALLBACK.preference),
  ]);
  const failed: (keyof ArbiterSignals)[] = [];
  if (!network.ok) failed.push('network');
  if (!power.ok) failed.push('power');
  if (!complexity.ok) failed.push('complexity');
  if (!privacy.ok) failed.push('privacy');
  if (!preference.ok) failed.push('preference');
  return {
    signals: {
      network: network.value,
      power: power.value,
      complexity: complexity.value,
      privacy: privacy.value,
      preference: preference.value,
    },
    degraded: failed.length > 0,
    failed,
  };
}

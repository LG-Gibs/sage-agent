import type { SageCapabilityNativeModule } from '../../modules/sage-capability';

let cached: SageCapabilityNativeModule | null | undefined;

/**
 * Lazily resolve the native module. Returns null instead of throwing when the
 * module isn't linked (e.g. running in Expo Go rather than a dev client), so
 * the app can boot in a clearly-flagged degraded state.
 */
export function getSageCapabilityModule(): SageCapabilityNativeModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../modules/sage-capability')
      .default as SageCapabilityNativeModule;
    cached = mod ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Thermal state accessor used by the power signal (SageRouter Signal 2). */
export function getThermalState(): 'nominal' | 'fair' | 'serious' | 'critical' {
  const native = getSageCapabilityModule();
  try {
    return native ? native.getThermalState() : 'nominal';
  } catch {
    return 'nominal';
  }
}

import {
  RAM_9B_THRESHOLD_BYTES,
  type CapabilityManifest,
} from '@sage/shared-types';
import type { NativeCapabilityProbe } from './types';

export interface BuildManifestOptions {
  /** Result of reading all five ArbiterRouter signals at cold start. */
  signalsReady: boolean;
}

/**
 * Derive the `ready` gate. The app may only enter ready state when:
 *  - all five signals were readable, AND
 *  - at least one installed GGUF model is verified (so local inference,
 *    the offline floor of the graceful-degradation hierarchy, is possible).
 */
export function deriveReady(m: Omit<CapabilityManifest, 'ready'>): boolean {
  const hasVerifiedModel = m.installedModels.some((x) => x.verified);
  return m.signalsReady && hasVerifiedModel;
}

/**
 * Assemble the Capability Manifest from native probe readings.
 * Platform-agnostic: the iOS/Android differences live behind the probe.
 */
export async function buildCapabilityManifest(
  probe: NativeCapabilityProbe,
  opts: BuildManifestOptions,
): Promise<CapabilityManifest> {
  const [
    platform,
    osVersion,
    totalRamBytes,
    gpu,
    mlAccelerator,
    npuPresent,
    installedModels,
  ] = await Promise.all([
    probe.getPlatform(),
    probe.getOsVersion(),
    probe.getTotalRamBytes(),
    probe.getGpuBackend(),
    probe.getMlAccelerator(),
    probe.hasNpu(),
    probe.listInstalledModels(),
  ]);

  const base: Omit<CapabilityManifest, 'ready'> = {
    platform,
    osVersion,
    totalRamBytes,
    supports9B: totalRamBytes >= RAM_9B_THRESHOLD_BYTES,
    gpu,
    mlAccelerator,
    npuPresent,
    installedModels,
    signalsReady: opts.signalsReady,
  };

  return { ...base, ready: deriveReady(base) };
}

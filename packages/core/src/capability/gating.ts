import { LOCAL_MODELS, type CapabilityManifest } from '@sage/shared-types';

export interface PermissionState {
  microphone: boolean;
}

/**
 * Capability-aware feature flags for the UI shell (Phase 2). Each disabled
 * feature carries a human-readable reason so the UI can explain *why* a tile is
 * greyed out rather than silently hiding it.
 */
export interface FeatureFlags {
  localInference: boolean;
  voice: boolean;
  wakeWord: boolean;
  model9B: boolean;
  reasons: Partial<Record<keyof Omit<FeatureFlags, 'reasons'>, string>>;
}

export function deriveFeatureFlags(
  manifest: CapabilityManifest,
  perms: PermissionState,
): FeatureFlags {
  const reasons: FeatureFlags['reasons'] = {};

  const localInference = manifest.installedModels.some((m) => m.verified);
  if (!localInference) reasons.localInference = 'No verified GGUF model installed';

  const voice = manifest.ready && perms.microphone;
  if (!perms.microphone) reasons.voice = 'Microphone permission not granted';
  else if (!manifest.ready) reasons.voice = 'Device not ready (capability manifest incomplete)';

  // Porcupine wake word needs the same mic + ready state as the voice loop.
  const wakeWord = voice;
  if (!wakeWord) reasons.wakeWord = reasons.voice ?? 'Voice unavailable';

  const has9B = manifest.installedModels.some(
    (m) => m.id === LOCAL_MODELS.capable && m.verified,
  );
  const model9B = manifest.supports9B && has9B;
  if (!manifest.supports9B) reasons.model9B = 'Requires ≥8GB RAM';
  else if (!has9B) reasons.model9B = 'Gemma 4 9B not installed';

  return { localInference, voice, wakeWord, model9B, reasons };
}

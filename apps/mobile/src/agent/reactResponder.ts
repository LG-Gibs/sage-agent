import type { CapabilityManifest, InstalledModel } from '@sage/shared-types';
import type { Responder } from '@sage/voice-core';
import { createDeviceReActLoop } from './createReActLoop';
import { SignalsCache } from './signalsCache';

/**
 * Adapts the on-device ReActLoop into the voice loop's Responder seam (the
 * point Phase 2 reserved). Replaces the Phase 2 single-shot local responder:
 * now the ArbiterRouter decides local vs cloud per turn, tools run through the
 * ToolDomainRouter, and tokens stream to TTS as they arrive.
 *
 * The loop (and its warm llama engine) is built once and reused across turns; a
 * mutable token sink lets each turn stream into the current TTS call.
 */
export function createReActResponder(
  manifest: CapabilityManifest,
  model: InstalledModel,
): Responder {
  const signals = new SignalsCache();
  let sink: ((token: string) => void) | null = null;

  const loop = createDeviceReActLoop(manifest, model, signals, {
    onText: (delta) => sink?.(delta),
  });

  return async (transcript, onToken, signal) => {
    sink = onToken;
    try {
      await signals.refresh(transcript);
      const result = await loop.run([{ role: 'user', content: transcript }], { signal });
      return result.finalText;
    } finally {
      sink = null;
    }
  };
}

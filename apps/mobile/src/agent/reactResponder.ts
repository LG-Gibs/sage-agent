import type { CapabilityManifest, InstalledModel } from '@sage/shared-types';
import type { Responder } from '@sage/voice-core';
import { toMemoryFragments } from '@sage/memory-core';
import { createDeviceReActLoop } from './createReActLoop';
import { deviceMemory } from '../memory/deviceMemory';
import { SignalsCache } from './signalsCache';

/**
 * Adapts the on-device ReActLoop into the voice loop's Responder seam (the
 * point Phase 2 reserved). Replaces the Phase 2 single-shot local responder:
 * now the SageRouter decides local vs cloud per turn, tools run through the
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
      // Constraint 5: search local memory on-device and inject the matches as
      // opaque memories[] for the (possibly cloud) inference cycle.
      const hits = await deviceMemory().recall(transcript, 5);
      const memories = toMemoryFragments(hits, { minScore: 0.15, maxFragments: 5 });
      const result = await loop.run([{ role: 'user', content: transcript }], { signal, memories });
      return result.finalText;
    } finally {
      sink = null;
    }
  };
}

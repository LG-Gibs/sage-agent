import {
  LOCAL_MODELS,
  type CapabilityManifest,
  type InstalledModel,
} from '@sage/shared-types';
import { VoicePipeline, type VoicePipelineHooks } from '@sage/voice-core';
import { createWakeWordEngine } from './wakeWord';
import { createWhisperStt } from './stt';
import { createPiperTts } from './tts';
import { createReActResponder } from '../agent/reactResponder';
import { PIPER_VOICE_ID } from './voiceConfig';

function pickModel(manifest: CapabilityManifest): InstalledModel | null {
  return (
    manifest.installedModels.find(
      (m) => m.verified && m.id === LOCAL_MODELS.default,
    ) ??
    manifest.installedModels.find((m) => m.verified) ??
    null
  );
}

/**
 * Compose the native voice engines + the Phase 3 ReActLoop responder into a
 * VoicePipeline. The responder now routes each turn via the ArbiterRouter
 * (local llama.cpp vs cloud) and runs tools through the ToolDomainRouter.
 * Returns null when no verified model is present (the UI then shows a
 * "voice unavailable" reason from the feature flags).
 */
export function createVoicePipeline(
  manifest: CapabilityManifest,
  hooks?: VoicePipelineHooks,
): VoicePipeline | null {
  const model = pickModel(manifest);
  if (!model) return null;

  return new VoicePipeline({
    wake: createWakeWordEngine(),
    stt: createWhisperStt(model),
    tts: createPiperTts(PIPER_VOICE_ID),
    responder: createReActResponder(manifest, model),
    hooks,
  });
}

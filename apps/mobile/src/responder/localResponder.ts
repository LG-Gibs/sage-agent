import type { InstalledModel } from '@sage/shared-types';
import type { Responder } from '@sage/voice-core';
import { createLlamaEngine } from '../inference/localEngine';

/**
 * Offline responder bridging STT → TTS using on-device llama.cpp (Gemma 4).
 *
 * This is the Phase 2 stand-in that makes the voice loop genuinely end-to-end
 * offline. Phase 3 replaces it with the full ReActLoop (which adds the
 * ArbiterRouter, tool calls and cloud escalation). The engine is loaded lazily
 * and kept warm across turns.
 */
export function createLocalResponder(model: InstalledModel): Responder {
  const engine = createLlamaEngine();
  let loaded = false;

  return async (transcript, onToken, signal) => {
    if (!loaded) {
      await engine.load(model);
      loaded = true;
    }
    // Gemma chat template.
    const prompt =
      `<start_of_turn>user\n${transcript}<end_of_turn>\n<start_of_turn>model\n`;
    let full = '';
    await engine.complete(prompt, (tok) => {
      if (signal.aborted) return;
      full += tok;
      onToken(tok);
    });
    return full.trim();
  };
}

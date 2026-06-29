import { EventEmitter, requireNativeModule } from 'expo-modules-core';
import type { TtsEngine, TtsSpeakOptions } from '@sage/voice-core';

/**
 * On-device text-to-speech via Piper (VITS ONNX), wrapped by the SageTts native
 * module. Fully offline. Emits `onSpeakStart` at first audio frame for latency
 * measurement; `speak()` resolves when playback finishes.
 */
interface SageTtsNative {
  speak(text: string, voiceId: string): Promise<void>;
  stop(): void;
}

const native: SageTtsNative | null = (() => {
  try {
    return requireNativeModule<SageTtsNative>('SageTts');
  } catch {
    return null;
  }
})();

const emitter = native ? new EventEmitter(native as object) : null;

export function createPiperTts(voiceId: string): TtsEngine {
  const available = native !== null;
  return {
    available,
    async speak(text: string, { onStart, signal }: TtsSpeakOptions) {
      if (!native) throw new Error('Piper TTS native module unavailable');
      const startSub = emitter?.addListener('onSpeakStart', () => onStart?.());
      const onAbort = () => native.stop();
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        await native.speak(text, voiceId);
      } finally {
        startSub?.remove();
        signal.removeEventListener('abort', onAbort);
      }
    },
    async stop() {
      native?.stop();
    },
  };
}

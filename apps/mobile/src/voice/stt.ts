import { initWhisper, type WhisperContext } from 'whisper.rn';
import type { InstalledModel } from '@sage/shared-types';
import type { SttCaptureOptions, SttEngine, SttResult } from '@sage/voice-core';
import { STT_MAX_CAPTURE_MS } from './voiceConfig';

/**
 * On-device speech-to-text via Whisper.cpp (whisper.rn). Fully offline. Uses
 * realtime transcription: streams partials and resolves with the final text
 * when capture ends (endpointing) or the pipeline aborts / forces stop.
 */
export function createWhisperStt(model: InstalledModel | null): SttEngine {
  let ctx: WhisperContext | null = null;
  let activeStop: (() => void) | null = null;
  const available = !!model && model.verified;

  return {
    available,

    async transcribe({ onPartial, signal }: SttCaptureOptions): Promise<SttResult> {
      if (!model) throw new Error('No verified Whisper model available');
      if (!ctx) ctx = await initWhisper({ filePath: model.path });

      const { stop, subscribe } = await ctx.transcribeRealtime({
        language: 'en',
        realtimeAudioSec: STT_MAX_CAPTURE_MS / 1000,
        realtimeAudioSliceSec: 1,
      });
      activeStop = stop;

      return await new Promise<SttResult>((resolve, reject) => {
        const onAbort = () => {
          stop();
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        };
        signal.addEventListener('abort', onAbort, { once: true });

        let latest = '';
        subscribe((evt) => {
          latest = evt.data?.result ?? latest;
          onPartial?.(latest);
          if (!evt.isCapturing) {
            signal.removeEventListener('abort', onAbort);
            // Capture has ended; transcript is final. Timestamp marks capture-end.
            resolve({ text: latest, captureEndedAt: Date.now() });
          }
        });
      });
    },

    async stop() {
      activeStop?.();
      activeStop = null;
    },
  };
}

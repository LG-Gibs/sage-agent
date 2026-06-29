import { PorcupineManager } from '@picovoice/porcupine-react-native';
import type { WakeWordEngine } from '@sage/voice-core';
import { HEY_SAGE_KEYWORD_PATH, PICOVOICE_ACCESS_KEY } from './voiceConfig';

/**
 * Always-on "Hey Sage" wake word via Picovoice Porcupine — ultra-low-power,
 * fully on-device. If no access key / keyword is configured, reports
 * `available: false` and the pipeline falls back to push-to-talk.
 */
export function createWakeWordEngine(): WakeWordEngine {
  let manager: PorcupineManager | null = null;
  const available = PICOVOICE_ACCESS_KEY.length > 0;

  return {
    available,
    async start(onWake: () => void) {
      if (!available) return;
      manager = await PorcupineManager.fromKeywordPaths(
        PICOVOICE_ACCESS_KEY,
        [HEY_SAGE_KEYWORD_PATH],
        (keywordIndex: number) => {
          if (keywordIndex >= 0) onWake();
        },
        (error) => {
          // eslint-disable-next-line no-console
          console.warn('[wake] porcupine error', error);
        },
      );
      await manager.start();
    },
    async stop() {
      try {
        await manager?.stop();
        await manager?.delete();
      } finally {
        manager = null;
      }
    },
  };
}

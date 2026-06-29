/**
 * End-to-end voice I/O latency target. The Phase 2 success criterion is
 * "<500ms TTS/STT latency". We treat the *system* I/O latency as the budget:
 * STT compute (capture-end → transcript) plus TTS start (text → first audio).
 * The model's "think" time depends on the prompt/model and is reported
 * separately rather than counted against the I/O budget.
 */
export const VOICE_LATENCY_TARGET_MS = 500;

export interface CycleLatency {
  trigger: 'wake' | 'manual';
  /** Capture-end → final transcript (Whisper compute). */
  sttMs?: number;
  /** Transcript → first response token (responder). */
  thinkMs?: number;
  /** Response start → first audio frame (Piper). */
  ttsStartMs?: number;
  /** Whole turn wall-clock. */
  totalMs?: number;
  /** sttMs + ttsStartMs ≤ VOICE_LATENCY_TARGET_MS. */
  withinTarget?: boolean;
}

export function ioLatency(l: CycleLatency): number {
  return (l.sttMs ?? 0) + (l.ttsStartMs ?? 0);
}

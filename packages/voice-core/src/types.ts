/**
 * Voice loop state. A turn flows:
 * wake_listening → capturing → transcribing → thinking → speaking → (re-arm).
 */
export type VoiceState =
  | 'idle' // not listening (push-to-talk still available)
  | 'wake_listening' // Porcupine armed for "Hey Sage"
  | 'capturing' // recording user speech
  | 'transcribing' // Whisper.cpp producing text
  | 'thinking' // responder generating
  | 'speaking' // Piper TTS playing
  | 'error';

/** Always-on wake word (Picovoice Porcupine). */
export interface WakeWordEngine {
  readonly available: boolean;
  start(onWake: () => void): Promise<void>;
  stop(): Promise<void>;
}

export interface SttResult {
  text: string;
  /**
   * Clock timestamp at which audio capture ended. Lets the pipeline measure
   * true STT-compute latency (transcript_ready − capture_ended) rather than
   * including the user's speaking time.
   */
  captureEndedAt?: number;
}

export interface SttCaptureOptions {
  onPartial?: (text: string) => void;
  signal: AbortSignal;
}

/** Speech-to-text (Whisper.cpp). Must run on-device / offline. */
export interface SttEngine {
  readonly available: boolean;
  transcribe(opts: SttCaptureOptions): Promise<SttResult>;
  stop(): Promise<void>;
}

export interface TtsSpeakOptions {
  /** Fires when the first audio frame plays — the TTS-start latency marker. */
  onStart?: () => void;
  signal: AbortSignal;
}

/** Text-to-speech (Piper). Must run on-device / offline. */
export interface TtsEngine {
  readonly available: boolean;
  speak(text: string, opts: TtsSpeakOptions): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Produces the assistant's reply from a transcript, streaming tokens.
 * Phase 2 injects an offline local-llama responder; Phase 3 replaces it with
 * the full ReActLoop. Returns the complete text (handed to TTS).
 */
export type Responder = (
  transcript: string,
  onToken: (token: string) => void,
  signal: AbortSignal,
) => Promise<string>;

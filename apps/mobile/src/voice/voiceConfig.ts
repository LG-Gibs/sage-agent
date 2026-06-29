/**
 * Voice subsystem configuration.
 *
 * NOTE: PICOVOICE_ACCESS_KEY is an on-device SDK *license* key for the
 * Porcupine wake-word engine. It is NOT an upstream LLM/cloud key and never
 * transmits user audio or data off-device — Porcupine runs entirely locally.
 * Source it from app config (EXPO_PUBLIC_*) or, preferably, secure storage.
 */
export const PICOVOICE_ACCESS_KEY = process.env.EXPO_PUBLIC_PICOVOICE_KEY ?? '';

/**
 * Custom "Hey Sage" keyword model. Generate the .ppn in the Picovoice Console
 * and bundle it as an asset. Falls back to push-to-talk if absent.
 */
export const HEY_SAGE_KEYWORD_PATH = 'hey-sage.ppn';

/** Bundled Piper voice (VITS ONNX). */
export const PIPER_VOICE_ID = 'en_US-amy-medium';

/** Max realtime capture window before forced endpointing (ms). */
export const STT_MAX_CAPTURE_MS = 12_000;

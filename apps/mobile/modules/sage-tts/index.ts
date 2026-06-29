import { requireNativeModule } from 'expo-modules-core';

/**
 * Native Piper TTS module. Synthesizes speech on-device from a VITS ONNX voice
 * and plays it natively. Emits `onSpeakStart` at the first audio frame.
 */
export default requireNativeModule('SageTts');

export type Platform = 'ios' | 'android';

/** GPU acceleration backend used by llama.cpp. Metal on iOS, Vulkan on Android. */
export type GpuBackend = 'metal' | 'vulkan' | 'none';

/** Hardware ML accelerator. Core ML on iOS, NNAPI on Android. */
export type MlAccelerator = 'coreml' | 'nnapi' | 'none';

export interface InstalledModel {
  /** 'gemma-4-2b' | 'gemma-4-9b' */
  id: string;
  /** On-device absolute path to the GGUF file. */
  path: string;
  sizeBytes: number;
  /** GGUF header / checksum verified at startup. */
  verified: boolean;
}

/**
 * Capability Manifest — verified at startup, determines feature availability.
 * The app may only enter `ready` state once this is assembled AND all five
 * SageRouter signals are readable.
 */
export interface CapabilityManifest {
  platform: Platform;
  osVersion: string;
  totalRamBytes: number;
  /** True when device RAM >= 8GB — gates the opt-in Gemma 4 9B model. */
  supports9B: boolean;
  gpu: GpuBackend;
  mlAccelerator: MlAccelerator;
  npuPresent: boolean;
  installedModels: InstalledModel[];
  /** True once all five signal readers returned a valid value at cold start. */
  signalsReady: boolean;
  /** Derived gate: see deriveReady(). */
  ready: boolean;
}

/** RAM threshold gating the 9B model: 8 GiB. */
export const RAM_9B_THRESHOLD_BYTES = 8 * 1024 * 1024 * 1024;

/** Canonical local model ids. */
export const LOCAL_MODELS = {
  default: 'gemma-4-2b',
  capable: 'gemma-4-9b',
} as const;

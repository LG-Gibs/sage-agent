import { requireNativeModule } from 'expo-modules-core';

/**
 * Native surface of the SageCapability module. Implemented in Swift (iOS) and
 * Kotlin (Android). All functions are cheap, synchronous probes except
 * `listInstalledModels`, which touches the filesystem and is async.
 */
export interface SageCapabilityNativeModule {
  getPlatform(): 'ios' | 'android';
  getOsVersion(): string;
  getTotalRamBytes(): number;
  getGpuBackend(): 'metal' | 'vulkan' | 'none';
  getMlAccelerator(): 'coreml' | 'nnapi' | 'none';
  hasNpu(): boolean;
  /** Thermal state feeds ArbiterRouter Signal 2 (Power State). */
  getThermalState(): 'nominal' | 'fair' | 'serious' | 'critical';
  listInstalledModels(): Promise<
    { id: string; path: string; sizeBytes: number; verified: boolean }[]
  >;
}

// Throws if the native module isn't linked (e.g. running in Expo Go instead of
// a dev client). Callers should guard with a try/catch — see nativeProbe.ts.
export default requireNativeModule<SageCapabilityNativeModule>('SageCapability');

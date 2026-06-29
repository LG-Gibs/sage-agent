import type {
  GpuBackend,
  InstalledModel,
  MlAccelerator,
  Platform,
} from '@sage/shared-types';

/**
 * Native capability probe — implemented by the SageCapability Swift/Kotlin
 * module on device, mocked in tests. Each method is a thin native bridge call.
 */
export interface NativeCapabilityProbe {
  getPlatform(): Promise<Platform>;
  getOsVersion(): Promise<string>;
  getTotalRamBytes(): Promise<number>;
  getGpuBackend(): Promise<GpuBackend>;
  getMlAccelerator(): Promise<MlAccelerator>;
  hasNpu(): Promise<boolean>;
  listInstalledModels(): Promise<InstalledModel[]>;
}

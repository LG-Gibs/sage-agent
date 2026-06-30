import type {
  GpuBackend,
  InstalledModel,
  MlAccelerator,
  Platform,
} from '@sage/shared-types';
import type { NativeCapabilityProbe } from './types';

export interface MockProbeConfig {
  platform?: Platform;
  osVersion?: string;
  totalRamBytes?: number;
  gpu?: GpuBackend;
  mlAccelerator?: MlAccelerator;
  npuPresent?: boolean;
  installedModels?: InstalledModel[];
}

const GB = 1024 * 1024 * 1024;

/** A representative high-end iOS device by default; override per test. */
export function createMockCapabilityProbe(
  cfg: MockProbeConfig = {},
): NativeCapabilityProbe {
  const {
    platform = 'ios',
    osVersion = '18.2',
    totalRamBytes = 8 * GB,
    gpu = 'metal',
    mlAccelerator = 'coreml',
    npuPresent = true,
    installedModels = [
      {
        id: 'gemma-4-2b',
        path: '/var/models/gemma-4-2b-q4.gguf',
        sizeBytes: Math.round(1.6 * GB),
        verified: true,
      },
    ],
  } = cfg;

  return {
    async getPlatform() {
      return platform;
    },
    async getOsVersion() {
      return osVersion;
    },
    async getTotalRamBytes() {
      return totalRamBytes;
    },
    async getGpuBackend() {
      return gpu;
    },
    async getMlAccelerator() {
      return mlAccelerator;
    },
    async hasNpu() {
      return npuPresent;
    },
    async listInstalledModels() {
      return installedModels;
    },
  };
}

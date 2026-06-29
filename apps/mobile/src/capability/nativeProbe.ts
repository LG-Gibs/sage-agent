import { Platform } from 'react-native';
import type { NativeCapabilityProbe } from '@sage/arbiter-core';
import { getSageCapabilityModule } from '../native/sageCapability';

/**
 * Implements the platform-agnostic NativeCapabilityProbe using the
 * SageCapability native module. When the module is unavailable, falls back to a
 * conservative probe (no models, no acceleration) so the manifest reports
 * `ready: false` rather than crashing.
 */
export function createNativeCapabilityProbe(): NativeCapabilityProbe {
  const native = getSageCapabilityModule();
  if (!native) return fallbackProbe();
  return {
    async getPlatform() {
      return native.getPlatform();
    },
    async getOsVersion() {
      return native.getOsVersion();
    },
    async getTotalRamBytes() {
      return native.getTotalRamBytes();
    },
    async getGpuBackend() {
      return native.getGpuBackend();
    },
    async getMlAccelerator() {
      return native.getMlAccelerator();
    },
    async hasNpu() {
      return native.hasNpu();
    },
    async listInstalledModels() {
      return native.listInstalledModels();
    },
  };
}

function fallbackProbe(): NativeCapabilityProbe {
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  return {
    async getPlatform() {
      return platform;
    },
    async getOsVersion() {
      return String(Platform.Version ?? 'unknown');
    },
    async getTotalRamBytes() {
      return 0;
    },
    async getGpuBackend() {
      return 'none';
    },
    async getMlAccelerator() {
      return 'none';
    },
    async hasNpu() {
      return false;
    },
    async listInstalledModels() {
      return [];
    },
  };
}

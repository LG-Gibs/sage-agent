import { describe, it, expect } from 'vitest';
import type { CapabilityManifest } from '@sage/shared-types';
import { deriveFeatureFlags } from '../src/index';

const GB = 1024 * 1024 * 1024;

function manifest(over: Partial<CapabilityManifest> = {}): CapabilityManifest {
  return {
    platform: 'ios',
    osVersion: '18',
    totalRamBytes: 8 * GB,
    supports9B: true,
    gpu: 'metal',
    mlAccelerator: 'coreml',
    npuPresent: true,
    installedModels: [
      { id: 'gemma-4-2b', path: '/m2b.gguf', sizeBytes: 1, verified: true },
    ],
    signalsReady: true,
    ready: true,
    ...over,
  };
}

describe('deriveFeatureFlags', () => {
  it('enables voice + wake word when ready and mic granted', () => {
    const f = deriveFeatureFlags(manifest(), { microphone: true });
    expect(f.voice).toBe(true);
    expect(f.wakeWord).toBe(true);
    expect(f.localInference).toBe(true);
  });

  it('disables voice with a reason when mic denied', () => {
    const f = deriveFeatureFlags(manifest(), { microphone: false });
    expect(f.voice).toBe(false);
    expect(f.wakeWord).toBe(false);
    expect(f.reasons.voice).toMatch(/permission/i);
  });

  it('disables voice when the device is not ready', () => {
    const f = deriveFeatureFlags(manifest({ ready: false }), { microphone: true });
    expect(f.voice).toBe(false);
    expect(f.reasons.voice).toMatch(/not ready/i);
  });

  it('gates 9B on RAM', () => {
    const f = deriveFeatureFlags(
      manifest({ supports9B: false, totalRamBytes: 6 * GB }),
      { microphone: true },
    );
    expect(f.model9B).toBe(false);
    expect(f.reasons.model9B).toMatch(/8GB/);
  });

  it('gates 9B on the model being installed even with enough RAM', () => {
    const f = deriveFeatureFlags(manifest(), { microphone: true }); // only 2B installed
    expect(f.model9B).toBe(false);
    expect(f.reasons.model9B).toMatch(/not installed/i);
  });

  it('enables 9B when RAM and a verified 9B model are present', () => {
    const f = deriveFeatureFlags(
      manifest({
        installedModels: [
          { id: 'gemma-4-9b', path: '/m9b.gguf', sizeBytes: 1, verified: true },
        ],
      }),
      { microphone: true },
    );
    expect(f.model9B).toBe(true);
  });

  it('flags localInference off when no model is verified', () => {
    const f = deriveFeatureFlags(
      manifest({
        ready: false,
        installedModels: [
          { id: 'gemma-4-2b', path: '/m.gguf', sizeBytes: 1, verified: false },
        ],
      }),
      { microphone: true },
    );
    expect(f.localInference).toBe(false);
    expect(f.reasons.localInference).toMatch(/verified/i);
  });
});

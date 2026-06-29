import { describe, it, expect } from 'vitest';
import { RAM_9B_THRESHOLD_BYTES } from '@sage/shared-types';
import {
  buildCapabilityManifest,
  deriveReady,
  createMockCapabilityProbe,
} from '../src/index';

const GB = 1024 * 1024 * 1024;

describe('buildCapabilityManifest', () => {
  it('assembles a manifest from native probe readings (iOS default)', async () => {
    const m = await buildCapabilityManifest(createMockCapabilityProbe(), {
      signalsReady: true,
    });
    expect(m.platform).toBe('ios');
    expect(m.gpu).toBe('metal');
    expect(m.mlAccelerator).toBe('coreml');
    expect(m.ready).toBe(true);
  });

  it('gates the 9B model on >= 8GB RAM', async () => {
    const low = await buildCapabilityManifest(
      createMockCapabilityProbe({ totalRamBytes: 6 * GB }),
      { signalsReady: true },
    );
    expect(low.supports9B).toBe(false);

    const high = await buildCapabilityManifest(
      createMockCapabilityProbe({ totalRamBytes: RAM_9B_THRESHOLD_BYTES }),
      { signalsReady: true },
    );
    expect(high.supports9B).toBe(true);
  });

  it('reflects Android paradigms (Vulkan + NNAPI)', async () => {
    const m = await buildCapabilityManifest(
      createMockCapabilityProbe({
        platform: 'android',
        gpu: 'vulkan',
        mlAccelerator: 'nnapi',
        osVersion: '14',
      }),
      { signalsReady: true },
    );
    expect(m.platform).toBe('android');
    expect(m.gpu).toBe('vulkan');
    expect(m.mlAccelerator).toBe('nnapi');
  });

  it('is NOT ready when signals are unread', async () => {
    const m = await buildCapabilityManifest(createMockCapabilityProbe(), {
      signalsReady: false,
    });
    expect(m.ready).toBe(false);
  });

  it('is NOT ready when no verified model is installed', async () => {
    const m = await buildCapabilityManifest(
      createMockCapabilityProbe({ installedModels: [] }),
      { signalsReady: true },
    );
    expect(m.ready).toBe(false);
  });

  it('deriveReady requires both a verified model and signals', () => {
    expect(
      deriveReady({
        platform: 'ios',
        osVersion: '18',
        totalRamBytes: 8 * GB,
        supports9B: true,
        gpu: 'metal',
        mlAccelerator: 'coreml',
        npuPresent: true,
        installedModels: [
          { id: 'gemma-4-2b', path: '/m.gguf', sizeBytes: 1, verified: false },
        ],
        signalsReady: true,
      }),
    ).toBe(false);
  });
});

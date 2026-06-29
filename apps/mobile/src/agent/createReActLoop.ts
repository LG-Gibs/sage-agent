import {
  ReActLoop,
  ToolDomainRouter,
  createArbiterRouter,
  createCloudTarget,
  type ReActHooks,
} from '@sage/arbiter-core';
import type { CapabilityManifest, InstalledModel } from '@sage/shared-types';
import { createLocalInferenceTarget } from './localInferenceTarget';
import { createCloudToolClient } from './cloudToolClient';
import { mobileToolHandlers } from './mobileToolHandlers';
import { SignalsCache } from './signalsCache';
import { SAGE_BACKEND_URL } from './sageConfig';

/**
 * Compose the on-device ReActLoop: ArbiterRouter + local (llama.cpp) and cloud
 * (/api/sage/infer) targets + ToolDomainRouter (mobile handlers + cloud client).
 * The loop owns all orchestration; the server only ever runs one cycle.
 */
export function createDeviceReActLoop(
  manifest: CapabilityManifest,
  model: InstalledModel,
  signals: SignalsCache,
  hooks?: ReActHooks,
): ReActLoop {
  return new ReActLoop({
    arbiter: createArbiterRouter(),
    capability: manifest,
    readSignals: () => signals.current(),
    targets: {
      local: createLocalInferenceTarget(model),
      cloud: createCloudTarget({ baseUrl: SAGE_BACKEND_URL }),
    },
    toolRouter: new ToolDomainRouter({
      mobileHandlers: mobileToolHandlers,
      cloudClient: createCloudToolClient(SAGE_BACKEND_URL),
      isOnline: () => signals.current().network !== 'offline',
    }),
    hooks,
  });
}

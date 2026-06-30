import type {
  NetworkQuality,
  PowerState,
  PrivacyContext,
  UserPreference,
} from '@sage/shared-types';
import { classifyComplexity } from '../classifier/complexity';
import type { SignalProvider } from './types';

export interface MockSignalOverrides {
  network?: NetworkQuality;
  power?: PowerState;
  privacy?: PrivacyContext;
  preference?: UserPreference;
}

/**
 * Deterministic mock SignalProvider for tests and the Node harness.
 * Complexity is computed by the real classifier so the harness exercises it;
 * the other four signals are fixed via overrides.
 */
export function createMockSignalProvider(
  overrides: MockSignalOverrides = {},
): SignalProvider {
  return {
    async readNetwork() {
      return overrides.network ?? 'good';
    },
    async readPower() {
      return overrides.power ?? 'normal';
    },
    async readComplexity(taskText: string) {
      return classifyComplexity(taskText);
    },
    async readPrivacy() {
      return overrides.privacy ?? 'standard';
    },
    async readPreference() {
      return overrides.preference ?? 'auto';
    },
  };
}

/** A provider whose network reader throws — used to test cold-start resilience. */
export function createFailingNetworkProvider(): SignalProvider {
  const base = createMockSignalProvider();
  return {
    ...base,
    async readNetwork(): Promise<NetworkQuality> {
      throw new Error('network monitor unavailable');
    },
  };
}

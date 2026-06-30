import { classifyComplexity, type SignalProvider } from '@sage/core';
import { readNetwork } from './networkProvider';
import { readPower } from './powerProvider';
import { readPrivacy } from './privacyProvider';
import { readPreference } from './preferenceProvider';

/**
 * Composes the five native-backed readers into the platform-agnostic
 * SignalProvider that @sage/core consumes. Signal 3 (complexity) uses
 * the shared on-device classifier so the device and the test harness agree.
 */
export function createNativeSignalProvider(): SignalProvider {
  return {
    readNetwork,
    readPower,
    async readComplexity(taskText: string) {
      return classifyComplexity(taskText);
    },
    readPrivacy,
    readPreference,
  };
}

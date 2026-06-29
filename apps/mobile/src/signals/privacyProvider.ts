import type { PrivacyContext } from '@sage/shared-types';
import { settingsStore } from '../storage/secureSettings';

/**
 * Signal 4 — Privacy Context. Read from the encrypted settings store
 * (app state + user preference). Defaults to 'standard'. A 'sensitive' value
 * is a hard local override in the ArbiterRouter.
 */
export async function readPrivacy(): Promise<PrivacyContext> {
  const v = settingsStore().getString('privacyContext') as
    | PrivacyContext
    | undefined;
  return v === 'private' || v === 'sensitive' ? v : 'standard';
}

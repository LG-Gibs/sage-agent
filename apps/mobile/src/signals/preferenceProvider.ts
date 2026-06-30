import type { UserPreference } from '@sage/shared-types';
import { settingsStore } from '../storage/secureSettings';

/**
 * Signal 5 — User Preference. Read from the settings store. Defaults to 'auto'.
 * 'prefer_local' is a hard local override in the SageRouter.
 */
export async function readPreference(): Promise<UserPreference> {
  const v = settingsStore().getString('routingPreference') as
    | UserPreference
    | undefined;
  return v === 'prefer_local' || v === 'prefer_cloud' ? v : 'auto';
}

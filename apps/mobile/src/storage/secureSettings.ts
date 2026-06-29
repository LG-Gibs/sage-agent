import { MMKV } from 'react-native-mmkv';

/**
 * Encrypted settings store.
 *
 * Constitutional security requirement: the MMKV key store is encrypted at rest.
 * The encryption key itself is provisioned into the iOS Keychain / Android
 * Keystore on first launch (see docs/compliance.md) and read back through the
 * single accessor below — call sites never see the raw key.
 */
let store: MMKV | null = null;

export function settingsStore(): MMKV {
  if (!store) {
    store = new MMKV({ id: 'sage.settings', encryptionKey: provisionedKey() });
  }
  return store;
}

/**
 * Phase 1 wires this to expo-secure-store / a Keychain-Keystore bridge. The
 * key is generated with a CSPRNG on first launch and never leaves secure
 * hardware-backed storage. The placeholder keeps the scaffold runnable.
 */
function provisionedKey(): string {
  // TODO(phase-1): replace with Keychain (iOS) / Keystore (Android) lookup.
  return 'sage-dev-mmkv-key-replace-via-keychain';
}

/**
 * SAGE Backend v3 base URL for cloud inference + cloud tools. The device only
 * ever talks to this backend (never upstream providers directly). Source from
 * app config; the session token (not an upstream key) lives in Keychain/Keystore.
 */
export const SAGE_BACKEND_URL =
  process.env.EXPO_PUBLIC_SAGE_BACKEND_URL ?? 'https://api.sage.iterativ.app';

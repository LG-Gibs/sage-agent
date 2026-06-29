import type { SageOsNativeModule } from '../../modules/sage-os';

let cached: SageOsNativeModule | null | undefined;

/** Lazily resolve the native OS module; null if not linked (e.g. Expo Go). */
export function getSageOs(): SageOsNativeModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = (require('../../modules/sage-os').default as SageOsNativeModule) ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Native permission denials are surfaced as "permission_denied: <scope>". */
export function isPermissionError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.toLowerCase().includes('permission_denied');
}

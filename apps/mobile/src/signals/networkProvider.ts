import NetInfo from '@react-native-community/netinfo';
import type { NetworkQuality } from '@sage/shared-types';

/**
 * Signal 1 — Network Quality. One-shot read of the OS network monitor.
 * Maps connection type + cellular generation to the four-level scale.
 * Never performs a network request — it only reads the local monitor.
 */
export async function readNetwork(): Promise<NetworkQuality> {
  const s = await NetInfo.fetch();
  if (!s.isConnected) return 'offline';

  if (s.type === 'wifi' || s.type === 'ethernet') {
    return s.isInternetReachable === false ? 'poor' : 'good';
  }

  if (s.type === 'cellular') {
    const gen = (s.details as { cellularGeneration?: string } | null)
      ?.cellularGeneration;
    switch (gen) {
      case '2g':
        return 'poor';
      case '3g':
        return 'fair';
      case '4g':
      case '5g':
        return 'good';
      default:
        return 'fair';
    }
  }

  return s.isInternetReachable === false ? 'poor' : 'fair';
}

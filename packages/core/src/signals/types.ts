import type {
  NetworkQuality,
  PowerState,
  PrivacyContext,
  TaskComplexity,
  UserPreference,
} from '@sage/shared-types';

/**
 * The five on-device signal readers.
 *
 * Async to mirror the native bridge calls (battery API, network monitor,
 * settings store). Constitutional Constraint 2: NONE of these may contact the
 * network. The mobile app provides native-backed implementations; tests and
 * the Node harness provide mocks.
 */
export interface SignalProvider {
  /** Signal 1 — OS network monitor. */
  readNetwork(): Promise<NetworkQuality>;
  /** Signal 2 — OS battery API, also updated by the thermal guard. */
  readPower(): Promise<PowerState>;
  /** Signal 3 — local lightweight classifier over the pending task text. */
  readComplexity(taskText: string): Promise<TaskComplexity>;
  /** Signal 4 — app state + user preference. */
  readPrivacy(): Promise<PrivacyContext>;
  /** Signal 5 — settings store. */
  readPreference(): Promise<UserPreference>;
}

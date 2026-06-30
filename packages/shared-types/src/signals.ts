/**
 * The five signals the SageRouter evaluates before EVERY inference request.
 * Constitutional Constraint 2: these are read on-device and the router never
 * contacts the network during evaluation.
 */

/** Signal 1 — Network Quality (OS network monitor). */
export type NetworkQuality = 'offline' | 'poor' | 'fair' | 'good';

/** Signal 2 — Device Power State (OS battery API; also fed by the thermal guard). */
export type PowerState = 'critical' | 'low' | 'normal' | 'charging';

/** Signal 3 — Task Complexity (local lightweight classifier). */
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

/** Signal 4 — Privacy Context (app state + user preference). */
export type PrivacyContext = 'standard' | 'private' | 'sensitive';

/** Signal 5 — User Preference (settings store). */
export type UserPreference = 'auto' | 'prefer_local' | 'prefer_cloud';

/** The full signal vector evaluated per request. */
export interface SageSignals {
  network: NetworkQuality;
  power: PowerState;
  complexity: TaskComplexity;
  privacy: PrivacyContext;
  preference: UserPreference;
}

/** Allowed values per signal — used by readers/validators to guarantee a valid cold-start vector. */
export const SIGNAL_DOMAINS = {
  network: ['offline', 'poor', 'fair', 'good'] as const,
  power: ['critical', 'low', 'normal', 'charging'] as const,
  complexity: ['simple', 'moderate', 'complex'] as const,
  privacy: ['standard', 'private', 'sensitive'] as const,
  preference: ['auto', 'prefer_local', 'prefer_cloud'] as const,
} satisfies Record<keyof SageSignals, readonly string[]>;

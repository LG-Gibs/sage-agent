import * as Battery from 'expo-battery';
import type { PowerState } from '@sage/shared-types';
import { getThermalState } from '../native/sageCapability';

/**
 * Signal 2 — Device Power State. Combines the OS battery API with the thermal
 * guard: a critical thermal state immediately yields `critical`, which the
 * ArbiterRouter treats as a hard local override. This is exactly the spec's
 * "Thermal & Battery Guard ... feeds Signal 2" wiring — not a separate module.
 */
export async function readPower(): Promise<PowerState> {
  if (getThermalState() === 'critical') return 'critical';

  const state = await Battery.getBatteryStateAsync();
  if (
    state === Battery.BatteryState.CHARGING ||
    state === Battery.BatteryState.FULL
  ) {
    return 'charging';
  }

  const level = await Battery.getBatteryLevelAsync(); // 0..1, or -1 if unknown
  if (level >= 0 && level < 0.15) return 'critical';
  if (level >= 0 && level < 0.3) return 'low';
  return 'normal';
}

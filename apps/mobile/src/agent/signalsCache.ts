import { readSignalsSafe } from '@sage/core';
import type { SageSignals } from '@sage/shared-types';
import { createNativeSignalProvider } from '../signals/nativeSignalProvider';

/**
 * The ReActLoop reads signals synchronously before every cycle, but the native
 * probes (battery/network) are async. This cache holds the latest snapshot;
 * call refresh() before a run (and the loop reads current() each cycle).
 */
export class SignalsCache {
  private snapshot: SageSignals = {
    network: 'offline',
    power: 'normal',
    complexity: 'simple',
    privacy: 'standard',
    preference: 'auto',
  };
  private readonly provider = createNativeSignalProvider();

  current(): SageSignals {
    return this.snapshot;
  }

  async refresh(taskText: string): Promise<SageSignals> {
    const result = await readSignalsSafe(this.provider, { taskText });
    this.snapshot = result.signals;
    return this.snapshot;
  }
}

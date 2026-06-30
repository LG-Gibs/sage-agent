import { describe, it, expect } from 'vitest';
import { createSageRouter, runRoutingBenchmark, ROUTING_BENCHMARK } from '../src/index';

describe('SageRouter — 50-case expert benchmark (B→C gate: ≥85% agreement)', () => {
  it('contains exactly 50 cases', () => {
    expect(ROUTING_BENCHMARK).toHaveLength(50);
  });

  it('achieves ≥85% agreement with the expert routing labels', async () => {
    const result = await runRoutingBenchmark(createSageRouter());
    // Surface any disagreements for debugging if the gate fails.
    if (result.rate < 0.85) {
      // eslint-disable-next-line no-console
      console.error('Routing disagreements:', JSON.stringify(result.disagreements, null, 2));
    }
    expect(result.total).toBe(50);
    expect(result.rate).toBeGreaterThanOrEqual(0.85);
  });
});

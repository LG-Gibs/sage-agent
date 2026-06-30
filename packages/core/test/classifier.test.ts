import { describe, it, expect } from 'vitest';
import {
  classifyComplexity,
  extractFeatures,
  scoreComplexity,
} from '../src/index';

describe('complexity classifier (Signal 3 stub)', () => {
  it('classifies short conversational input as simple', () => {
    expect(classifyComplexity('what time is it?')).toBe('simple');
    expect(classifyComplexity('remind me to call mom')).toBe('simple');
  });

  it('classifies code tasks as at least moderate', () => {
    const c = classifyComplexity('write a function that parses this CSV string');
    expect(['moderate', 'complex']).toContain(c);
  });

  it('classifies multi-step research as complex', () => {
    const text =
      'Research the top 5 competitors, compare their pricing, and then synthesize a one-page brief citing sources.';
    expect(classifyComplexity(text)).toBe('complex');
  });

  it('is deterministic', () => {
    const t = 'analyze and compare these two approaches in detail';
    expect(classifyComplexity(t)).toBe(classifyComplexity(t));
  });

  it('extracts interpretable features', () => {
    const f = extractFeatures('```\nconst x = 1;\n``` and then explain why');
    expect(f.hasCode).toBe(true);
    expect(f.multiStep).toBe(true);
    expect(f.deepQuestion).toBe(true);
    expect(scoreComplexity(f)).toBeGreaterThanOrEqual(4);
  });
});

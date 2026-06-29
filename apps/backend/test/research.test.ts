import { describe, it, expect } from 'vitest';
import { synthesizeResearch, type ResearchSource } from '../src/research';

describe('synthesizeResearch', () => {
  it('builds a brief with key points and source list', () => {
    const sources: ResearchSource[] = [
      {
        title: 'On-device LLMs',
        url: 'https://example.com/a',
        content:
          'On-device inference keeps data private and works offline. It is increasingly viable on modern phones.',
      },
      {
        title: 'Quantization',
        url: 'https://example.com/b',
        content: 'Quantization shrinks model weights so they fit in mobile memory budgets without much quality loss.',
      },
    ];
    const brief = synthesizeResearch('on-device AI', sources);
    expect(brief.topic).toBe('on-device AI');
    expect(brief.sources).toHaveLength(2);
    expect(brief.sources[0]).toMatchObject({ title: 'On-device LLMs', url: 'https://example.com/a' });
    expect(brief.keyPoints.length).toBeGreaterThan(0);
    expect(brief.summary).toContain('on-device AI');
  });

  it('falls back to the url as title when none is given', () => {
    const brief = synthesizeResearch('x', [{ url: 'https://e.com/p', content: 'Some content here that is long enough.' }]);
    expect(brief.sources[0]?.title).toBe('https://e.com/p');
  });
});

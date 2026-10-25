import { describe, expect, it } from 'vitest';
import { createVisualRng, mixSeeds, visualRngFor } from '../seededVisualRandom';

describe('seededVisualRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = createVisualRng(42);
    const b = createVisualRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('diverges for different seeds', () => {
    const a = createVisualRng(1);
    const b = createVisualRng(2);
    expect(a()).not.toBe(b());
  });

  it('visualRngFor is stable per tile/layer', () => {
    const a = visualRngFor(99, 'tile-1', 'decor');
    const b = visualRngFor(99, 'tile-1', 'decor');
    expect(a()).toBe(b());
    const c = visualRngFor(99, 'tile-2', 'decor');
    expect(c()).not.toBe(visualRngFor(99, 'tile-1', 'decor')());
  });

  it('mixSeeds is order-sensitive', () => {
    expect(mixSeeds(1, 'a', 'b')).not.toBe(mixSeeds(1, 'b', 'a'));
  });
});

import { describe, expect, it } from 'vitest';
import { saveThumbnailSvg } from '../saveThumbnail';

describe('saveThumbnailSvg', () => {
  it('is deterministic for a given seed', () => {
    expect(saveThumbnailSvg(42)).toBe(saveThumbnailSvg(42));
  });

  it('varies with seed and returns svg markup', () => {
    const a = saveThumbnailSvg(1);
    const b = saveThumbnailSvg(2);
    expect(a).toContain('<svg');
    expect(a).not.toBe(b);
  });
});

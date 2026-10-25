import { describe, expect, it } from 'vitest';
import { isCinematicView } from '../viewMode';

describe('viewMode', () => {
  it('flags cinematic mode', () => {
    expect(isCinematicView('cinematic')).toBe(true);
    expect(isCinematicView('strategic')).toBe(false);
  });
});

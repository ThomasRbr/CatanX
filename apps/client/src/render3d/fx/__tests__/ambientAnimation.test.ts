import { describe, expect, it } from 'vitest';
import { animationSpeedToNumber } from '../AmbientAnimationContext';

describe('animationSpeedToNumber', () => {
  it('clamps and accepts numeric speeds', () => {
    expect(animationSpeedToNumber(1)).toBe(1);
    expect(animationSpeedToNumber(0.5)).toBe(0.5);
    expect(animationSpeedToNumber(2)).toBe(2);
    expect(animationSpeedToNumber(9)).toBe(2);
    expect(animationSpeedToNumber(-1)).toBe(0);
  });

  it('defaults undefined / invalid to 1', () => {
    expect(animationSpeedToNumber(undefined)).toBe(1);
    expect(animationSpeedToNumber(Number.NaN)).toBe(1);
  });
});

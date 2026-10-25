import { describe, expect, it } from 'vitest';
import { nextAdaptiveDpr } from '../AdaptiveDprController';

describe('adaptive realistic DPR', () => {
  it('reduces only one step after a slow sample', () => {
    expect(nextAdaptiveDpr(1.5, 30, 2)).toBe(1.375);
  });

  it('uses a neutral hysteresis band', () => {
    expect(nextAdaptiveDpr(1.25, 22, 2)).toBe(1.25);
  });

  it('never exceeds the profile maximum', () => {
    expect(nextAdaptiveDpr(1.25, 10, 1.25)).toBe(1.25);
  });

  it('respects an explicit minimum floor', () => {
    expect(nextAdaptiveDpr(1.125, 40, 2, 1)).toBe(1);
  });
});

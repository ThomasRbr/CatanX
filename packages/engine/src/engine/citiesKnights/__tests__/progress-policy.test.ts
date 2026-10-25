import { describe, expect, it } from 'vitest';
import { progressCardValue, chooseProgressDiscardCardId } from '../ai/progressPolicy';
import type { GameState } from '../../../types/game';
import type { CkProgressCardType } from '../../../types/citiesKnights';

describe('C&K progress policy', () => {
  it('values merchant above spy for discard ranking', () => {
    expect(progressCardValue('merchant')).toBeGreaterThan(progressCardValue('spy'));
    expect(progressCardValue('intrigue')).toBeGreaterThan(progressCardValue('trade_harbor'));
  });

  it('discards lowest-value progress card first', () => {
    const state = {
      extensions: {
        citiesKnights: {
          progressHands: {
            p1: [
              { id: 'a', type: 'merchant' as CkProgressCardType },
              { id: 'b', type: 'trade_harbor' as CkProgressCardType },
              { id: 'c', type: 'spy' as CkProgressCardType },
            ],
          },
        },
      },
    } as unknown as GameState;
    expect(chooseProgressDiscardCardId(state, 'p1')).toBe('b');
  });
});

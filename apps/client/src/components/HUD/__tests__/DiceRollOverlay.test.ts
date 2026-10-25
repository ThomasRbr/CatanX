import { describe, expect, it } from 'vitest';
import { getEventDiePresentation } from '../DiceRollOverlay';

describe('DiceRollOverlay event die', () => {
  it.each([
    ['barbarian_ship', 'ship', 'graphite', 'Navire barbare'],
    ['trade_gate', 'trade', 'jaune', 'Commerce'],
    ['politics_gate', 'politics', 'bleu', 'Politique'],
    ['science_gate', 'science', 'vert', 'Science'],
  ])('maps %s to its own collector color and symbol', (face, tone, colorName, label) => {
    expect(getEventDiePresentation(face)).toEqual({ tone, colorName, label });
  });
});

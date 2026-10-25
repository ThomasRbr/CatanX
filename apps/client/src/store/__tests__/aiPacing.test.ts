import { describe, expect, it } from 'vitest';
import { aiStepDelayMs, aiTurnHandoffDelayMs } from '../aiPacing';

describe('rythme des tours IA', () => {
  it('rend le rythme tabletop normal nettement lisible', () => {
    expect(aiStepDelayMs('tabletop', 'normal')).toBe(1700);
    expect(aiStepDelayMs('tabletop', 'normal')).toBeGreaterThan(aiStepDelayMs('dynamic', 'normal'));
  });

  it('garde chaque réglage ordonné et ajoute une pause entre les joueurs', () => {
    for (const pacing of ['dynamic', 'tabletop', 'epic'] as const) {
      expect(aiStepDelayMs(pacing, 'slow')).toBeGreaterThan(aiStepDelayMs(pacing, 'normal'));
      expect(aiStepDelayMs(pacing, 'normal')).toBeGreaterThan(aiStepDelayMs(pacing, 'fast'));
      expect(aiTurnHandoffDelayMs(pacing, 'normal')).toBeGreaterThan(
        aiStepDelayMs(pacing, 'normal'),
      );
    }
  });
});

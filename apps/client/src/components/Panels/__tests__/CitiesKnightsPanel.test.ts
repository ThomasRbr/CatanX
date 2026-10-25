import { describe, expect, it } from 'vitest';
import { urbanTrackGuidance } from '../CitiesKnightsPanel';

describe('urbanTrackGuidance', () => {
  it('explique pourquoi le niveau 1 est nécessaire', () => {
    const guidance = urbanTrackGuidance('trade', 0, false);

    expect(guidance.currentChance).toContain('inactive');
    expect(guidance.nextChance).toContain('1–2');
    expect(guidance.milestone).toContain('échanges de marchandises à 2:1');
  });

  it('annonce les bonus spécifiques et la prochaine probabilité', () => {
    const politics = urbanTrackGuidance('politics', 2, false);
    const science = urbanTrackGuidance('science', 3, false);

    expect(politics.milestone).toContain('chevaliers suprêmes');
    expect(politics.nextChance).toContain('1–4');
    expect(science.currentChance).toContain('1–4');
    expect(science.milestone).toContain('Métropole');
  });

  it('indique la maîtrise complète au niveau 5', () => {
    const guidance = urbanTrackGuidance('science', 5, true);

    expect(guidance.nextChance).toContain('6 faces sur 6');
    expect(guidance.milestone).toContain('Métropole contrôlée');
  });
});

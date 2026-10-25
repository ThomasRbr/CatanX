import type { AIPersonality } from '../../../types/player';

/** Multipliers applied to PositionEvaluator feature groups. */
export interface PersonalityBias {
  military: number;
  economy: number;
  expansion: number;
  science: number;
  diplomacy: number;
  balanced: number;
}

const DEFAULT: PersonalityBias = {
  military: 1,
  economy: 1,
  expansion: 1,
  science: 1,
  diplomacy: 1,
  balanced: 1,
};

const BY_PERSONALITY: Record<AIPersonality, PersonalityBias> = {
  aggressive: { ...DEFAULT, military: 1.35, expansion: 1.15 },
  economic: { ...DEFAULT, economy: 1.4, diplomacy: 1.15 },
  scientific: { ...DEFAULT, science: 1.45, economy: 1.1 },
  diplomatic: { ...DEFAULT, diplomacy: 1.4, economy: 1.1 },
  expansionist: { ...DEFAULT, expansion: 1.45, military: 1.1 },
  cultural: { ...DEFAULT, science: 1.2, diplomacy: 1.2, economy: 1.1 },
  balanced: { ...DEFAULT },
};

export function getPersonalityBias(personality?: AIPersonality | null): PersonalityBias {
  if (!personality) return DEFAULT;
  return BY_PERSONALITY[personality] ?? DEFAULT;
}

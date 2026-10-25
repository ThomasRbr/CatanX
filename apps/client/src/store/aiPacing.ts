import type { GamePacingPreset } from '@catanx/engine';
import type { AITurnSpeed } from './settingsTypes';

/**
 * Un battement correspond à une action visible de l'IA, pas à un tour entier.
 * Les valeurs laissent le temps de lire le lancer, le commerce et la construction
 * sans révéler l'intention suivante de l'IA.
 */
export const AI_STEP_DELAYS_MS: Record<GamePacingPreset, Record<AITurnSpeed, number>> = {
  dynamic: { slow: 1800, normal: 1100, fast: 650 },
  tabletop: { slow: 2500, normal: 1700, fast: 900 },
  epic: { slow: 3200, normal: 2200, fast: 1250 },
};

export function aiStepDelayMs(pacing: GamePacingPreset, speed: AITurnSpeed): number {
  return AI_STEP_DELAYS_MS[pacing][speed];
}

/** Pause supplémentaire quand la main passe au joueur suivant. */
export function aiTurnHandoffDelayMs(pacing: GamePacingPreset, speed: AITurnSpeed): number {
  return Math.round(aiStepDelayMs(pacing, speed) * 1.35);
}

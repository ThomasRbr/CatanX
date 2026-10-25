/**
 * Dé Événement + invasion (phase 6) + portes Progress (phase 7).
 */
import type { GameState, DiceRoll } from '../../types/game';
import type { CkEventDie } from '../../types/citiesKnights';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { ensureCitiesKnightsState } from './state';
import { randomInt } from '../../core/rng';
import { resolveCkInvasion } from './invasion';
import { ensureProgressDecks, resolveProgressGates } from './progress';
import {
  markFirstBarbarianShipResolved,
  resolveSeasonBarbarianShipModifier,
} from '../seasons/SeasonSystem';

const EVENT_DIE_FACES: CkEventDie[] = [
  'barbarian_ship',
  'barbarian_ship',
  'barbarian_ship',
  'trade_gate',
  'politics_gate',
  'science_gate',
];

export function rollCkEventDie(): CkEventDie {
  return EVENT_DIE_FACES[randomInt(0, EVENT_DIE_FACES.length - 1)]!;
}

/**
 * Résout l'avance barbare / invasion, ou la distribution Progress via portes.
 */
export function resolveCkEventDie(state: GameState, roll: DiceRoll): void {
  if (!isCitiesKnightsEnabled(state) || !roll.eventDie) return;
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  ensureProgressDecks(state);

  if (roll.eventDie === 'barbarian_ship') {
    const mod = resolveSeasonBarbarianShipModifier(state);
    if (mod.skip) {
      markFirstBarbarianShipResolved(state);
      // Navire ignoré : pas d'avance, pas de porte Progrès
      return;
    }
    const steps = 1 + mod.extraSteps;
    markFirstBarbarianShipResolved(state);
    ck.barbarianTrackPosition = Math.min(
      ck.barbarianTrackLength,
      ck.barbarianTrackPosition + steps,
    );
    if (ck.barbarianTrackPosition >= ck.barbarianTrackLength) {
      resolveCkInvasion(state);
    }
    return;
  }

  const redDie = roll.redDie ?? roll.die1;
  if (
    roll.eventDie === 'trade_gate' ||
    roll.eventDie === 'politics_gate' ||
    roll.eventDie === 'science_gate'
  ) {
    resolveProgressGates(state, roll.eventDie, redDie);
  }
}

export function attachCkDiceToRoll(state: GameState, roll: DiceRoll): DiceRoll {
  if (!isCitiesKnightsEnabled(state)) return roll;
  roll.redDie = roll.die1;
  roll.eventDie = rollCkEventDie();
  roll.specialDie =
    roll.eventDie === 'barbarian_ship'
      ? 'barbarian_advance'
      : roll.eventDie === 'trade_gate'
        ? 'yellow_city'
        : roll.eventDie === 'politics_gate'
          ? 'blue_city'
          : 'green_city';
  return roll;
}

/**
 * Préparations publiques saisonnières.
 */

import type { GameState } from '../../types/game';
import type { SeasonClassicResource, SeasonPreparation } from '../../types/seasons';
import { SEASON_PREPARATIONS, SEASON_ROUNDS_PER_SEASON } from '../../types/seasons';
import { isSeasonsEnabled } from '../../core/extensions';
import { getClimateDefinition } from './definitions';

const ADAPTATION_RESOURCES: readonly SeasonClassicResource[] = [
  'wood',
  'clay',
  'wheat',
  'sheep',
  'ore',
];

export function isValidPreparation(value: string): value is SeasonPreparation {
  return (SEASON_PREPARATIONS as readonly string[]).includes(value);
}

export function canChoosePreparation(state: GameState, playerId: string): boolean {
  if (!isSeasonsEnabled(state)) return false;
  const seasons = state.extensions?.seasons;
  if (!seasons) return false;
  if (!state.players.has(playerId)) return false;

  // Printemps : après placement initial
  if (seasons.springPrepPending && state.phase === 'playing') {
    return true;
  }
  // Ronde 5 / fenêtre ouverte
  if (seasons.preparationWindowOpen || seasons.roundInSeason === SEASON_ROUNDS_PER_SEASON) {
    return true;
  }
  return false;
}

/**
 * Choisit / modifie la préparation (courante si printemps pending, sinon next).
 */
export function chooseSeasonPreparation(
  state: GameState,
  playerId: string,
  preparation: SeasonPreparation,
  targetResource?: SeasonClassicResource,
): { ok: true } | { ok: false; error: string } {
  if (!isSeasonsEnabled(state)) {
    return { ok: false, error: 'Seasons extension disabled' };
  }
  if (!isValidPreparation(preparation)) {
    return { ok: false, error: 'Invalid preparation' };
  }
  if (!canChoosePreparation(state, playerId)) {
    return { ok: false, error: 'Preparation window closed' };
  }

  const seasons = state.extensions!.seasons!;
  if (targetResource && !ADAPTATION_RESOURCES.includes(targetResource)) {
    return { ok: false, error: 'Invalid adaptation resource' };
  }
  const climateId = seasons.springPrepPending
    ? seasons.currentClimateId
    : seasons.forecastClimateId;
  const resolvedTarget =
    preparation === 'harvest'
      ? (targetResource ?? getClimateDefinition(climateId).favoredResources[0])
      : null;

  if (seasons.springPrepPending) {
    seasons.preparations[playerId] = preparation;
    seasons.preparationTargets[playerId] = resolvedTarget;
    // Fermer spring pending quand tous ont choisi au moins une fois ?
    // Spec : modifiable jusqu’à transition ; pas de blocage global.
    // On laisse springPrepPending jusqu’à la première transition.
  } else {
    seasons.nextPreparations[playerId] = preparation;
    seasons.nextPreparationTargets[playerId] = resolvedTarget;
  }
  seasons.preparationReady[playerId] = true;

  return { ok: true };
}

export function clearSpringPrepPendingIfReady(state: GameState): void {
  const seasons = state.extensions?.seasons;
  if (!seasons?.springPrepPending) return;
  // Une fois en playing, le défaut Réserve est déjà en place ;
  // on garde springPrepPending true tant que roundInSeason===1 seasonYear===1
  // pour permettre de modifier. Fermé à la transition (clock).
}

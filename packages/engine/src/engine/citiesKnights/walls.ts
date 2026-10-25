/**
 * Murailles C&K : 2 argiles, max 3 / joueur, 1 / ville.
 */
import type { GameState } from '../../types/game';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import { ensureCitiesKnightsState } from './state';
import { playerWallCount } from './urban';
import {
  hasResources,
  subtractResources,
} from '../resources/ResourceSystem';
import { returnResourcesToBank } from '../catan/ClassicBoard';
import { refreshTrophiesAndVictory } from '../game/GameEngine';
import {
  applySeasonalBuildCost,
  markSeasonalBuildUsed,
} from '../seasons/costs';
import { shouldAutoUseSeasonPreparation } from '../seasons/events';

const WALL_COST = { clay: 2 };

function log(
  state: GameState,
  playerId: string,
  description: string,
  data: Record<string, unknown> = {},
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId,
    type: 'build',
    description,
    data,
    timestamp: now(),
  });
}

export function ckBuildWall(
  playerId: string,
  intersectionId: string,
  state: GameState,
  options?: { free?: boolean; useSeasonPreparation?: boolean },
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  if (state.phase !== 'playing' || state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Construction indisponible dans cette phase' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const ck = ensureCitiesKnightsState(state);
  const board = state.classicBoard;
  const player = state.players.get(playerId);
  if (!ck || !board || !player) {
    return { success: false, reason: 'État invalide' };
  }

  if (board.occupiedIntersections[intersectionId] !== playerId) {
    return { success: false, reason: 'La muraille doit être sur une de vos villes' };
  }
  const buildingId = board.buildingByIntersection[intersectionId];
  const building = buildingId ? state.buildings.get(buildingId) : undefined;
  if (!building || (building.definitionId !== 'city' && building.definitionId !== 'metropolis')) {
    return { success: false, reason: 'Une muraille se construit sur une ville' };
  }
  if (ck.walls[intersectionId]) {
    return { success: false, reason: 'Cette ville a déjà une muraille' };
  }
  if (playerWallCount(state, playerId) >= 3) {
    return { success: false, reason: 'Maximum 3 murailles par joueur' };
  }
  const free = Boolean(options?.free);
  const useWorks =
    Boolean(options?.useSeasonPreparation) ||
    shouldAutoUseSeasonPreparation(state, playerId, 'works');
  const cost = applySeasonalBuildCost(state, playerId, 'wall', WALL_COST, {
    useWorks,
  });
  if (!free && !hasResources(player.resources, cost)) {
    return { success: false, reason: 'Ressources insuffisantes pour la muraille' };
  }

  if (!free) {
    player.resources = subtractResources(player.resources, cost);
    returnResourcesToBank(state, cost);
    markSeasonalBuildUsed(state, playerId, 'wall', { useWorks });
  }
  ck.walls[intersectionId] = playerId;
  log(state, playerId, free ? 'Muraille construite (gratuite)' : 'Muraille construite', {
    intersectionId,
  });
  refreshTrophiesAndVictory(state);
  return { success: true };
}

/** Retire la muraille d'une intersection (ville rétrogradée). */
export function removeWallAt(state: GameState, intersectionId: string): void {
  const ck = state.extensions?.citiesKnights;
  if (!ck?.walls[intersectionId]) return;
  delete ck.walls[intersectionId];
}

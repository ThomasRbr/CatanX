import { GameState } from '../types/game';
import { recalculateVP } from '../engine/game/GameEngine';
import {
  chooseClassicSetupEdge,
  chooseClassicSetupIntersection,
  type ClassicSetupContext,
} from '../engine/ai/classic/ClassicSetupAI';
import {
  classicSetupPlaceRoad,
  classicSetupPlaceSettlement,
} from '../engine/catan/ClassicCommands';
import { ensureClassicRuntimeState } from '../engine/catan/ClassicBoard';

function toSetupContext(state: GameState): ClassicSetupContext | null {
  ensureClassicRuntimeState(state);
  const board = state.classicBoard;
  if (!board) return null;
  return {
    topology: board.topology,
    occupiedIntersections: board.occupiedIntersections,
    anchorUsageByTile: board.anchorUsageByTile,
    anchorIntersectionId: board.setupLastIntersectionId,
    roadsByEdge: board.roadsByEdge,
  };
}

/**
 * Réinitialise le curseur setup si besoin (simulations).
 * En classique, createGame a déjà vidé via finalizeClassicGameCreate.
 */
export function prepareClassicSetupState(state: GameState): void {
  ensureClassicRuntimeState(state);
  state.sevenFlow = null;
  state.phase = 'setup';
  state.turnPhase = 'player_action';
  state.setupPlacementIndex = 0;
  if (state.classicBoard) {
    state.classicBoard.setupStep = 'settlement';
    state.classicBoard.setupLastIntersectionId = null;
  }
}

/**
 * Termine le placement serpent topologique pour les simulations headless.
 */
export function autoCompleteClassicSetup(state: GameState): void {
  prepareClassicSetupState(state);

  let guard = 0;
  while (state.phase === 'setup' && guard < 80) {
    const playerId = state.setupPlayerOrder[state.setupPlacementIndex];
    if (!playerId) break;

    const ctx = toSetupContext(state);
    if (!ctx) break;

    if (state.classicBoard?.setupStep === 'settlement') {
      const intersectionId = chooseClassicSetupIntersection(state, ctx);
      if (!intersectionId) break;
      const result = classicSetupPlaceSettlement(playerId, intersectionId, state);
      if (!result.success) break;
    } else {
      const edgeId = chooseClassicSetupEdge(state, ctx);
      if (!edgeId) break;
      const result = classicSetupPlaceRoad(playerId, edgeId, state);
      if (!result.success) break;
    }
    guard += 1;
  }

  if (state.phase === 'setup') {
    state.phase = 'playing';
    state.turnPhase = 'start_of_turn';
    state.currentPlayerIndex = 0;
    if (state.classicBoard) {
      state.classicBoard.setupStep = 'settlement';
      state.classicBoard.setupLastIntersectionId = null;
    }
  }

  for (const [, player] of state.players) {
    recalculateVP(player, state);
  }
}

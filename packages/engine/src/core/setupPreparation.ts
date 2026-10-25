/**
 * Préparation commune du placement initial après `create_game`.
 * Utilisée par le client solo ET le serveur multijoueur : les deux doivent
 * démarrer exactement du même état (sinon le setup diverge en ligne).
 */
import type { GameState } from '../types/game';
import {
  applyClassicBoardPreset,
  ensureClassicRuntimeState,
  ensureLimitedBank,
  usesTopologicalPlacement,
} from '../engine/catan/ClassicBoard';
import { getCivilizationById } from '../engine/civilizations/Civilizations';

/** Retire les placements automatiques du moteur (villes/unités de départ). */
export function clearEngineAutoPlacements(state: GameState): void {
  state.units.clear();
  state.buildings.clear();
  state.activeEvents = [];
  state.pendingChoices = [];
  state.diceHistory = [];
  state.lastDiceRoll = null;
  state.winner = null;
  state.victoryType = undefined;
  state.rankings = [];

  for (const [, tile] of state.map) {
    tile.owner = null;
    tile.road = null;
    tile.buildings = [];
    tile.units = [];
    tile.visible.clear();
    tile.explored.clear();
  }

  for (const [, player] of state.players) {
    player.settlements = [];
    player.cities = [];
    player.metropolis = [];
    player.ownedTiles = [];
    player.roads = [];
    player.ports = [];
    player.units = [];
    player.army = [];
    player.stats.totalUnits = 0;
    player.stats.militaryStrength = 0;
    player.stats.tilesOwned = 0;
    player.stats.citiesOwned = 0;
    player.stats.settlementsOwned = 0;
    player.stats.victoryPoints = 0;
    player.stats.vpBreakdown = {
      settlements: 0,
      cities: 0,
      metropolis: 0,
      longestRoad: 0,
      largestArmy: 0,
      techCards: 0,
      wonders: 0,
      objectives: 0,
      culture: 0,
      faith: 0,
      defenderOfCatan: 0,
      undergroundSky: 0,
      pactsEmbassies: 0,
    };
  }
}

/** Personnalité IA cohérente avec la civilisation (solo comme serveur). */
export function applyAiPersonalities(state: GameState): void {
  for (const [, player] of state.players) {
    if (player.type === 'ai') {
      player.aiPersonality = getCivilizationById(player.civilization).aiPersonality;
      player.aiDifficulty = player.aiDifficulty ?? 'medium';
    } else {
      player.aiPersonality = undefined;
      player.aiDifficulty = undefined;
    }
  }
}

/**
 * Remet la partie en phase `setup` (placement serpent : 1→N puis N→1).
 * Topologique (classique / standard) : intersections + routes.
 * Sinon : placement par tuile.
 */
export function prepareInitialPlacement(state: GameState): void {
  clearEngineAutoPlacements(state);

  if (usesTopologicalPlacement(state)) {
    ensureClassicRuntimeState(state);
    ensureLimitedBank(state);
  } else {
    if (!state.classicBoard && state.mapRadius === 2) {
      applyClassicBoardPreset(state);
    }
    ensureLimitedBank(state);
  }

  state.sevenFlow = null;
  state.phase = 'setup';
  state.turnPhase = 'player_action';
  state.currentTurn = 1;
  state.setupPlacementIndex = 0;
  state.setupPlayerOrder = [...state.turnOrder, ...[...state.turnOrder].reverse()];
  if (state.classicBoard) {
    state.classicBoard.setupStep = 'settlement';
    state.classicBoard.setupLastIntersectionId = null;
  }

  const firstSetupId = state.setupPlayerOrder[0];
  for (const [id, player] of state.players) {
    player.isActive = id === firstSetupId;
  }
  const turnIdx = firstSetupId ? state.turnOrder.indexOf(firstSetupId) : 0;
  state.currentPlayerIndex = turnIdx >= 0 ? turnIdx : 0;
}

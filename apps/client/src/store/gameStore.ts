import { create } from 'zustand';
import { GameConfig, GameState } from '@catanx/engine';
import { TechId } from '@catanx/engine';
import { UnitInstance, UnitType } from '@catanx/engine';
import { BuildingId, BuildingInstance } from '@catanx/engine';
import { ResourceType } from '@catanx/engine';
import { PlayerType } from '@catanx/engine';
import {
  canBuild,
  recalculateVP,
  consumeFreeRoadIfAvailable,
  buildGameConfigFromPreset,
  checkVictory,
  syncRobberToTile,
  totalResources,
  decideClassicAI,
  chooseClassicRecoveryCommand,
  hasPlayerRolledDiceThisTurn,
  applyClassicBoardPreset,
  returnResourcesToBank,
  ensureClassicRuntimeState,
  ensureLimitedBank,
  classicLandProductionTiles,
  isClassicMode,
  usesLimitedBank,
  usesTopologicalPlacement,
  resolveClassicTileBuild,
  replayCommands,
  grantPortsAdjacentToTile,
  type AIDifficulty,
  type PlayerProfile,
} from '@catanx/engine';

import type { GamePreset } from '@catanx/engine';
import { TechTreeEngine } from '@catanx/engine';
import { applyEventEffects } from '@catanx/engine';
import { addResources, hasResources, subtractResources } from '@catanx/engine';
import { DiplomacyActionType, processDiplomacyAction } from '@catanx/engine';
import { UNIT_BASE_STATS, canMoveTo, resolveCombat, resolveRangedAttack } from '@catanx/engine';
import { hexAllNeighbors, hexDistance, hexToId } from '@catanx/engine';
import { getBuildCost, getRecruitCost } from '../data/gameplayCatalog';
import { frBuilding, frResource, frUnit } from '../i18n/fr';
import { getCivilizationById } from '@catanx/engine';
import { useSettingsStore } from './settingsStore';
import { ClientEngineSession } from '../lib/engineSession';
import { isRemoteSession } from '../network/remoteSession';
import { buildCatanTopology, CatanTopology } from '../catan/CatanTopology';
import { aiStepDelayMs, aiTurnHandoffDelayMs } from './aiPacing';
import {
  buildExportBundle,
  buildMetaFromState,
  deleteSaveById,
  findFreeManualSlot,
  getMostRecentSave,
  listLoadableSaves,
  loadSaveMetadata,
  localStorageAvailable,
  parseImportBundle,
  readSavePayload,
  renameSaveById,
  slotToId,
  writeSavePayload,
  type ExportSaveBundle,
  type GameSaveMeta,
  type ManualSaveSlot,
  type SaveSlotId,
} from './saveSlots';

export type { GameSaveMeta, ManualSaveSlot, SaveSlotId, ExportSaveBundle };
export { MANUAL_SAVE_SLOTS, getMostRecentSave, listLoadableSaves, slotToId } from './saveSlots';

interface InitializeOptions {
  preset?: GamePreset;
  config?: Partial<GameConfig>;
  playerNames?: string[];
  playerTypes?: Record<number, PlayerType>;
  civilizations?: Record<number, string>;
  aiDifficulties?: Record<number, AIDifficulty>;
  profiles?: Record<number, PlayerProfile>;
  hotseatMode?: boolean;
}

export interface InitialPlacementState {
  active: boolean;
  step: 'settlement' | 'road';
  sequence: number[];
  cursor: number;
  topology: CatanTopology;
  anchorIntersectionId: string | null;
  pendingIntersectionId: string | null;
  pendingEdgeId: string | null;
  settlementsPlacedByPlayer: Record<string, number>;
  occupiedIntersections: Record<string, string>;
  roadsByEdge: Record<string, string>;
  settlementAnchorByIntersection: Record<string, string>;
  anchorUsageByTile: Record<string, number>;
}

interface GameStoreState {
  gameState: GameState | null;
  currentPlayerId: string | null;
  lastActionError: string | null;
  saves: GameSaveMeta[];
  initialPlacement: InitialPlacementState | null;
  initializeGame: (options?: InitializeOptions) => void;
  placeInitialSettlement: (intersectionId: string) => { ok: boolean; reason?: string };
  placeInitialRoad: (edgeId: string) => { ok: boolean; reason?: string };
  placeSetupSettlement: (tileId: string) => { ok: boolean; reason?: string };
  previewInitialSettlement: (intersectionId: string) => void;
  previewInitialRoad: (edgeId: string) => void;
  confirmInitialPlacement: () => { ok: boolean; reason?: string };
  cancelInitialPlacementPreview: () => void;
  setGameState: (nextState: GameState, options?: { skipAI?: boolean }) => void;
  runDiceRoll: () => void;
  acknowledgeCollection: () => void;
  discardOnSeven: (
    resources: Partial<Record<ResourceType, number>>,
    playerId?: string,
    commodities?: Partial<Record<string, number>>,
    undergroundSkyMaterials?: Partial<Record<string, number>>,
  ) => { ok: boolean; reason?: string };
  moveRobber: (tileId: string) => { ok: boolean; reason?: string };
  stealFromPlayer: (targetPlayerId: string | null) => { ok: boolean; reason?: string };
  bankTrade: (
    give: Partial<Record<ResourceType, number>>,
    receive: Partial<Record<ResourceType, number>>,
    options?: {
      giveCommodities?: Partial<Record<string, number>>;
      receiveCommodities?: Partial<Record<string, number>>;
      giveMaterials?: Partial<Record<string, number>>;
      receiveMaterials?: Partial<Record<string, number>>;
      /** Si true, n’affiche pas l’erreur HUD (échecs IA silencieux). */
      silent?: boolean;
    },
  ) => { ok: boolean; reason?: string };
  chooseSeasonPreparation: (
    preparation: 'harvest' | 'commerce' | 'reserve' | 'works' | 'shelter',
    targetResource?: 'wood' | 'clay' | 'wheat' | 'sheep' | 'ore',
  ) => {
    ok: boolean;
    reason?: string;
  };
  usChooseThermalOutput: (
    outpostId: string,
    resource: 'wheat' | 'sheep',
  ) => { ok: boolean; reason?: string };
  usChooseDiscoveryReward: (
    nodeId: string,
    choice: string,
  ) => { ok: boolean; reason?: string };
  usSurveyCavern: (nodeId: string) => { ok: boolean; reason?: string };
  usBuildShaft: (
    intersectionId: string,
    entryNodeId: string,
  ) => { ok: boolean; reason?: string };
  usBuildTunnel: (
    edgeId: string,
    options?: { useSeasonPreparation?: boolean },
  ) => { ok: boolean; reason?: string };
  usBuildOutpost: (nodeId: string) => { ok: boolean; reason?: string };
  usUpgradeExtractor: (outpostId: string) => { ok: boolean; reason?: string };
  usBuildLift: (nodeId: string) => { ok: boolean; reason?: string };
  usBuildAirport: (intersectionId: string) => { ok: boolean; reason?: string };
  usBuildAirship: (airportId: string) => { ok: boolean; reason?: string };
  usUpgradeAirship: (
    airshipId: string,
    upgrade: 'ether_sails' | 'reinforced_hold',
  ) => { ok: boolean; reason?: string };
  usBuildBeacon: (hubId: string) => { ok: boolean; reason?: string };
  usDispatchAirship: (
    airshipId: string,
    destinationHubId: string,
    cargo: Array<
      | { kind: 'resource'; key: string; amount: number }
      | { kind: 'commodity'; key: string; amount: number }
      | { kind: 'material'; key: 'us_crystal' | 'us_aether'; amount: number }
    >,
  ) => { ok: boolean; reason?: string };
  usUnloadAirship: (airshipId: string) => { ok: boolean; reason?: string };
  usCompleteContract: (
    contractId: string,
    options?: { airshipId?: string; rewardClassic?: string },
  ) => { ok: boolean; reason?: string };
  peBuildEmbassy: (intersectionId: string) => { ok: boolean; reason?: string };
  peProposePact: (
    toPlayerId: string,
    clauses: Array<
      | 'trade_accord'
      | 'port_charter'
      | 'open_borders'
      | 'underground_passage'
      | 'trade_winds'
      | 'shared_reserve'
    >,
  ) => { ok: boolean; reason?: string };
  peCounterPact: (
    offerId: string,
    clauses: Array<
      | 'trade_accord'
      | 'port_charter'
      | 'open_borders'
      | 'underground_passage'
      | 'trade_winds'
      | 'shared_reserve'
    >,
  ) => { ok: boolean; reason?: string };
  peAcceptPact: (offerId: string) => { ok: boolean; reason?: string };
  peRejectPact: (offerId: string) => { ok: boolean; reason?: string };
  peBreakPact: (pactId: string) => { ok: boolean; reason?: string };
  peProposeMutualDissolution: (pactId: string) => { ok: boolean; reason?: string };
  peAcceptMutualDissolution: (pactId: string) => { ok: boolean; reason?: string };
  peSponsorResolution: (proposalId: string) => { ok: boolean; reason?: string };
  peCastCouncilVote: (
    proposalId: string,
    variantId: string,
    extraVotes?: number,
  ) => { ok: boolean; reason?: string };
  peLobbyNeutralDelegation: (
    delegationId: string,
    amount: number,
  ) => { ok: boolean; reason?: string };
  peContributeToCrisis: (
    classic?: Record<string, number>,
    commodities?: Record<string, number>,
    materials?: Record<string, number>,
  ) => { ok: boolean; reason?: string };
  peClaimMandate: (mandateId: string) => { ok: boolean; reason?: string };
  ckImproveUrban: (track: 'trade' | 'politics' | 'science') => { ok: boolean; reason?: string };
  ckChooseAqueduct: (resource: ResourceType, playerId?: string) => { ok: boolean; reason?: string };
  ckPlaceMetropolis: (
    track: 'trade' | 'politics' | 'science',
    intersectionId: string,
    playerId?: string,
  ) => { ok: boolean; reason?: string };
  ckBuildWall: (intersectionId: string) => { ok: boolean; reason?: string };
  ckChoosePillageCity: (
    intersectionId: string,
    playerId?: string,
  ) => { ok: boolean; reason?: string };
  ckChooseProgressDeck: (
    deck: 'trade' | 'politics' | 'science',
    playerId?: string,
  ) => { ok: boolean; reason?: string };
  ckDiscardProgress: (cardId: string, playerId?: string) => { ok: boolean; reason?: string };
  ckPlayProgress: (
    cardId: string,
    params?: Record<string, unknown>,
  ) => { ok: boolean; reason?: string };
  ckRecruitKnight: (intersectionId: string) => { ok: boolean; reason?: string };
  ckActivateKnight: (knightId: string) => { ok: boolean; reason?: string };
  ckPromoteKnight: (knightId: string) => { ok: boolean; reason?: string };
  ckMoveKnight: (knightId: string, toIntersectionId: string) => { ok: boolean; reason?: string };
  ckDisplaceKnight: (knightId: string, targetKnightId: string) => { ok: boolean; reason?: string };
  ckChaseRobber: (knightId: string, tileId: string) => { ok: boolean; reason?: string };
  ckResolveKnightRetreat: (
    knightId: string,
    toIntersectionId: string | null,
    playerId?: string,
  ) => { ok: boolean; reason?: string };
  proposePlayerTrade: (
    toPlayerId: string | null,
    give: Partial<Record<ResourceType, number>>,
    receive: Partial<Record<ResourceType, number>>,
  ) => { ok: boolean; reason?: string };
  acceptPlayerTrade: (tradeId: string, asPlayerId?: string) => { ok: boolean; reason?: string };
  rejectPlayerTrade: (tradeId: string, asPlayerId?: string) => { ok: boolean; reason?: string };
  cancelPlayerTrade: (tradeId?: string) => { ok: boolean; reason?: string };
  drawDevCard: () => { ok: boolean; reason?: string };
  playDevCard: (
    cardId: string,
    targetPlayerId?: string | null,
    targetTileId?: string | null,
  ) => { ok: boolean; reason?: string };
  endTurn: () => void;
  constructBuilding: (tileId: string, buildingId: BuildingId) => { ok: boolean; reason?: string };
  buildSettlement: (intersectionId: string) => { ok: boolean; reason?: string };
  buildRoad: (edgeId: string) => { ok: boolean; reason?: string };
  upgradeCity: (intersectionId: string) => { ok: boolean; reason?: string };
  recruitUnit: (tileId: string, unitType: UnitType) => { ok: boolean; reason?: string };
  moveUnit: (unitId: string, targetTileId: string) => { ok: boolean; reason?: string };
  attackUnit: (attackerId: string, defenderId: string) => { ok: boolean; reason?: string };
  fortifyUnit: (unitId: string) => { ok: boolean; reason?: string };
  buyMarketResource: (resource: ResourceType, quantity: number) => { ok: boolean; reason?: string };
  sellMarketResource: (
    resource: ResourceType,
    quantity: number,
  ) => { ok: boolean; reason?: string };
  startResearch: (techId: TechId) => { ok: boolean; reason?: string };
  applyEventChoice: (choiceId: string) => { ok: boolean; reason?: string };
  dismissPendingEvent: () => void;
  runDiplomacyAction: (
    toPlayerId: string,
    actionType: DiplomacyActionType,
    data?: unknown,
  ) => { ok: boolean; reason?: string };
  castCouncilVote: (optionId: string) => { ok: boolean; reason?: string };
  craftRecipe: (buildingId: string, recipeId: string) => { ok: boolean; reason?: string };
  saveCurrentGame: (name?: string) => { ok: boolean; reason?: string };
  saveToSlot: (slot: SaveSlotId, name?: string) => { ok: boolean; reason?: string };
  autoSave: () => { ok: boolean; reason?: string };
  loadGame: (id: string) => { ok: boolean; reason?: string };
  loadMostRecentSave: () => { ok: boolean; reason?: string };
  renameSave: (id: string, name: string) => { ok: boolean; reason?: string };
  exportSave: (id: string) => ExportSaveBundle | null;
  importSave: (
    raw: string,
    slot?: ManualSaveSlot,
  ) => { ok: boolean; reason?: string; id?: string };
  getCommandLog: () => import('@catanx/protocol').GameCommand[];
  replayFromCommandLog: () => { ok: boolean; reason?: string };
  deleteSave: (id: string) => void;
  refreshSaves: () => void;
  clearError: () => void;
  reportActionError: (message: string) => void;
  forceSync: () => void;
}

const defaultConfig: GameConfig = buildGameConfigFromPreset('catanx', { mapSeed: 1337 });

let engineSession: ClientEngineSession | null = null;

const defaultNames = ['Aster', 'Boreal', 'Cirrus', 'Dune'];

function resolveCurrentPlayer(state: GameState): string | null {
  return state.turnOrder[state.currentPlayerIndex] ?? null;
}

function serializeGameState(state: GameState): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Map) {
      return { __type: 'Map', value: Array.from(value.entries()) };
    }
    if (value instanceof Set) {
      return { __type: 'Set', value: Array.from(value.values()) };
    }
    return value;
  });
}

function deserializeGameState(raw: string): GameState {
  return JSON.parse(raw, (_key, value) => {
    if (!value || typeof value !== 'object') return value;
    if (value.__type === 'Map') {
      return new Map(value.value);
    }
    if (value.__type === 'Set') {
      return new Set(value.value);
    }
    return value;
  }) as GameState;
}

function markActivePlayer(state: GameState): void {
  const activeId = resolveCurrentPlayer(state);
  for (const [id, player] of state.players) {
    player.isActive = id === activeId;
  }
}

function ensurePendingEventChoices(state: GameState): void {
  const currentPlayer = resolveCurrentPlayer(state);
  if (!currentPlayer) return;

  for (const event of state.activeEvents) {
    if (!event.choices?.length) continue;
    const existing = state.pendingChoices.find(
      (pending) => pending.eventId === event.id && pending.playerId === currentPlayer,
    );
    if (existing) continue;

    state.pendingChoices.push({
      id: `pending_${event.id}_${currentPlayer}`,
      eventId: event.id,
      playerId: currentPlayer,
      choices: event.choices,
      deadline: state.currentTurn + 2,
    });
  }
}

function nextEntityId(prefix: string): string {
  return `${prefix}_${Math.floor(Math.random() * 1_000_000_000)}`;
}

function createUnit(
  type: UnitType,
  ownerId: string,
  tileId: string,
  state: GameState,
): UnitInstance {
  const tile = state.map.get(tileId)!;
  const stats = UNIT_BASE_STATS[type];
  return {
    id: nextEntityId('unit'),
    type,
    ownerId,
    position: { ...tile.coord },
    stats: { ...stats },
    name: `${type}_${ownerId.slice(-2)}`,
    experience: 0,
    level: 1,
    promotions: [],
    status: 'idle',
    hasMoved: false,
    hasAttacked: false,
    facing: 0,
    isEmbark: false,
  };
}

function createBuilding(
  definitionId: BuildingId,
  ownerId: string,
  tileId: string,
  turn: number,
  placement?: {
    placementKind?: BuildingInstance['placementKind'];
    placementIntersectionId?: string;
    productionTileIds?: string[];
  },
): BuildingInstance {
  return {
    id: nextEntityId('building'),
    definitionId,
    tileId,
    ownerId,
    placementKind: placement?.placementKind,
    placementIntersectionId: placement?.placementIntersectionId,
    productionTileIds: placement?.productionTileIds,
    constructedTurn: turn,
    level: 1,
    health: 100,
    workers: [],
    isActive: true,
    productionProgress: 0,
  };
}

function registerPortsForIntersection(
  state: GameState,
  playerId: string,
  intersectionId: string,
  fallbackTileIds?: string[],
): void {
  const player = state.players.get(playerId);
  if (!player) return;

  const portType = state.classicBoard?.portByIntersection?.[intersectionId];
  if (portType) {
    if (!player.ports.includes(portType)) player.ports.push(portType);
    return;
  }

  for (const tileId of fallbackTileIds ?? []) {
    const tile = state.map.get(tileId);
    if (tile?.port && !player.ports.includes(tile.port)) {
      player.ports.push(tile.port);
    }
  }
}

function seedFrontendEntities(state: GameState): void {
  // Pas d'unités de départ : les villages viennent du setup / du moteur.
  if (state.buildings.size > 0 || state.units.size > 0) return;

  for (const [playerId, player] of state.players) {
    const homeTileId = player.settlements[0] ?? player.ownedTiles[0];
    if (!homeTileId) continue;

    const homeTile = state.map.get(homeTileId);
    if (!homeTile) continue;

    const town = createBuilding('settlement', playerId, homeTileId, state.currentTurn, {
      placementKind: 'tile',
      productionTileIds: classicLandProductionTiles(state, [homeTileId]),
    });
    state.buildings.set(town.id, town);
    homeTile.buildings.push(town.id);
  }
}

function syncHexSetupActivePlayer(state: GameState): void {
  if (state.phase !== 'setup') return;
  const nextSetupId = state.setupPlayerOrder[state.setupPlacementIndex];
  for (const [, player] of state.players) player.isActive = false;
  if (!nextSetupId) return;
  const nextPlayer = state.players.get(nextSetupId);
  if (nextPlayer) nextPlayer.isActive = true;
  const turnIdx = state.turnOrder.indexOf(nextSetupId);
  if (turnIdx >= 0) state.currentPlayerIndex = turnIdx;
}

function syncAfterMutation(state: GameState): GameState {
  markActivePlayer(state);
  ensurePendingEventChoices(state);
  state.updatedAt = Date.now();
  return state;
}

function setError(
  setter: (partial: Partial<GameStoreState>) => void,
  message: string | null,
): void {
  setter({ lastActionError: message });
}

function getCurrentPlayerForAction(
  state: GameState,
  currentPlayerId: string | null,
  options?: { requirePlayerAction?: boolean },
): { playerId: string; reason?: string } {
  if (!currentPlayerId) return { playerId: '', reason: 'Aucune partie active' };
  if (state.phase === 'setup')
    return { playerId: '', reason: "Terminez d'abord le placement initial" };
  const activePlayerId = state.turnOrder[state.currentPlayerIndex];
  if (activePlayerId !== currentPlayerId)
    return { playerId: '', reason: "Ce n'est pas votre tour" };
  if (options?.requirePlayerAction && state.turnPhase !== 'player_action') {
    return { playerId: '', reason: 'Terminez la phase en cours avant cette action' };
  }
  return { playerId: currentPlayerId };
}

function canRollDice(state: GameState, playerId: string | null): { ok: boolean; reason?: string } {
  if (state.phase === 'setup') {
    return { ok: false, reason: "Terminez d'abord le placement initial" };
  }
  if (!playerId) {
    return { ok: false, reason: 'Joueur introuvable' };
  }
  if (hasPlayerRolledDiceThisTurn(state, playerId)) {
    return { ok: false, reason: 'Les dés ont déjà été lancés ce tour' };
  }
  return { ok: true };
}

function canEndTurn(state: GameState): { ok: boolean; reason?: string } {
  if (state.phase === 'setup') {
    return { ok: false, reason: "Terminez d'abord le placement initial" };
  }
  if (state.turnPhase !== 'player_action') {
    return { ok: false, reason: 'Terminez la phase en cours avant de finir le tour' };
  }
  return { ok: true };
}

function pushActionLog(
  state: GameState,
  playerId: string,
  description: string,
  data: Record<string, unknown>,
): void {
  state.actionLog.push({
    id: nextEntityId('action'),
    turn: state.currentTurn,
    playerId,
    type: 'system',
    description,
    data,
    timestamp: Date.now(),
  });
}

function removeUnitFromState(state: GameState, unitId: string): void {
  const unit = state.units.get(unitId);
  if (!unit) return;

  const owner = state.players.get(unit.ownerId);
  if (owner) {
    owner.units = owner.units.filter((id) => id !== unitId);
  }

  const tileId = hexToId(unit.position);
  const tile = state.map.get(tileId);
  if (tile) {
    tile.units = tile.units.filter((id) => id !== unitId);
  }

  state.units.delete(unitId);
}

function refreshMilitaryStats(state: GameState, playerId: string): void {
  const player = state.players.get(playerId);
  if (!player) return;
  player.stats.totalUnits = player.units.length;
  player.stats.militaryStrength = player.units.reduce((sum, unitId) => {
    const unit = state.units.get(unitId);
    if (!unit) return sum;
    return sum + unit.stats.attack + unit.stats.defense + Math.floor(unit.stats.currentHealth / 12);
  }, 0);
}

function setTileOwnership(state: GameState, tileId: string, playerId: string): void {
  const tile = state.map.get(tileId);
  const player = state.players.get(playerId);
  if (!tile || !player) return;
  tile.owner = playerId;
  if (!player.ownedTiles.includes(tileId)) {
    player.ownedTiles.push(tileId);
  }
}

function removeBuildingFromTileByDefinition(
  state: GameState,
  tileId: string,
  ownerId: string,
  definitionId: BuildingId,
): BuildingInstance | null {
  const tile = state.map.get(tileId);
  if (!tile) return null;
  const existingId = tile.buildings.find((buildingId) => {
    const candidate = state.buildings.get(buildingId);
    return candidate?.ownerId === ownerId && candidate.definitionId === definitionId;
  });
  if (!existingId) return null;
  const removed = state.buildings.get(existingId) ?? null;
  tile.buildings = tile.buildings.filter((id) => id !== existingId);
  state.buildings.delete(existingId);
  return removed;
}

function syncUrbanProgression(
  state: GameState,
  playerId: string,
  tileId: string,
  buildingId: BuildingId,
): void {
  const player = state.players.get(playerId);
  if (!player) return;

  if (buildingId === 'settlement') {
    if (!player.settlements.includes(tileId)) player.settlements.push(tileId);
    player.cities = player.cities.filter((id) => id !== tileId);
    player.metropolis = player.metropolis.filter((id) => id !== tileId);
    return;
  }

  if (buildingId === 'city') {
    player.settlements = player.settlements.filter((id) => id !== tileId);
    if (!player.cities.includes(tileId)) player.cities.push(tileId);
    player.metropolis = player.metropolis.filter((id) => id !== tileId);
    return;
  }

  if (buildingId === 'metropolis') {
    player.settlements = player.settlements.filter((id) => id !== tileId);
    player.cities = player.cities.filter((id) => id !== tileId);
    if (!player.metropolis.includes(tileId)) player.metropolis.push(tileId);
  }
}

function syncInitialPlacementFromState(
  prev: InitialPlacementState,
  state: GameState,
): InitialPlacementState | null {
  if (state.phase !== 'setup') return null;
  const board = state.classicBoard;
  const settlementsPlacedByPlayer = { ...prev.settlementsPlacedByPlayer };
  if (board) {
    for (const playerId of state.turnOrder) {
      settlementsPlacedByPlayer[playerId] = Object.values(board.occupiedIntersections).filter(
        (owner) => owner === playerId,
      ).length;
    }
  }

  return {
    ...prev,
    active: true,
    step: board?.setupStep ?? 'settlement',
    cursor: state.setupPlacementIndex,
    topology: board?.topology ?? prev.topology,
    anchorIntersectionId: board?.setupLastIntersectionId ?? null,
    pendingIntersectionId: null,
    pendingEdgeId: null,
    settlementsPlacedByPlayer,
    occupiedIntersections: { ...(board?.occupiedIntersections ?? {}) },
    roadsByEdge: { ...(board?.roadsByEdge ?? {}) },
    anchorUsageByTile: { ...(board?.anchorUsageByTile ?? {}) },
  };
}

/** Restaure l'UI setup topologique depuis l'état moteur (load / sync réseau). */
function rebuildInitialPlacementFromState(state: GameState): InitialPlacementState | null {
  if (!usesTopologicalPlacement(state) || state.phase !== 'setup') return null;
  ensureClassicRuntimeState(state);
  const board = state.classicBoard;
  const playerCount = state.turnOrder.length;
  const forward = Array.from({ length: playerCount }, (_value, index) => index);
  const backward = Array.from({ length: playerCount }, (_value, index) => playerCount - 1 - index);
  const sequence = [...forward, ...backward];

  const settlementsPlacedByPlayer = state.turnOrder.reduce<Record<string, number>>(
    (acc, playerId) => {
      acc[playerId] = board
        ? Object.values(board.occupiedIntersections).filter((owner) => owner === playerId).length
        : 0;
      return acc;
    },
    {},
  );

  return {
    active: true,
    step: board?.setupStep ?? 'settlement',
    sequence,
    cursor: state.setupPlacementIndex,
    topology: board?.topology ?? buildCatanTopology(state.map),
    anchorIntersectionId: board?.setupLastIntersectionId ?? null,
    pendingIntersectionId: null,
    pendingEdgeId: null,
    settlementsPlacedByPlayer,
    occupiedIntersections: { ...(board?.occupiedIntersections ?? {}) },
    roadsByEdge: { ...(board?.roadsByEdge ?? {}) },
    settlementAnchorByIntersection: {},
    anchorUsageByTile: { ...(board?.anchorUsageByTile ?? {}) },
  };
}

function resolveInitialPlacementForState(
  state: GameState,
  prev: InitialPlacementState | null,
): InitialPlacementState | null {
  if (!usesTopologicalPlacement(state) || state.phase !== 'setup') return null;
  if (prev?.active) return syncInitialPlacementFromState(prev, state);
  return rebuildInitialPlacementFromState(state);
}

function createInitialPlacementState(state: GameState): InitialPlacementState {
  const playerCount = state.turnOrder.length;
  const forward = Array.from({ length: playerCount }, (_value, index) => index);
  const backward = Array.from({ length: playerCount }, (_value, index) => playerCount - 1 - index);
  const sequence = [...forward, ...backward];

  const settlementsPlacedByPlayer = state.turnOrder.reduce<Record<string, number>>(
    (acc, playerId) => {
      acc[playerId] = 0;
      return acc;
    },
    {},
  );

  const firstPlayerIndex = sequence[0] ?? 0;
  state.phase = 'setup';
  state.turnPhase = 'player_action';
  state.currentTurn = 1;
  state.currentPlayerIndex = firstPlayerIndex;
  state.setupPlacementIndex = 0;
  state.setupPlayerOrder = [...state.turnOrder, ...[...state.turnOrder].reverse()];
  if (state.classicBoard) {
    state.classicBoard.setupStep = 'settlement';
    state.classicBoard.setupLastIntersectionId = null;
  }

  const board = state.classicBoard;
  return {
    active: true,
    step: 'settlement',
    sequence,
    cursor: 0,
    topology: board?.topology ?? buildCatanTopology(state.map),
    anchorIntersectionId: null,
    pendingIntersectionId: null,
    pendingEdgeId: null,
    settlementsPlacedByPlayer,
    occupiedIntersections: { ...(board?.occupiedIntersections ?? {}) },
    roadsByEdge: { ...(board?.roadsByEdge ?? {}) },
    settlementAnchorByIntersection: {},
    anchorUsageByTile: { ...(board?.anchorUsageByTile ?? {}) },
  };
}

function clearEngineAutoPlacements(state: GameState): void {
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

function revealAroundSettlement(state: GameState, playerId: string, tileId: string): void {
  const centerTile = state.map.get(tileId);
  if (!centerTile) return;

  for (const [, tile] of state.map) {
    if (hexDistance(centerTile.coord, tile.coord) > 2) continue;
    tile.explored.add(playerId);
    tile.visible.add(playerId);
  }
}

function getAIStepDelayMs(): number {
  const speed = useSettingsStore.getState().aiTurnSpeed;
  const pacing = useGameStore.getState().gameState?.config.pacingPreset ?? 'dynamic';
  return aiStepDelayMs(pacing, speed);
}

function getAITurnHandoffDelayMs(): number {
  const speed = useSettingsStore.getState().aiTurnSpeed;
  const pacing = useGameStore.getState().gameState?.config.pacingPreset ?? 'dynamic';
  return aiTurnHandoffDelayMs(pacing, speed);
}

export const useGameStore = create<GameStoreState>((set, get) => {
  let aiLoopScheduled = false;

  const runAutoAIStep = (): void => {
    const snapshot = get();
    const state = snapshot.gameState;
    if (!state || state.phase === 'finished') return;

    // Réponse IA à une offre domestique (même hors tour actif)
    const pending = state.pendingPlayerTrade;
    if (pending && engineSession) {
      const rejected = new Set(pending.rejectedBy ?? []);
      const responders =
        pending.toPlayerId === null
          ? state.turnOrder.filter((id) => {
              if (id === pending.fromPlayerId || rejected.has(id)) return false;
              const p = state.players.get(id);
              return Boolean(p && !p.isEliminated);
            })
          : [pending.toPlayerId];

      const nextAiId = responders.find((id) => state.players.get(id)?.type === 'ai');
      if (nextAiId) {
        const target = state.players.get(nextAiId)!;
        const decision = decideClassicAI(state, nextAiId, {
          difficulty: target.aiDifficulty ?? 'medium',
        });
        if (decision?.kind === 'command') {
          const result = engineSession.dispatch(state, decision.command);
          if (result.ok) {
            const synced = syncAfterMutation(result.state);
            set({
              gameState: { ...synced },
              currentPlayerId: resolveCurrentPlayer(synced),
              lastActionError: null,
            });
          }
        }
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
      // Offre en attente d'un humain : ne pas laisser l'IA proposante finir le tour
      if (responders.length > 0) {
        const activeId = resolveCurrentPlayer(state);
        const active = activeId ? state.players.get(activeId) : null;
        if (active?.type === 'ai') return;
      }
    }

    if (state.turnPhase === 'discard_resources' && state.sevenFlow) {
      const nextToDiscard = state.sevenFlow.playersToDiscard.find(
        (playerId) => !state.sevenFlow!.playersDiscarded.includes(playerId),
      );
      if (nextToDiscard) {
        const discardPlayer = state.players.get(nextToDiscard);
        if (!discardPlayer || discardPlayer.type !== 'ai') return;

        const discardDecision = decideClassicAI(state, nextToDiscard, {
          difficulty: discardPlayer.aiDifficulty ?? 'medium',
        });
        if (!engineSession) return;
        const command =
          discardDecision?.kind === 'command'
            ? discardDecision.command
            : chooseClassicRecoveryCommand(state, nextToDiscard, {
                difficulty: discardPlayer.aiDifficulty ?? 'medium',
              });
        if (!command) {
          scheduleAutoAITurns(getAIStepDelayMs());
          return;
        }
        const result = engineSession.dispatch(state, command);
        if (!result.ok) {
          const fallback = chooseClassicRecoveryCommand(state, nextToDiscard, {
            difficulty: discardPlayer.aiDifficulty ?? 'medium',
          });
          if (fallback && fallback.type !== command.type) {
            const retry = engineSession.dispatch(state, fallback);
            if (retry.ok) {
              const synced = syncAfterMutation(retry.state);
              set({
                gameState: { ...synced },
                currentPlayerId: resolveCurrentPlayer(synced),
                lastActionError: null,
              });
              scheduleAutoAITurns(getAIStepDelayMs());
              return;
            }
          }
          scheduleAutoAITurns(getAIStepDelayMs());
          return;
        }
        const synced = syncAfterMutation(result.state);
        set({
          gameState: { ...synced },
          currentPlayerId: resolveCurrentPlayer(synced),
          lastActionError: null,
        });
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
    }

    // Pendings C&K hors tour (Aqueduc, retraite…)
    const ckPendingPlayerId = state.extensions?.citiesKnights?.pendingResolutions.find((r) => {
      const p = state.players.get(r.playerId);
      return (
        p?.type === 'ai' &&
        (r.kind === 'aqueduct' ||
          r.kind === 'knight_retreat' ||
          r.kind === 'place_metropolis' ||
          r.kind === 'pillage_city' ||
          r.kind === 'choose_progress_deck' ||
          r.kind === 'discard_progress')
      );
    })?.playerId;
    if (ckPendingPlayerId && engineSession) {
      const ckPlayer = state.players.get(ckPendingPlayerId);
      if (ckPlayer?.type === 'ai') {
        const decision = decideClassicAI(state, ckPendingPlayerId, {
          difficulty: ckPlayer.aiDifficulty ?? 'medium',
        });
        const command =
          decision?.kind === 'command'
            ? decision.command
            : chooseClassicRecoveryCommand(state, ckPendingPlayerId, {
                difficulty: ckPlayer.aiDifficulty ?? 'medium',
              });
        if (command) {
          const result = engineSession.dispatch(state, command);
          if (result.ok) {
            const synced = syncAfterMutation(result.state);
            set({
              gameState: { ...synced },
              currentPlayerId: resolveCurrentPlayer(synced),
              lastActionError: null,
            });
            scheduleAutoAITurns(getAIStepDelayMs());
            return;
          }
        }
        // Retry bientôt plutôt que de laisser la partie figée sur un pending IA
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
    }

    const activePlayerId = resolveCurrentPlayer(state);
    if (!activePlayerId) return;
    const activePlayer = state.players.get(activePlayerId);
    if (!activePlayer || activePlayer.type !== 'ai') return;

    const isClassic = isClassicMode(state);
    const useClassicPlanner =
      isClassic ||
      usesLimitedBank(state) ||
      state.phase === 'setup' ||
      Boolean(snapshot.initialPlacement?.active) ||
      state.turnPhase !== 'player_action';

    if (!useClassicPlanner) {
      if (!activePlayer.currentResearch) {
        const availableTechs = TechTreeEngine.getAvailableTechs(activePlayer);
        if (availableTechs.length > 0) {
          snapshot.startResearch(availableTechs[0]);
        }
      }
      snapshot.endTurn();
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    const decision = decideClassicAI(state, activePlayerId, {
      difficulty: activePlayer.aiDifficulty ?? 'medium',
    });

    if (!decision) {
      const recovery = chooseClassicRecoveryCommand(state, activePlayerId, {
        difficulty: activePlayer.aiDifficulty ?? 'medium',
      });
      if (recovery && engineSession) {
        const result = engineSession.dispatch(state, recovery);
        if (result.ok) {
          const synced = syncAfterMutation(result.state);
          set({
            gameState: { ...synced },
            currentPlayerId: resolveCurrentPlayer(synced),
            lastActionError: null,
          });
          scheduleAutoAITurns(getAIStepDelayMs());
          return;
        }
      }
      if (state.phase === 'setup' || state.turnPhase === 'player_action') {
        if (state.turnPhase === 'player_action') snapshot.endTurn();
        scheduleAutoAITurns(getAIStepDelayMs());
      }
      return;
    }

    if (decision.kind === 'setup_intersection') {
      const result = snapshot.placeInitialSettlement(decision.intersectionId);
      if (!result.ok) return;
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (decision.kind === 'setup_road') {
      const result = snapshot.placeInitialRoad(decision.edgeId);
      if (!result.ok) return;
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (decision.kind === 'build') {
      const result = snapshot.constructBuilding(decision.tileId, decision.buildingId);
      if (!result.ok && state.turnPhase === 'player_action') {
        snapshot.endTurn();
      }
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    const command = decision.command;

    if (command.type === 'setup_place_settlement' || command.type === 'setup_place_road') {
      if (!engineSession) return;
      const result = engineSession.dispatch(state, command);
      if (!result.ok) return;
      const synced = syncAfterMutation(result.state);
      const nextSetup = resolveInitialPlacementForState(synced, get().initialPlacement);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        initialPlacement: nextSetup,
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (
      command.type === 'build_settlement' ||
      command.type === 'build_road' ||
      command.type === 'upgrade_city'
    ) {
      if (!engineSession) return;
      const result = engineSession.dispatch(state, command);
      if (!result.ok) {
        if (state.turnPhase === 'player_action') snapshot.endTurn();
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'roll_dice') {
      snapshot.runDiceRoll();
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'setup_placement') {
      if (!engineSession) return;
      const result = engineSession.dispatch(state, command);
      if (!result.ok) {
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
      const next = result.state;
      if (next.phase === 'playing') {
        seedFrontendEntities(next);
        for (const [, p] of next.players) recalculateVP(p, next);
      } else {
        syncHexSetupActivePlayer(next);
      }
      const synced = syncAfterMutation(next);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'acknowledge_collection') {
      snapshot.acknowledgeCollection();
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'discard_resources') {
      if (!engineSession) return;
      const result = engineSession.dispatch(state, command);
      if (!result.ok) return;
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'move_robber') {
      snapshot.moveRobber(command.tileId);
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'steal_resource') {
      snapshot.stealFromPlayer(command.targetPlayerId);
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'bank_trade') {
      if (!engineSession) return;
      // Dispatcher la commande complète (marchandises C&K incluses) sans toast joueur.
      const result = engineSession.dispatch(state, command);
      if (!result.ok) {
        if (state.turnPhase === 'player_action') snapshot.endTurn();
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (
      command.type === 'propose_player_trade' ||
      command.type === 'accept_player_trade' ||
      command.type === 'reject_player_trade' ||
      command.type === 'cancel_player_trade'
    ) {
      if (!engineSession) return;
      const result = engineSession.dispatch(state, command);
      if (!result.ok) {
        if (state.turnPhase === 'player_action') snapshot.endTurn();
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'draw_dev_card') {
      snapshot.drawDevCard();
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'play_dev_card') {
      snapshot.playDevCard(
        command.cardId,
        command.targetPlayerId ?? null,
        command.targetTileId ?? null,
      );
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    if (command.type === 'end_turn') {
      snapshot.endTurn();
      scheduleAutoAITurns(getAIStepDelayMs());
      return;
    }

    // C&K (`ck_*`) et tout type non listé ci-dessus — sinon la boucle IA se fige.
    if (!engineSession) return;
    {
      const result = engineSession.dispatch(state, command);
      if (!result.ok) {
        const recovery = chooseClassicRecoveryCommand(state, activePlayerId, {
          difficulty: activePlayer.aiDifficulty ?? 'medium',
        });
        if (recovery) {
          const recovered = engineSession.dispatch(state, recovery);
          if (recovered.ok) {
            const synced = syncAfterMutation(recovered.state);
            set({
              gameState: { ...synced },
              currentPlayerId: resolveCurrentPlayer(synced),
              lastActionError: null,
            });
            scheduleAutoAITurns(getAIStepDelayMs());
            return;
          }
        }
        if (state.turnPhase === 'player_action') snapshot.endTurn();
        scheduleAutoAITurns(getAIStepDelayMs());
        return;
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
    }
  };

  const scheduleAutoAITurns = (delayMs = getAIStepDelayMs()): void => {
    // En multijoueur autoritaire, seul le serveur applique les tours / l'IA.
    if (isRemoteSession()) return;
    if (typeof window === 'undefined' || aiLoopScheduled) return;
    aiLoopScheduled = true;
    window.setTimeout(() => {
      aiLoopScheduled = false;
      runAutoAIStep();
    }, delayMs);
  };

  return {
    gameState: null,
    currentPlayerId: null,
    lastActionError: null,
    saves: [],
    initialPlacement: null,

    initializeGame: (options) => {
      const providedNames = options?.playerNames?.filter((name) => name.trim().length > 0) ?? [];
      const names = providedNames.length > 0 ? providedNames : defaultNames;
      const seed = options?.config?.mapSeed ?? Date.now() % 1_000_000;
      const preset =
        options?.preset ?? (options?.config?.mode === 'classic' ? 'classic' : 'catanx');

      engineSession = new ClientEngineSession(seed);

      const mergedConfig = buildGameConfigFromPreset(preset, {
        ...defaultConfig,
        ...(options?.config ?? {}),
        playerCount: options?.config?.playerCount ?? names.length,
        mapSeed: seed,
      });

      const playerSetups = names.map((name, idx) => {
        const type = (
          options?.hotseatMode
            ? 'human'
            : idx === 0
              ? 'human'
              : (options?.playerTypes?.[idx] ?? 'ai')
        ) as import('@catanx/engine').PlayerType;
        return {
          name,
          civilization: (options?.civilizations?.[idx] ??
            'empire') as import('@catanx/engine').CivilizationType,
          type,
          profile: options?.profiles?.[idx],
          color: options?.profiles?.[idx]?.pieceColor,
          ...(type === 'ai' ? { aiDifficulty: options?.aiDifficulties?.[idx] ?? 'medium' } : {}),
        };
      });

      const createResult = engineSession.dispatch(null, {
        type: 'create_game',
        config: mergedConfig,
        players: playerSetups,
      });

      if (!createResult.ok) {
        set({ lastActionError: createResult.error.message });
        return;
      }

      const nextState = createResult.state;

      for (let idx = 0; idx < nextState.turnOrder.length; idx += 1) {
        const playerId = nextState.turnOrder[idx];
        const player = nextState.players.get(playerId);
        if (!player) continue;

        const configuredType = options?.hotseatMode ? 'human' : options?.playerTypes?.[idx];
        const type: PlayerType = options?.hotseatMode
          ? 'human'
          : idx === 0
            ? 'human'
            : (configuredType ?? 'ai');
        player.type = type;

        if (type === 'ai') {
          const civDefinition = getCivilizationById(player.civilization);
          player.aiPersonality = civDefinition.aiPersonality;
          player.aiDifficulty = options?.aiDifficulties?.[idx] ?? 'medium';
        } else {
          player.aiPersonality = undefined;
          player.aiDifficulty = undefined;
        }
      }

      let initialPlacement: InitialPlacementState | null = null;

      if (usesTopologicalPlacement(nextState)) {
        clearEngineAutoPlacements(nextState);
        ensureClassicRuntimeState(nextState);
        ensureLimitedBank(nextState);
        initialPlacement = createInitialPlacementState(nextState);
      } else {
        // Modes futurs sans topologie : placement serpent tuile.
        clearEngineAutoPlacements(nextState);
        if (!nextState.classicBoard && nextState.mapRadius === 2) {
          applyClassicBoardPreset(nextState);
        }
        ensureLimitedBank(nextState);
        nextState.phase = 'setup';
        nextState.turnPhase = 'player_action';
        nextState.currentTurn = 1;
        nextState.setupPlacementIndex = 0;
        nextState.setupPlayerOrder = [
          ...nextState.turnOrder,
          ...[...nextState.turnOrder].reverse(),
        ];
        for (const [, player] of nextState.players) {
          player.isActive = false;
        }
        const firstSetupId = nextState.setupPlayerOrder[0];
        if (firstSetupId) {
          const first = nextState.players.get(firstSetupId);
          if (first) first.isActive = true;
          const turnIdx = nextState.turnOrder.indexOf(firstSetupId);
          nextState.currentPlayerIndex = turnIdx >= 0 ? turnIdx : 0;
        }
      }

      syncAfterMutation(nextState);

      set({
        gameState: nextState,
        currentPlayerId: resolveCurrentPlayer(nextState),
        initialPlacement,
        lastActionError: null,
      });

      scheduleAutoAITurns();
    },

    placeSetupSettlement: (tileId) => {
      const state = get().gameState;
      if (!state || !engineSession) {
        return { ok: false, reason: 'Aucune partie active' };
      }
      if (usesTopologicalPlacement(state)) {
        return { ok: false, reason: 'Utilisez le placement topologique (intersections / arêtes)' };
      }
      if (state.phase !== 'setup') {
        return { ok: false, reason: 'Pas en phase de placement initial' };
      }

      const playerId = state.setupPlayerOrder[state.setupPlacementIndex];
      if (!playerId) {
        return { ok: false, reason: 'Joueur introuvable' };
      }

      const result = engineSession.dispatch(state, {
        type: 'setup_placement',
        playerId,
        tileId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const next = result.state;
      if (next.phase === 'playing') {
        seedFrontendEntities(next);
        for (const [, p] of next.players) {
          recalculateVP(p, next);
        }
      } else {
        syncHexSetupActivePlayer(next);
      }

      const synced = syncAfterMutation(next);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    placeInitialSettlement: (intersectionId) => {
      const state = get().gameState;
      const setup = get().initialPlacement;
      if (!state || !setup?.active || !engineSession) {
        return { ok: false, reason: 'Placement initial non actif' };
      }
      if (setup.step !== 'settlement') {
        const reason = "Placez d'abord votre route initiale";
        setError(set, reason);
        return { ok: false, reason };
      }
      const playerId =
        state.setupPlayerOrder[state.setupPlacementIndex] ??
        state.turnOrder[setup.sequence[setup.cursor]];
      if (!playerId) {
        const reason = 'Joueur introuvable';
        setError(set, reason);
        return { ok: false, reason };
      }
      if (!usesTopologicalPlacement(state)) {
        const reason = 'Placement topologique indisponible dans ce mode';
        setError(set, reason);
        return { ok: false, reason };
      }

      const result = engineSession.dispatch(state, {
        type: 'setup_place_settlement',
        playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      const nextSetup = resolveInitialPlacementForState(synced, setup);
      set({
        gameState: { ...synced },
        currentPlayerId: playerId,
        initialPlacement: nextSetup,
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    placeInitialRoad: (edgeId) => {
      const state = get().gameState;
      const setup = get().initialPlacement;
      if (!state || !setup?.active || !engineSession) {
        return { ok: false, reason: 'Placement initial non actif' };
      }
      if (setup.step !== 'road') {
        const reason = "Placez d'abord votre village initial";
        setError(set, reason);
        return { ok: false, reason };
      }
      const playerId =
        state.setupPlayerOrder[state.setupPlacementIndex] ??
        state.turnOrder[setup.sequence[setup.cursor]];
      if (!playerId) {
        const reason = 'Joueur introuvable';
        setError(set, reason);
        return { ok: false, reason };
      }
      if (!usesTopologicalPlacement(state)) {
        const reason = 'Placement topologique indisponible dans ce mode';
        setError(set, reason);
        return { ok: false, reason };
      }

      const result = engineSession.dispatch(state, {
        type: 'setup_place_road',
        playerId,
        edgeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      const nextSetup = resolveInitialPlacementForState(synced, setup);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        initialPlacement: nextSetup,
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    previewInitialSettlement: (intersectionId) => {
      const setup = get().initialPlacement;
      if (!setup?.active || setup.step !== 'settlement') return;
      set({
        initialPlacement: {
          ...setup,
          pendingIntersectionId: intersectionId,
          pendingEdgeId: null,
        },
      });
    },

    previewInitialRoad: (edgeId) => {
      const setup = get().initialPlacement;
      if (!setup?.active || setup.step !== 'road') return;
      set({
        initialPlacement: {
          ...setup,
          pendingEdgeId: edgeId,
          pendingIntersectionId: null,
        },
      });
    },

    confirmInitialPlacement: () => {
      const setup = get().initialPlacement;
      if (!setup?.active) return { ok: false, reason: 'Placement initial non actif' };
      if (setup.step === 'settlement' && setup.pendingIntersectionId) {
        return get().placeInitialSettlement(setup.pendingIntersectionId);
      }
      if (setup.step === 'road' && setup.pendingEdgeId) {
        return get().placeInitialRoad(setup.pendingEdgeId);
      }
      return { ok: false, reason: 'Aucun emplacement en attente' };
    },

    cancelInitialPlacementPreview: () => {
      const setup = get().initialPlacement;
      if (!setup) return;
      set({
        initialPlacement: {
          ...setup,
          pendingIntersectionId: null,
          pendingEdgeId: null,
        },
      });
    },

    setGameState: (nextState, options) => {
      if (!engineSession) {
        engineSession = new ClientEngineSession(nextState.config.mapSeed ?? 0);
      }
      syncAfterMutation(nextState);
      set({
        gameState: nextState,
        currentPlayerId: resolveCurrentPlayer(nextState),
        initialPlacement: resolveInitialPlacementForState(nextState, get().initialPlacement),
        lastActionError: null,
      });
      if (!options?.skipAI && !isRemoteSession()) {
        scheduleAutoAITurns();
      }
    },

    runDiceRoll: () => {
      const state = get().gameState;
      if (!state) return;
      const playerId = resolveCurrentPlayer(state);
      const diceGate = canRollDice(state, playerId);
      if (!diceGate.ok) {
        setError(set, diceGate.reason ?? 'Lancer de dés impossible');
        return;
      }
      if (!playerId || !engineSession) return;

      const result = engineSession.dispatch(state, { type: 'roll_dice', playerId });
      if (!result.ok) {
        setError(set, result.error.message);
        return;
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        initialPlacement: resolveInitialPlacementForState(synced, null),
        lastActionError: null,
      });
      scheduleAutoAITurns();
    },

    acknowledgeCollection: () => {
      const state = get().gameState;
      if (!state || !engineSession) return;
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return;

      const result = engineSession.dispatch(state, {
        type: 'acknowledge_collection',
        playerId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return;
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
    },

    discardOnSeven: (resources, playerId, commodities, undergroundSkyMaterials) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const targetPlayerId = playerId ?? resolveCurrentPlayer(state);
      if (!targetPlayerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'discard_resources',
        playerId: targetPlayerId,
        resources,
        ...(commodities && Object.keys(commodities).length > 0 ? { commodities } : {}),
        ...(undergroundSkyMaterials && Object.keys(undergroundSkyMaterials).length > 0
          ? { undergroundSkyMaterials }
          : {}),
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    moveRobber: (tileId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, { type: 'move_robber', playerId, tileId });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    stealFromPlayer: (targetPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'steal_resource',
        playerId,
        targetPlayerId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    bankTrade: (give, receive, options) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      if (state.phase === 'setup') {
        return { ok: false, reason: "Terminez d'abord le placement initial" };
      }
      if (state.turnPhase !== 'player_action') {
        return {
          ok: false,
          reason: 'Commerce banque disponible après la collecte (phase d’action).',
        };
      }
      ensureLimitedBank(state);
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'bank_trade',
        playerId,
        give,
        receive,
        giveCommodities: options?.giveCommodities,
        receiveCommodities: options?.receiveCommodities,
        giveMaterials: options?.giveMaterials,
        receiveMaterials: options?.receiveMaterials,
      });
      if (!result.ok) {
        if (!options?.silent) setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    chooseSeasonPreparation: (preparation, targetResource) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = get().currentPlayerId ?? resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'seasons_choose_preparation',
        playerId,
        preparation,
        targetResource,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    usChooseThermalOutput: (outpostId, resource) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_choose_thermal_output',
        playerId,
        outpostId,
        resource,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usChooseDiscoveryReward: (nodeId, choice) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_choose_discovery_reward',
        playerId,
        nodeId,
        choice,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usSurveyCavern: (nodeId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_survey_cavern',
        playerId,
        nodeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usBuildShaft: (intersectionId, entryNodeId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_build_shaft',
        playerId,
        intersectionId,
        entryNodeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usBuildTunnel: (edgeId, options) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_build_tunnel',
        playerId,
        edgeId,
        useSeasonPreparation: options?.useSeasonPreparation,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usBuildOutpost: (nodeId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_build_outpost',
        playerId,
        nodeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usUpgradeExtractor: (outpostId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_upgrade_extractor',
        playerId,
        outpostId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usBuildLift: (nodeId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_build_lift',
        playerId,
        nodeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usBuildAirport: (intersectionId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_build_airport',
        playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usBuildAirship: (airportId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_build_airship',
        playerId,
        airportId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usUpgradeAirship: (airshipId, upgrade) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_upgrade_airship',
        playerId,
        airshipId,
        upgrade,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usBuildBeacon: (hubId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_build_beacon',
        playerId,
        hubId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usDispatchAirship: (airshipId, destinationHubId, cargo) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_dispatch_airship',
        playerId,
        airshipId,
        destinationHubId,
        cargo,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usUnloadAirship: (airshipId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_unload_airship',
        playerId,
        airshipId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    usCompleteContract: (contractId, options) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'us_complete_contract',
        playerId,
        contractId,
        airshipId: options?.airshipId,
        rewardClassic: options?.rewardClassic,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peBuildEmbassy: (intersectionId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_build_embassy',
        playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peProposePact: (toPlayerId, clauses) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_propose_pact',
        playerId,
        toPlayerId,
        clauses,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peCounterPact: (offerId, clauses) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_counter_pact',
        playerId,
        offerId,
        clauses,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peAcceptPact: (offerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_accept_pact',
        playerId,
        offerId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peRejectPact: (offerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_reject_pact',
        playerId,
        offerId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peBreakPact: (pactId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_break_pact',
        playerId,
        pactId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peProposeMutualDissolution: (pactId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_propose_mutual_dissolution',
        playerId,
        pactId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peAcceptMutualDissolution: (pactId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_accept_mutual_dissolution',
        playerId,
        pactId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peSponsorResolution: (proposalId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_sponsor_resolution',
        playerId,
        proposalId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peCastCouncilVote: (proposalId, variantId, extraVotes) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_cast_council_vote',
        playerId,
        proposalId,
        variantId,
        extraVotes,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peLobbyNeutralDelegation: (delegationId, amount) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_lobby_neutral_delegation',
        playerId,
        delegationId,
        amount,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peContributeToCrisis: (classic, commodities, materials) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_contribute_to_crisis',
        playerId,
        classic,
        commodities: commodities as never,
        materials: materials as never,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    peClaimMandate: (mandateId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };
      const result = engineSession.dispatch(state, {
        type: 'pe_claim_mandate',
        playerId,
        mandateId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckImproveUrban: (track) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_improve_urban',
        playerId,
        track,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckChooseAqueduct: (resource, forPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const pending = state.extensions?.citiesKnights?.pendingResolutions.find(
        (r) => r.kind === 'aqueduct' && (!forPlayerId || r.playerId === forPlayerId),
      );
      const playerId = forPlayerId ?? pending?.playerId ?? resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_aqueduct_choose',
        playerId,
        resource,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckPlaceMetropolis: (track, intersectionId, forPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = forPlayerId ?? resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_place_metropolis',
        playerId,
        track,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckBuildWall: (intersectionId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_build_wall',
        playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckChoosePillageCity: (intersectionId, forPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const pending = state.extensions?.citiesKnights?.pendingResolutions.find(
        (r) => r.kind === 'pillage_city' && (!forPlayerId || r.playerId === forPlayerId),
      );
      const playerId = forPlayerId ?? pending?.playerId ?? resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_choose_pillage_city',
        playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckChooseProgressDeck: (deck, forPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const pending = state.extensions?.citiesKnights?.pendingResolutions.find(
        (r) => r.kind === 'choose_progress_deck' && (!forPlayerId || r.playerId === forPlayerId),
      );
      const playerId = forPlayerId ?? pending?.playerId ?? resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_choose_progress_deck',
        playerId,
        deck,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckDiscardProgress: (cardId, forPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const pending = state.extensions?.citiesKnights?.pendingResolutions.find(
        (r) => r.kind === 'discard_progress' && (!forPlayerId || r.playerId === forPlayerId),
      );
      const playerId = forPlayerId ?? pending?.playerId ?? resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_discard_progress',
        playerId,
        cardId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckPlayProgress: (cardId, params = {}) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_play_progress',
        playerId,
        cardId,
        ...params,
      } as Parameters<typeof engineSession.dispatch>[1]);
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckRecruitKnight: (intersectionId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_recruit_knight',
        playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckActivateKnight: (knightId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_activate_knight',
        playerId,
        knightId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckPromoteKnight: (knightId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_promote_knight',
        playerId,
        knightId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckMoveKnight: (knightId, toIntersectionId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_move_knight',
        playerId,
        knightId,
        toIntersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckDisplaceKnight: (knightId, targetKnightId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_displace_knight',
        playerId,
        knightId,
        targetKnightId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckChaseRobber: (knightId, tileId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_chase_robber',
        playerId,
        knightId,
        tileId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    ckResolveKnightRetreat: (knightId, toIntersectionId, forPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const pending = state.extensions?.citiesKnights?.pendingResolutions.find(
        (r) => r.kind === 'knight_retreat' && (!forPlayerId || r.playerId === forPlayerId),
      );
      const playerId = forPlayerId ?? pending?.playerId ?? resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'ck_resolve_knight_retreat',
        playerId,
        knightId,
        toIntersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    proposePlayerTrade: (toPlayerId, give, receive) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'propose_player_trade',
        playerId,
        toPlayerId,
        give,
        receive,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return { ok: true };
    },

    acceptPlayerTrade: (tradeId, asPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const trade = state.pendingPlayerTrade;
      const playerId =
        asPlayerId ??
        trade?.toPlayerId ??
        resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'accept_player_trade',
        playerId,
        tradeId,
      });
      if (!result.ok) {
        // Mutation in-place possible (offre invalidée si le proposant n'a plus les ressources)
        const current = get().gameState;
        set({
          gameState: current ? { ...current } : null,
          lastActionError: result.error.message,
        });
        scheduleAutoAITurns(getAIStepDelayMs());
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return { ok: true };
    },

    rejectPlayerTrade: (tradeId, asPlayerId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const trade = state.pendingPlayerTrade;
      const playerId =
        asPlayerId ??
        trade?.toPlayerId ??
        resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'reject_player_trade',
        playerId,
        tradeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return { ok: true };
    },

    cancelPlayerTrade: (tradeId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'cancel_player_trade',
        playerId,
        tradeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns(getAIStepDelayMs());
      return { ok: true };
    },

    drawDevCard: () => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, { type: 'draw_dev_card', playerId });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    playDevCard: (cardId, targetPlayerId = null, targetTileId = null) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'play_dev_card',
        playerId,
        cardId,
        targetPlayerId,
        targetTileId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      checkVictory(synced);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      scheduleAutoAITurns();
      return { ok: true };
    },

    endTurn: () => {
      const state = get().gameState;
      if (!state) return;
      const turnGate = canEndTurn(state);
      if (!turnGate.ok) {
        setError(set, turnGate.reason ?? 'Fin de tour impossible');
        return;
      }
      const playerId = resolveCurrentPlayer(state);
      if (!playerId || !engineSession) return;

      const result = engineSession.dispatch(state, { type: 'end_turn', playerId });
      if (!result.ok) {
        setError(set, result.error.message);
        return;
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        initialPlacement: resolveInitialPlacementForState(synced, null),
        lastActionError: null,
      });
      if (!isRemoteSession()) {
        get().autoSave();
      }
      scheduleAutoAITurns(getAITurnHandoffDelayMs());
    },

    constructBuilding: (tileId, buildingId) => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state) return { ok: false, reason: 'Aucune partie active' };

      const turnGate = getCurrentPlayerForAction(state, currentPlayerId, {
        requirePlayerAction: true,
      });
      if (turnGate.reason) {
        setError(set, turnGate.reason);
        return { ok: false, reason: turnGate.reason };
      }

      if (usesTopologicalPlacement(state)) {
        if (buildingId === 'settlement' || buildingId === 'city' || buildingId === 'road') {
          if (!engineSession) {
            const reason = 'Session moteur indisponible';
            setError(set, reason);
            return { ok: false, reason };
          }

          const target = resolveClassicTileBuild(state, turnGate.playerId, tileId, buildingId);
          if (!target) {
            const reason =
              buildingId === 'city'
                ? 'Aucun village topologique à améliorer sur cette tuile'
                : 'Aucun emplacement topologique valide pour cette tuile';
            setError(set, reason);
            return { ok: false, reason };
          }

          if (target.type === 'build_settlement') {
            return get().buildSettlement(target.intersectionId);
          }
          if (target.type === 'build_road') {
            return get().buildRoad(target.edgeId);
          }
          return get().upgradeCity(target.intersectionId);
        }

        if (isClassicMode(state)) {
          const reason = 'Construction non disponible en mode classique';
          setError(set, reason);
          return { ok: false, reason };
        }
      }

      const player = state.players.get(turnGate.playerId);
      const tile = state.map.get(tileId);
      if (!player || !tile) {
        const reason = 'Tuile ou joueur introuvable';
        setError(set, reason);
        return { ok: false, reason };
      }

      const verdict = canBuild(
        { playerId: turnGate.playerId, buildingType: buildingId, tileId },
        state,
      );
      if (!verdict.can) {
        const reason = verdict.reason ?? 'Construction impossible';
        setError(set, reason);
        return { ok: false, reason };
      }

      if (tile.buildings.some((id) => state.buildings.get(id)?.definitionId === buildingId)) {
        const reason = 'Ce bâtiment existe déjà sur cette tuile';
        setError(set, reason);
        return { ok: false, reason };
      }

      if (buildingId === 'city' && !player.settlements.includes(tileId)) {
        const reason = 'Une ville doit améliorer un village existant';
        setError(set, reason);
        return { ok: false, reason };
      }

      if (buildingId === 'metropolis' && !player.cities.includes(tileId)) {
        const reason = 'Une métropole doit améliorer une ville existante';
        setError(set, reason);
        return { ok: false, reason };
      }

      const cost = getBuildCost(buildingId);
      const usesFreeRoad = buildingId === 'road' && (player.freeRoadsRemaining ?? 0) > 0;
      if (!usesFreeRoad && !hasResources(player.resources, cost)) {
        const reason = 'Ressources insuffisantes';
        setError(set, reason);
        return { ok: false, reason };
      }

      if (usesFreeRoad) {
        consumeFreeRoadIfAvailable(player);
      } else {
        player.resources = subtractResources(player.resources, cost);
        returnResourcesToBank(state, cost);
      }
      setTileOwnership(state, tileId, player.id);

      const replacedSettlement =
        buildingId === 'city'
          ? removeBuildingFromTileByDefinition(state, tileId, player.id, 'settlement')
          : null;
      const replacedCity =
        buildingId === 'metropolis'
          ? removeBuildingFromTileByDefinition(state, tileId, player.id, 'city')
          : null;

      const inheritedPlacement = replacedSettlement ?? replacedCity;
      const productionTileIds =
        inheritedPlacement?.productionTileIds ??
        (buildingId === 'settlement' ? classicLandProductionTiles(state, [tileId]) : undefined);

      const building = createBuilding(buildingId, player.id, tileId, state.currentTurn, {
        placementKind:
          inheritedPlacement?.placementKind ?? (buildingId === 'settlement' ? 'tile' : undefined),
        placementIntersectionId: inheritedPlacement?.placementIntersectionId,
        productionTileIds,
      });
      if (buildingId === 'city') building.level = 2;
      if (buildingId === 'metropolis') building.level = 3;

      state.buildings.set(building.id, building);
      tile.buildings.push(building.id);
      if (buildingId === 'road') {
        tile.road = player.id;
      }

      syncUrbanProgression(state, player.id, tileId, buildingId);
      if (buildingId === 'settlement' || buildingId === 'city' || buildingId === 'metropolis') {
        grantPortsAdjacentToTile(state, player.id, tileId);
      }
      recalculateVP(player, state);
      checkVictory(state);
      pushActionLog(state, player.id, `Construction : ${frBuilding(buildingId)} sur ${tileId}`, {
        buildingId,
        tileId,
      });

      const synced = syncAfterMutation(state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    buildSettlement: (intersectionId) => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      if (!usesTopologicalPlacement(state)) {
        return { ok: false, reason: 'Placement topologique indisponible' };
      }
      const turnGate = getCurrentPlayerForAction(state, currentPlayerId, {
        requirePlayerAction: true,
      });
      if (turnGate.reason) {
        setError(set, turnGate.reason);
        return { ok: false, reason: turnGate.reason };
      }
      const result = engineSession.dispatch(state, {
        type: 'build_settlement',
        playerId: turnGate.playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    buildRoad: (edgeId) => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      if (!usesTopologicalPlacement(state)) {
        return { ok: false, reason: 'Placement topologique indisponible' };
      }
      const turnGate = getCurrentPlayerForAction(state, currentPlayerId, {
        requirePlayerAction: true,
      });
      if (turnGate.reason) {
        setError(set, turnGate.reason);
        return { ok: false, reason: turnGate.reason };
      }
      const result = engineSession.dispatch(state, {
        type: 'build_road',
        playerId: turnGate.playerId,
        edgeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    upgradeCity: (intersectionId) => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      if (!usesTopologicalPlacement(state)) {
        return { ok: false, reason: 'Placement topologique indisponible' };
      }
      const turnGate = getCurrentPlayerForAction(state, currentPlayerId, {
        requirePlayerAction: true,
      });
      if (turnGate.reason) {
        setError(set, turnGate.reason);
        return { ok: false, reason: turnGate.reason };
      }
      const result = engineSession.dispatch(state, {
        type: 'upgrade_city',
        playerId: turnGate.playerId,
        intersectionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    recruitUnit: (tileId, unitType) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'recruit_unit',
        playerId,
        tileId,
        unitType,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    moveUnit: (unitId, targetTileId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'move_unit',
        playerId,
        unitId,
        targetTileId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    attackUnit: (attackerId, defenderId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'attack_unit',
        playerId,
        attackerId,
        defenderId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    fortifyUnit: (unitId) => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state) return { ok: false, reason: 'Aucune partie active' };

      const turnGate = getCurrentPlayerForAction(state, currentPlayerId, {
        requirePlayerAction: true,
      });
      if (turnGate.reason) {
        setError(set, turnGate.reason);
        return { ok: false, reason: turnGate.reason };
      }

      const unit = state.units.get(unitId);
      if (!unit) {
        const reason = 'Unité introuvable';
        setError(set, reason);
        return { ok: false, reason };
      }
      if (unit.ownerId !== turnGate.playerId) {
        const reason = 'Vous ne contrôlez pas cette unité';
        setError(set, reason);
        return { ok: false, reason };
      }

      unit.status = 'fortified';
      unit.hasMoved = true;
      unit.hasAttacked = true;
      pushActionLog(state, unit.ownerId, `Fortification : ${frUnit(unit.type)}`, { unitId });

      const synced = syncAfterMutation(state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    buyMarketResource: (resource, quantity) => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state) return { ok: false, reason: 'Aucune partie active' };

      const turnGate = getCurrentPlayerForAction(state, currentPlayerId, {
        requirePlayerAction: true,
      });
      if (turnGate.reason) {
        setError(set, turnGate.reason);
        return { ok: false, reason: turnGate.reason };
      }

      const player = state.players.get(turnGate.playerId);
      if (!player) {
        const reason = 'Joueur introuvable';
        setError(set, reason);
        return { ok: false, reason };
      }

      const amount = Math.max(1, Math.floor(quantity));
      const unitPrice = state.market.prices[resource];
      if (!unitPrice || unitPrice <= 0) {
        const reason = 'Ressource non échangeable';
        setError(set, reason);
        return { ok: false, reason };
      }

      const totalCost = unitPrice * amount;
      if ((player.resources.coins ?? 0) < totalCost) {
        const reason = 'Pièces insuffisantes';
        setError(set, reason);
        return { ok: false, reason };
      }

      player.resources = subtractResources(player.resources, { coins: totalCost });
      player.resources = addResources(player.resources, { [resource]: amount });
      state.market.demand[resource] = (state.market.demand[resource] ?? 0) + amount;

      pushActionLog(state, player.id, `Achat marche : ${frResource(resource)} x${amount}`, {
        resource,
        amount,
        totalCost,
      });

      const synced = syncAfterMutation(state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    sellMarketResource: (resource, quantity) => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state) return { ok: false, reason: 'Aucune partie active' };

      const turnGate = getCurrentPlayerForAction(state, currentPlayerId, {
        requirePlayerAction: true,
      });
      if (turnGate.reason) {
        setError(set, turnGate.reason);
        return { ok: false, reason: turnGate.reason };
      }

      const player = state.players.get(turnGate.playerId);
      if (!player) {
        const reason = 'Joueur introuvable';
        setError(set, reason);
        return { ok: false, reason };
      }

      if (resource === 'coins') {
        const reason = 'Vous ne pouvez pas vendre des pièces';
        setError(set, reason);
        return { ok: false, reason };
      }

      const amount = Math.max(1, Math.floor(quantity));
      if ((player.resources[resource] ?? 0) < amount) {
        const reason = 'Stock insuffisant';
        setError(set, reason);
        return { ok: false, reason };
      }

      const unitPrice = state.market.prices[resource];
      if (!unitPrice || unitPrice <= 0) {
        const reason = 'Ressource non échangeable';
        setError(set, reason);
        return { ok: false, reason };
      }

      const payout = Math.max(1, Math.floor(unitPrice * amount * 0.75));
      player.resources = subtractResources(player.resources, { [resource]: amount });
      player.resources = addResources(player.resources, { coins: payout });
      state.market.supply[resource] = (state.market.supply[resource] ?? 0) + amount;

      pushActionLog(state, player.id, `Vente marche : ${frResource(resource)} x${amount}`, {
        resource,
        amount,
        payout,
      });

      const synced = syncAfterMutation(state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    startResearch: (techId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'start_research',
        playerId,
        techId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    applyEventChoice: (choiceId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const pending = state.pendingChoices.find((item) => item.playerId === playerId);
      if (!pending) return { ok: false, reason: "Aucun choix d'événement en attente" };

      const result = engineSession.dispatch(state, {
        type: 'choose_event',
        playerId,
        eventId: pending.eventId,
        choiceId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    dismissPendingEvent: () => {
      const state = get().gameState;
      const currentPlayerId = get().currentPlayerId;
      if (!state || !currentPlayerId) return;

      const pending = state.pendingChoices.find((item) => item.playerId === currentPlayerId);
      if (!pending) return;

      state.pendingChoices = state.pendingChoices.filter((entry) => entry.id !== pending.id);

      const synced = syncAfterMutation(state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
    },

    runDiplomacyAction: (toPlayerId, actionType, data) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'diplomacy_action',
        playerId,
        toPlayerId,
        actionType,
        data,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    craftRecipe: (buildingId, recipeId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const phaseGate = canEndTurn(state);
      if (!phaseGate.ok) return { ok: false, reason: phaseGate.reason };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'craft_recipe',
        playerId,
        buildingId,
        recipeId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    castCouncilVote: (optionId) => {
      const state = get().gameState;
      if (!state || !engineSession) return { ok: false, reason: 'Aucune partie active' };
      const playerId = resolveCurrentPlayer(state);
      if (!playerId) return { ok: false, reason: 'Joueur introuvable' };

      const result = engineSession.dispatch(state, {
        type: 'council_vote',
        playerId,
        optionId,
      });
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }

      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        lastActionError: null,
      });
      return { ok: true };
    },

    saveToSlot: (slot, name) => {
      const state = get().gameState;
      if (!state) return { ok: false, reason: 'Aucune partie à sauvegarder' };
      if (isRemoteSession()) {
        return { ok: false, reason: 'En multijoueur, utilisez la sauvegarde serveur (hôte).' };
      }
      try {
        const meta = buildMetaFromState(state, slot, name);
        const payload = engineSession?.save(state) ?? serializeGameState(state);
        const written = writeSavePayload(meta, payload);
        if (!written.ok) return written;
        set({ saves: loadSaveMetadata(), lastActionError: null });
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Échec de la sauvegarde' };
      }
    },

    saveCurrentGame: (name) => {
      const free = findFreeManualSlot();
      if (!free) {
        return { ok: false, reason: 'Tous les slots sont pleins — choisissez un slot à écraser.' };
      }
      return get().saveToSlot(free, name);
    },

    autoSave: () => {
      if (isRemoteSession()) return { ok: false, reason: 'Autosave désactivé en multijoueur' };
      return get().saveToSlot('auto');
    },

    loadGame: (id) => {
      if (!localStorageAvailable()) return { ok: false, reason: 'Stockage local indisponible' };

      try {
        const raw = readSavePayload(id);
        if (!raw) return { ok: false, reason: 'Sauvegarde introuvable' };

        let state: GameState;
        const seedHint = (() => {
          try {
            const parsed = JSON.parse(raw) as {
              randomSeed?: number;
              config?: { mapSeed?: number };
            };
            return parsed.randomSeed ?? parsed.config?.mapSeed ?? 0;
          } catch {
            return 0;
          }
        })();

        if (!engineSession) {
          engineSession = new ClientEngineSession(seedHint);
        }
        const loaded = engineSession.load(raw);
        state = loaded.state;
        syncAfterMutation(state);

        set({
          gameState: state,
          currentPlayerId: resolveCurrentPlayer(state),
          initialPlacement: resolveInitialPlacementForState(state, null),
          lastActionError: null,
        });
        if (!isRemoteSession()) {
          scheduleAutoAITurns();
        }

        return { ok: true };
      } catch {
        return { ok: false, reason: 'Échec du chargement de la sauvegarde' };
      }
    },

    loadMostRecentSave: () => {
      const recent = getMostRecentSave();
      if (!recent) return { ok: false, reason: 'Aucune sauvegarde' };
      return get().loadGame(recent.id);
    },

    renameSave: (id, name) => {
      const next = renameSaveById(id, name);
      if (!next) return { ok: false, reason: 'Impossible de renommer' };
      set({ saves: next });
      return { ok: true };
    },

    exportSave: (id) => buildExportBundle(id),

    importSave: (raw, slot) => {
      const parsed = parseImportBundle(raw);
      if (!parsed.ok) return parsed;
      const targetSlot = slot ?? findFreeManualSlot() ?? 1;
      const id = slotToId(targetSlot);
      const meta: GameSaveMeta = {
        ...parsed.bundle.meta,
        id,
        slot: targetSlot,
        updatedAt: Date.now(),
        name: parsed.bundle.meta.name || `Import slot ${targetSlot}`,
      };
      // Enrichir meta depuis le payload si possible
      try {
        const snap = JSON.parse(parsed.bundle.payload) as {
          state?: { currentTurn?: number; players?: unknown[]; config?: { mapSeed?: number; mode?: string }; phase?: string };
          schemaVersion?: number;
        };
        if (snap.state) {
          meta.turn = snap.state.currentTurn ?? meta.turn;
          const players = snap.state.players as
            | unknown[]
            | { __type?: string; value?: unknown[] }
            | undefined;
          if (Array.isArray(players)) {
            meta.playerCount = players.length;
          } else if (players && players.__type === 'Map' && Array.isArray(players.value)) {
            meta.playerCount = players.value.length;
          }
          meta.mapSeed = snap.state.config?.mapSeed ?? meta.mapSeed;
          meta.mode = snap.state.config?.mode ?? meta.mode;
          meta.phase = snap.state.phase ?? meta.phase;
          meta.schemaVersion = snap.schemaVersion ?? meta.schemaVersion;
        }
      } catch {
        /* keep meta as-is */
      }
      const written = writeSavePayload(meta, parsed.bundle.payload);
      if (!written.ok) return written;
      set({ saves: loadSaveMetadata() });
      return { ok: true, id };
    },

    getCommandLog: () => {
      return engineSession?.getCommandLog() ?? [];
    },

    replayFromCommandLog: () => {
      if (!engineSession) return { ok: false, reason: 'Aucune session' };
      if (isRemoteSession()) return { ok: false, reason: 'Replay indisponible en multijoueur' };
      const log = engineSession.getCommandLog();
      if (log.length === 0) return { ok: false, reason: 'Journal vide' };
      const seed = get().gameState?.config.mapSeed ?? 0;
      engineSession.reset(seed);
      const result = replayCommands(log, engineSession.getContext());
      if (!result.ok) {
        setError(set, result.error.message);
        return { ok: false, reason: result.error.message };
      }
      engineSession.setCommandLog(log);
      const synced = syncAfterMutation(result.state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
        initialPlacement: resolveInitialPlacementForState(synced, null),
        lastActionError: null,
      });
      return { ok: true };
    },

    deleteSave: (id) => {
      const nextMeta = deleteSaveById(id);
      set({ saves: nextMeta });
    },

    refreshSaves: () => {
      set({ saves: loadSaveMetadata() });
    },

    clearError: () => {
      set({ lastActionError: null });
    },

    reportActionError: (message) => {
      setError(set, message);
    },

    forceSync: () => {
      const state = get().gameState;
      if (!state) return;

      const synced = syncAfterMutation(state);
      set({
        gameState: { ...synced },
        currentPlayerId: resolveCurrentPlayer(synced),
      });
    },
  };
});

/**
 * Commandes classiques autoritaires : setup + constructions sur intersections / arêtes.
 */
import type { GameState } from '../../types/game';
import type { BuildingInstance } from '../../types/buildings';
import type { ResourceBundle } from '../../types/resources';
import { normalizePortType } from '../../types/hex';
import { nextId } from '../../core/ids';
import {
  chooseSettlementAnchorTile,
  intersectionTouchesLand,
} from './CatanTopology';
import {
  classicLandProductionTiles,
  ensureClassicRuntimeState,
  registerClassicCityUpgrade,
  registerClassicRoadPiece,
  registerClassicSettlementPiece,
  returnResourcesToBank,
  takeResourcesFromBank,
  usesTopologicalPlacement,
} from './ClassicBoard';
import {
  addResources,
  hasResources,
  subtractResources,
} from '../resources/ResourceSystem';
import {
  consumeFreeRoadIfAvailable,
  refreshTrophiesAndVictory,
} from '../game/GameEngine';
import { peOnCityUpgraded } from '../pactsEmbassies/adapters';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { isBlockedByEnemyKnight, knightAtIntersection } from '../citiesKnights/knights';
import {
  applySeasonalBuildCost,
  markSeasonalBuildUsed,
} from '../seasons/costs';
import { shouldAutoUseSeasonPreparation } from '../seasons/events';

const SETTLEMENT_COST: ResourceBundle = { wood: 1, clay: 1, wheat: 1, sheep: 1 };
const CITY_COST: ResourceBundle = { ore: 3, wheat: 2 };
const ROAD_COST: ResourceBundle = { wood: 1, clay: 1 };

function activeSetupPlayerId(state: GameState): string | null {
  return state.setupPlayerOrder[state.setupPlacementIndex] ?? null;
}

function createSettlementBuilding(
  state: GameState,
  playerId: string,
  intersectionId: string,
  anchorTileId: string,
  productionTileIds: string[],
): BuildingInstance {
  return {
    id: nextId('building'),
    definitionId: 'settlement',
    tileId: anchorTileId,
    ownerId: playerId,
    placementKind: 'intersection',
    placementIntersectionId: intersectionId,
    productionTileIds,
    constructedTurn: state.currentTurn,
    level: 1,
    health: 100,
    workers: [],
    isActive: true,
    productionProgress: 0,
  };
}

function registerPorts(state: GameState, playerId: string, intersectionId: string): void {
  const player = state.players.get(playerId);
  if (!player) return;

  const portType = normalizePortType(
    state.classicBoard?.portByIntersection?.[intersectionId] ?? null,
  );
  if (portType) {
    if (!player.ports.includes(portType)) {
      player.ports.push(portType);
    }
    return;
  }

  // Legacy / non-classic : ports encore attachés aux hexagones adjacents
  const intersection = state.classicBoard?.topology.intersections[intersectionId];
  if (!intersection) return;
  for (const tileId of intersection.tileIds) {
    const tile = state.map.get(tileId);
    const port = normalizePortType(tile?.port);
    if (port && !player.ports.includes(port)) {
      player.ports.push(port);
    }
  }
}

function setTileOwner(state: GameState, tileId: string, playerId: string): void {
  const tile = state.map.get(tileId);
  const player = state.players.get(playerId);
  if (!tile || !player) return;
  tile.owner = playerId;
  tile.explored.add(playerId);
  tile.visible.add(playerId);
  if (!player.ownedTiles.includes(tileId)) player.ownedTiles.push(tileId);
}

/**
 * A settlement sees the hexes it touches. Classic pieces sit on intersections,
 * which `updatePlayerVision` (tile-based) cannot resolve, so without this only
 * the anchor tile was ever revealed and fog of war covered almost the whole
 * board after setup.
 */
function revealIntersectionTiles(state: GameState, tileIds: readonly string[], playerId: string): void {
  for (const tileId of tileIds) {
    const tile = state.map.get(tileId);
    if (!tile) continue;
    tile.explored.add(playerId);
    tile.visible.add(playerId);
  }
}

function playerControlsIntersection(state: GameState, playerId: string, intersectionId: string): boolean {
  const board = state.classicBoard!;
  return board.occupiedIntersections[intersectionId] === playerId;
}

function playerTouchesIntersection(state: GameState, playerId: string, intersectionId: string): boolean {
  const board = state.classicBoard!;
  if (playerControlsIntersection(state, playerId, intersectionId)) return true;
  for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
    if (owner !== playerId) continue;
    const edge = board.topology.edges[edgeId];
    if (!edge) continue;
    if (edge.a === intersectionId || edge.b === intersectionId) return true;
  }
  return false;
}

/** Frontières ouvertes : construction via bâtiment allié (pas pour Route la plus longue). */
function playerTouchesViaOpenBorders(
  state: GameState,
  playerId: string,
  intersectionId: string,
  pactId?: string,
): boolean {
  const pe = state.extensions?.pactsEmbassies;
  if (!pe) return false;
  const board = state.classicBoard!;
  const owner = board.occupiedIntersections[intersectionId];
  if (!owner || owner === playerId) return false;

  const pact = pe.pacts.find((p) => {
    if (p.status !== 'active') return false;
    if (!p.clauses.includes('open_borders')) return false;
    if (pactId && p.id !== pactId) return false;
    return (
      (p.partnerA === playerId && p.partnerB === owner) ||
      (p.partnerB === playerId && p.partnerA === owner)
    );
  });
  return Boolean(pact);
}

function distanceRuleOk(state: GameState, intersectionId: string): boolean {
  const board = state.classicBoard!;
  const intersection = board.topology.intersections[intersectionId];
  if (!intersection) return false;
  if (board.occupiedIntersections[intersectionId]) return false;
  return !intersection.neighborIds.some((id) => Boolean(board.occupiedIntersections[id]));
}

function finishSetupIfComplete(state: GameState): void {
  if (state.setupPlacementIndex < state.setupPlayerOrder.length) return;
  state.phase = 'playing';
  state.turnPhase = 'start_of_turn';
  state.currentPlayerIndex = 0;
  for (const [, player] of state.players) {
    player.isActive = false;
  }
  refreshTrophiesAndVictory(state);
  const first = state.players.get(state.turnOrder[0]);
  if (first) first.isActive = true;
  if (state.classicBoard) {
    state.classicBoard.setupStep = 'settlement';
    state.classicBoard.setupLastIntersectionId = null;
  }
}

function resolveEdgeAnchors(
  state: GameState,
  edgeId: string,
): { fromTileId: string; toTileId: string } | null {
  const board = state.classicBoard!;
  const edge = board.topology.edges[edgeId];
  if (!edge) return null;
  const fromTileId = chooseSettlementAnchorTile(
    board.topology,
    state.map,
    edge.a,
    board.anchorUsageByTile,
  );
  const toTileId = chooseSettlementAnchorTile(
    board.topology,
    state.map,
    edge.b,
    board.anchorUsageByTile,
  );
  if (!fromTileId || !toTileId) return null;
  return { fromTileId, toTileId };
}

function attachRoadSegment(
  state: GameState,
  playerId: string,
  fromTileId: string,
  toTileId: string,
): void {
  const player = state.players.get(playerId);
  const fromTile = state.map.get(fromTileId);
  const toTile = state.map.get(toTileId);
  if (!player || !fromTile || !toTile) return;
  player.roads.push({
    from: { ...fromTile.coord },
    to: { ...toTile.coord },
    type: 'road',
    level: 1,
  });
  fromTile.road = playerId;
  toTile.road = playerId;
}

function settlementTouchesRoad(state: GameState, playerId: string, intersectionId: string): boolean {
  const board = state.classicBoard!;
  return Object.entries(board.roadsByEdge).some(([edgeId, owner]) => {
    if (owner !== playerId) return false;
    const edge = board.topology.edges[edgeId];
    return Boolean(edge && (edge.a === intersectionId || edge.b === intersectionId));
  });
}

function canPlaceSettlementHere(
  state: GameState,
  playerId: string,
  intersectionId: string,
  requireRoad: boolean,
): boolean {
  const board = state.classicBoard!;
  if (!board.topology.intersections[intersectionId]) return false;
  if (!intersectionTouchesLand(board.topology, state.map, intersectionId)) return false;
  if (!distanceRuleOk(state, intersectionId)) return false;
  if (requireRoad && !settlementTouchesRoad(state, playerId, intersectionId)) return false;
  if (knightAtIntersection(state, intersectionId)) return false;
  if (isBlockedByEnemyKnight(state, intersectionId, playerId)) return false;
  const stock = board.piecesRemaining[playerId];
  if (!stock || stock.settlements <= 0) return false;
  return true;
}

function canPlaceRoadHere(state: GameState, playerId: string, edgeId: string): boolean {
  const board = state.classicBoard!;
  const edge = board.topology.edges[edgeId];
  if (!edge || board.roadsByEdge[edgeId]) return false;
  const stock = board.piecesRemaining[playerId];
  if (!stock || stock.roads <= 0) return false;

  // Ascenseur US : arête réservée au propriétaire, même hors réseau initial
  const lift = state.extensions?.undergroundSky?.lifts.find(
    (l) => l.surfaceEdgeId === edgeId,
  );
  if (lift) {
    if (lift.playerId !== playerId) return false;
  } else if (
    !playerTouchesIntersection(state, playerId, edge.a) &&
    !playerTouchesIntersection(state, playerId, edge.b)
  ) {
    return false;
  }

  if (isBlockedByEnemyKnight(state, edge.a, playerId) || isBlockedByEnemyKnight(state, edge.b, playerId)) {
    return false;
  }
  return resolveEdgeAnchors(state, edgeId) !== null;
}

/**
 * Setup : pose un village sur une intersection (serpent).
 */
export function classicSetupPlaceSettlement(
  playerId: string,
  intersectionId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!usesTopologicalPlacement(state)) {
    return { success: false, reason: 'Commande réservée au placement topologique' };
  }
  if (state.phase !== 'setup') {
    return { success: false, reason: 'La phase de setup est terminée' };
  }
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  if (board.setupStep !== 'settlement') {
    return { success: false, reason: "Placez d'abord la route initiale" };
  }

  const expected = activeSetupPlayerId(state);
  if (!expected || expected !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour de placement" };
  }

  const player = state.players.get(playerId);
  const intersection = board.topology.intersections[intersectionId];
  if (!player || !intersection) {
    return { success: false, reason: 'Intersection ou joueur introuvable' };
  }
  if (!intersectionTouchesLand(board.topology, state.map, intersectionId)) {
    return { success: false, reason: 'Le village doit toucher une tuile terrestre' };
  }
  if (!distanceRuleOk(state, intersectionId)) {
    return { success: false, reason: "Règle de distance : laissez une intersection d'écart" };
  }

  const anchorTileId = chooseSettlementAnchorTile(
    board.topology,
    state.map,
    intersectionId,
    board.anchorUsageByTile,
  );
  if (!anchorTileId) {
    return { success: false, reason: "Impossible de déterminer la tuile d'ancrage" };
  }
  const anchorTile = state.map.get(anchorTileId);
  if (!anchorTile) return { success: false, reason: "Tuile d'ancrage introuvable" };

  const productionTileIds = classicLandProductionTiles(state, intersection.tileIds);
  const building = createSettlementBuilding(
    state,
    playerId,
    intersectionId,
    anchorTileId,
    productionTileIds,
  );

  const piece = registerClassicSettlementPiece(state, playerId, intersectionId, building.id);
  if (!piece.ok) return { success: false, reason: piece.reason };

  state.buildings.set(building.id, building);
  anchorTile.buildings.push(building.id);
  if (!player.settlements.includes(anchorTileId)) player.settlements.push(anchorTileId);
  setTileOwner(state, anchorTileId, playerId);
  revealIntersectionTiles(state, intersection.tileIds, playerId);
  registerPorts(state, playerId, intersectionId);
  board.anchorUsageByTile[anchorTileId] = (board.anchorUsageByTile[anchorTileId] ?? 0) + 1;

  // Villes & Chevaliers : 2e placement = ville (gratuit)
  const priorBuildings = Object.values(board.occupiedIntersections).filter(
    (id) => id === playerId,
  ).length;
  // occupied already includes the settlement just placed → prior was priorBuildings - 1
  if (
    isCitiesKnightsEnabled(state) &&
    priorBuildings >= 2
  ) {
    const stock = board.piecesRemaining[playerId];
    if (stock && stock.cities > 0) {
      building.definitionId = 'city';
      building.level = 2;
      registerClassicCityUpgrade(state, playerId, intersectionId, building.id);
      player.settlements = player.settlements.filter((id) => id !== anchorTileId);
      if (!player.cities.includes(anchorTileId)) player.cities.push(anchorTileId);
    }
  }

  board.setupStep = 'road';
  board.setupLastIntersectionId = intersectionId;
  refreshTrophiesAndVictory(state);

  return { success: true };
}

/**
 * Setup : pose une route adjacente au village venant d’être placé.
 */
export function classicSetupPlaceRoad(
  playerId: string,
  edgeId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!usesTopologicalPlacement(state)) {
    return { success: false, reason: 'Commande réservée au placement topologique' };
  }
  if (state.phase !== 'setup') {
    return { success: false, reason: 'La phase de setup est terminée' };
  }
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  if (board.setupStep !== 'road' || !board.setupLastIntersectionId) {
    return { success: false, reason: "Placez d'abord votre village initial" };
  }

  const expected = activeSetupPlayerId(state);
  if (!expected || expected !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour de placement" };
  }

  const player = state.players.get(playerId);
  const edge = board.topology.edges[edgeId];
  if (!player || !edge) {
    return { success: false, reason: 'Arête invalide' };
  }
  if (edge.a !== board.setupLastIntersectionId && edge.b !== board.setupLastIntersectionId) {
    return { success: false, reason: 'La route doit partir du village placé juste avant' };
  }

  const anchors = resolveEdgeAnchors(state, edgeId);
  if (!anchors) {
    return { success: false, reason: 'Route initiale impossible (ancrage de tuile)' };
  }

  const piece = registerClassicRoadPiece(state, playerId, edgeId);
  if (!piece.ok) return { success: false, reason: piece.reason };

  attachRoadSegment(state, playerId, anchors.fromTileId, anchors.toTileId);

  // 2e village du joueur → ressources des terrains adjacents
  const settlementsOwned = Object.values(board.occupiedIntersections).filter(
    (id) => id === playerId,
  ).length;
  if (settlementsOwned >= 2 && board.setupLastIntersectionId) {
    const intersection = board.topology.intersections[board.setupLastIntersectionId];
    if (intersection) {
      const bonus: ResourceBundle = {};
      for (const tileId of classicLandProductionTiles(state, intersection.tileIds)) {
        const tile = state.map.get(tileId);
        if (!tile) continue;
        for (const [res, amount] of Object.entries(tile.baseProduction)) {
          const value = Math.floor(amount ?? 0);
          if (value <= 0) continue;
          bonus[res as keyof ResourceBundle] =
            (bonus[res as keyof ResourceBundle] ?? 0) + value;
        }
      }
      const granted = takeResourcesFromBank(state, bonus);
      player.resources = addResources(player.resources, granted);
    }
  }

  board.setupStep = 'settlement';
  board.setupLastIntersectionId = null;
  state.setupPlacementIndex += 1;

  if (state.setupPlacementIndex < state.setupPlayerOrder.length) {
    const nextPlayerId = state.setupPlayerOrder[state.setupPlacementIndex];
    const nextIndex = state.turnOrder.indexOf(nextPlayerId);
    if (nextIndex >= 0) state.currentPlayerIndex = nextIndex;
  }

  finishSetupIfComplete(state);
  return { success: true };
}

export function classicBuildSettlement(
  playerId: string,
  intersectionId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!usesTopologicalPlacement(state)) {
    return { success: false, reason: 'Commande réservée au placement topologique' };
  }
  if (state.phase !== 'playing') {
    return { success: false, reason: 'Construction indisponible hors partie' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible dans cette phase' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const player = state.players.get(playerId);
  const intersection = board.topology.intersections[intersectionId];
  if (!player || !intersection) {
    return { success: false, reason: 'Intersection ou joueur introuvable' };
  }
  if (!intersectionTouchesLand(board.topology, state.map, intersectionId)) {
    return { success: false, reason: 'Le village doit toucher une tuile terrestre' };
  }
  if (!distanceRuleOk(state, intersectionId)) {
    return { success: false, reason: "Règle de distance : laissez une intersection d'écart" };
  }
  if (knightAtIntersection(state, intersectionId)) {
    return { success: false, reason: 'Un chevalier occupe cette intersection' };
  }

  const touchesRoad = settlementTouchesRoad(state, playerId, intersectionId);
  if (!touchesRoad) {
    return { success: false, reason: 'Le village doit être relié à votre réseau de routes' };
  }

  const cost = applySeasonalBuildCost(state, playerId, 'settlement', SETTLEMENT_COST);
  if (!hasResources(player.resources, cost)) {
    return { success: false, reason: 'Ressources insuffisantes' };
  }

  const anchorTileId = chooseSettlementAnchorTile(
    board.topology,
    state.map,
    intersectionId,
    board.anchorUsageByTile,
  );
  if (!anchorTileId) {
    return { success: false, reason: "Impossible de déterminer la tuile d'ancrage" };
  }
  const anchorTile = state.map.get(anchorTileId);
  if (!anchorTile) return { success: false, reason: "Tuile d'ancrage introuvable" };

  const productionTileIds = classicLandProductionTiles(state, intersection.tileIds);
  const building = createSettlementBuilding(
    state,
    playerId,
    intersectionId,
    anchorTileId,
    productionTileIds,
  );
  const piece = registerClassicSettlementPiece(state, playerId, intersectionId, building.id);
  if (!piece.ok) return { success: false, reason: piece.reason };

  player.resources = subtractResources(player.resources, cost);
  returnResourcesToBank(state, cost);
  markSeasonalBuildUsed(state, playerId, 'settlement');
  state.buildings.set(building.id, building);
  anchorTile.buildings.push(building.id);
  if (!player.settlements.includes(anchorTileId)) player.settlements.push(anchorTileId);
  setTileOwner(state, anchorTileId, playerId);
  revealIntersectionTiles(state, intersection.tileIds, playerId);
  registerPorts(state, playerId, intersectionId);
  board.anchorUsageByTile[anchorTileId] = (board.anchorUsageByTile[anchorTileId] ?? 0) + 1;
  refreshTrophiesAndVictory(state);
  return { success: true };
}

export function classicBuildRoad(
  playerId: string,
  edgeId: string,
  state: GameState,
  options?: { useSeasonPreparation?: boolean; pactId?: string },
): { success: boolean; reason?: string } {
  if (!usesTopologicalPlacement(state)) {
    return { success: false, reason: 'Commande réservée au placement topologique' };
  }
  if (state.phase !== 'playing') {
    return { success: false, reason: 'Construction indisponible hors partie' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible dans cette phase' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const player = state.players.get(playerId);
  const edge = board.topology.edges[edgeId];
  if (!player || !edge) return { success: false, reason: 'Arête invalide' };

  const touches =
    playerTouchesIntersection(state, playerId, edge.a) ||
    playerTouchesIntersection(state, playerId, edge.b) ||
    playerTouchesViaOpenBorders(state, playerId, edge.a, options?.pactId) ||
    playerTouchesViaOpenBorders(state, playerId, edge.b, options?.pactId);
  const lift = state.extensions?.undergroundSky?.lifts.find(
    (l) => l.surfaceEdgeId === edgeId,
  );
  if (lift && lift.playerId !== playerId) {
    return { success: false, reason: 'Cette arête est réservée par un ascenseur adverse' };
  }
  if (!touches && !(lift && lift.playerId === playerId)) {
    return { success: false, reason: 'La route doit être connectée à votre réseau' };
  }
  if (
    isBlockedByEnemyKnight(state, edge.a, playerId) ||
    isBlockedByEnemyKnight(state, edge.b, playerId)
  ) {
    return { success: false, reason: 'Un chevalier adverse bloque cette arête' };
  }

  const usesFreeRoad = (player.freeRoadsRemaining ?? 0) > 0;
  const useWorks =
    Boolean(options?.useSeasonPreparation) ||
    shouldAutoUseSeasonPreparation(state, playerId, 'works');
  const cost = applySeasonalBuildCost(state, playerId, 'road', ROAD_COST, {
    useWorks,
  });
  if (!usesFreeRoad && !hasResources(player.resources, cost)) {
    return { success: false, reason: 'Ressources insuffisantes' };
  }

  const anchors = resolveEdgeAnchors(state, edgeId);
  if (!anchors) {
    return { success: false, reason: 'Construction de route impossible (ancrage)' };
  }

  const piece = registerClassicRoadPiece(state, playerId, edgeId);
  if (!piece.ok) return { success: false, reason: piece.reason };

  if (usesFreeRoad) {
    consumeFreeRoadIfAvailable(player);
  } else {
    player.resources = subtractResources(player.resources, cost);
    returnResourcesToBank(state, cost);
    markSeasonalBuildUsed(state, playerId, 'road', { useWorks });
  }

  attachRoadSegment(state, playerId, anchors.fromTileId, anchors.toTileId);

  const ownedLift = state.extensions?.undergroundSky?.lifts.find(
    (l) => l.surfaceEdgeId === edgeId && l.playerId === playerId,
  );
  if (ownedLift) ownedLift.roadBuilt = true;

  refreshTrophiesAndVictory(state);
  return { success: true };
}

export function classicUpgradeCity(
  playerId: string,
  intersectionId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!usesTopologicalPlacement(state)) {
    return { success: false, reason: 'Commande réservée au placement topologique' };
  }
  if (state.phase !== 'playing') {
    return { success: false, reason: 'Construction indisponible hors partie' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible dans cette phase' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const player = state.players.get(playerId);
  if (!player) return { success: false, reason: 'Joueur introuvable' };
  if (board.occupiedIntersections[intersectionId] !== playerId) {
    return { success: false, reason: 'Aucun village à vous sur cette intersection' };
  }

  const buildingId = board.buildingByIntersection[intersectionId];
  const building = buildingId ? state.buildings.get(buildingId) : undefined;
  if (!building || building.definitionId !== 'settlement') {
    return { success: false, reason: 'Une ville doit améliorer un village existant' };
  }
  const cost = applySeasonalBuildCost(state, playerId, 'city', CITY_COST);
  if (!hasResources(player.resources, cost)) {
    return { success: false, reason: 'Ressources insuffisantes' };
  }

  const stock = board.piecesRemaining[playerId];
  if (!stock || stock.cities <= 0) {
    return { success: false, reason: 'Plus de villes disponibles (limite 4)' };
  }

  player.resources = subtractResources(player.resources, cost);
  returnResourcesToBank(state, cost);
  markSeasonalBuildUsed(state, playerId, 'city');

  building.definitionId = 'city';
  building.level = 2;
  // productionTileIds préservés
  registerClassicCityUpgrade(state, playerId, intersectionId, building.id);

  const tileId = building.tileId;
  player.settlements = player.settlements.filter((id) => id !== tileId);
  if (!player.cities.includes(tileId)) player.cities.push(tileId);

  const us = state.extensions?.undergroundSky;
  if (us) {
    for (const airport of us.airports) {
      if (airport.intersectionId === intersectionId && airport.playerId === playerId) {
        airport.suspended = false;
      }
    }
  }

  peOnCityUpgraded(state, intersectionId);

  refreshTrophiesAndVictory(state);
  return { success: true };
}

/** Helper UI : joueur actif pendant le setup classique. */
export function classicSetupActivePlayerId(state: GameState): string | null {
  if (state.phase !== 'setup' || !usesTopologicalPlacement(state)) return null;
  return activeSetupPlayerId(state);
}

function diceWeight(value: number | null): number {
  if (!value) return 0;
  return 6 - Math.abs(7 - value);
}

function intersectionProductionScore(state: GameState, intersectionId: string): number {
  const board = state.classicBoard!;
  const intersection = board.topology.intersections[intersectionId];
  if (!intersection) return 0;
  let score = 0;
  for (const tileId of intersection.tileIds) {
    const tile = state.map.get(tileId);
    if (!tile || tile.terrain === 'desert' || tile.terrain === 'ocean') continue;
    score += diceWeight(tile.diceValue);
    if (tile.port) score += 2;
  }
  return score;
}

/** Candidats village mid-game (intersections légales, scorés). */
export function listClassicSettlementCandidates(
  state: GameState,
  playerId: string,
): Array<{ intersectionId: string; score: number }> {
  if (!usesTopologicalPlacement(state)) return [];
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const out: Array<{ intersectionId: string; score: number }> = [];
  for (const intersectionId of Object.keys(board.topology.intersections)) {
    if (!canPlaceSettlementHere(state, playerId, intersectionId, true)) continue;
    out.push({
      intersectionId,
      score: 60 + intersectionProductionScore(state, intersectionId),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Candidats route mid-game. */
export function listClassicRoadCandidates(
  state: GameState,
  playerId: string,
): Array<{ edgeId: string; score: number }> {
  if (!usesTopologicalPlacement(state)) return [];
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const out: Array<{ edgeId: string; score: number }> = [];
  for (const edgeId of Object.keys(board.topology.edges)) {
    if (!canPlaceRoadHere(state, playerId, edgeId)) continue;
    const edge = board.topology.edges[edgeId]!;
    const score =
      35 +
      (intersectionProductionScore(state, edge.a) + intersectionProductionScore(state, edge.b)) / 2;
    out.push({ edgeId, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Candidats amélioration ville. */
export function listClassicCityCandidates(
  state: GameState,
  playerId: string,
): Array<{ intersectionId: string; score: number }> {
  if (!usesTopologicalPlacement(state)) return [];
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const stock = board.piecesRemaining[playerId];
  if (!stock || stock.cities <= 0) return [];

  const out: Array<{ intersectionId: string; score: number }> = [];
  for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
    if (owner !== playerId) continue;
    const buildingId = board.buildingByIntersection[intersectionId];
    const building = buildingId ? state.buildings.get(buildingId) : undefined;
    if (!building || building.definitionId !== 'settlement') continue;
    out.push({
      intersectionId,
      score: 90 + intersectionProductionScore(state, intersectionId),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export type ClassicTileBuildTarget =
  | { type: 'build_settlement'; intersectionId: string }
  | { type: 'build_road'; edgeId: string }
  | { type: 'upgrade_city'; intersectionId: string };

/**
 * Mappe un clic tuile (UI legacy) vers une commande topologique classique.
 */
export function resolveClassicTileBuild(
  state: GameState,
  playerId: string,
  tileId: string,
  buildingId: 'settlement' | 'city' | 'road',
): ClassicTileBuildTarget | null {
  if (!usesTopologicalPlacement(state)) return null;
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;

  if (buildingId === 'city') {
    const onTile = [...state.buildings.values()].filter(
      (b) =>
        b.ownerId === playerId &&
        b.definitionId === 'settlement' &&
        b.tileId === tileId &&
        b.placementIntersectionId,
    );
    const intersectionId =
      onTile[0]?.placementIntersectionId ??
      Object.entries(board.buildingByIntersection).find(([, bid]) => {
        const b = state.buildings.get(bid);
        return b?.ownerId === playerId && b.definitionId === 'settlement' && b.tileId === tileId;
      })?.[0];
    if (!intersectionId) return null;
    return { type: 'upgrade_city', intersectionId };
  }

  if (buildingId === 'settlement') {
    const candidates = listClassicSettlementCandidates(state, playerId).filter((c) => {
      const intersection = board.topology.intersections[c.intersectionId];
      return intersection?.tileIds.includes(tileId);
    });
    const best = candidates[0];
    return best ? { type: 'build_settlement', intersectionId: best.intersectionId } : null;
  }

  const candidates = listClassicRoadCandidates(state, playerId).filter((c) => {
    const edge = board.topology.edges[c.edgeId];
    if (!edge) return false;
    const a = board.topology.intersections[edge.a];
    const b = board.topology.intersections[edge.b];
    return Boolean(a?.tileIds.includes(tileId) || b?.tileIds.includes(tileId));
  });
  const best = candidates[0] ?? listClassicRoadCandidates(state, playerId)[0];
  return best ? { type: 'build_road', edgeId: best.edgeId } : null;
}

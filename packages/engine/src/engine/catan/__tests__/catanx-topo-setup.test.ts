import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  ensureClassicRuntimeState,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  usesTopologicalPlacement,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';
import {
  classicSetupPlaceRoad,
  classicSetupPlaceSettlement,
  listClassicSettlementCandidates,
} from '../ClassicCommands';
import { intersectionTouchesLand, isClassicLandTerrain } from '../CatanTopology';
import { collectDiceResources } from '../../resources/ResourceSystem';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createCatanXTopoSetup(seed = 80): GameState {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('catanx', { mapSeed: seed, playerCount: 3 });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'human' },
        { name: 'C', civilization: 'scholars', type: 'human' },
      ],
    },
    ctx,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('create failed');

  const state = created.state;
  for (const [, tile] of state.map) {
    tile.owner = null;
    tile.buildings = [];
    tile.road = null;
  }
  for (const [, player] of state.players) {
    player.settlements = [];
    player.cities = [];
    player.ownedTiles = [];
    player.roads = [];
    player.ports = [];
  }
  state.buildings.clear();
  state.units.clear();
  ensureClassicRuntimeState(state);
  state.phase = 'setup';
  state.turnPhase = 'player_action';
  state.setupPlacementIndex = 0;
  state.setupPlayerOrder = [...state.turnOrder, ...[...state.turnOrder].reverse()];
  if (state.classicBoard) {
    state.classicBoard.setupStep = 'settlement';
    state.classicBoard.setupLastIntersectionId = null;
  }
  return state;
}

function firstValidIntersection(state: GameState): string {
  const board = state.classicBoard!;
  for (const intersectionId of Object.keys(board.topology.intersections)) {
    if (!intersectionTouchesLand(board.topology, state.map, intersectionId)) continue;
    if (board.occupiedIntersections[intersectionId]) continue;
    const neighbors = board.topology.intersections[intersectionId]?.neighborIds ?? [];
    if (neighbors.some((id) => board.occupiedIntersections[id])) continue;
    return intersectionId;
  }
  throw new Error('no valid intersection');
}

function firstMultiTileIntersection(state: GameState): string {
  const board = state.classicBoard!;
  for (const [intersectionId, intersection] of Object.entries(board.topology.intersections)) {
    const productiveLand = intersection.tileIds.filter((tileId) => {
      const tile = state.map.get(tileId);
      return tile && isClassicLandTerrain(tile.terrain) && tile.terrain !== 'desert';
    });
    if (productiveLand.length < 2) continue;
    if (board.occupiedIntersections[intersectionId]) continue;
    if (intersection.neighborIds.some((id) => board.occupiedIntersections[id])) continue;
    return intersectionId;
  }
  throw new Error('no multi-tile intersection');
}

function firstValidEdge(state: GameState, intersectionId: string): string {
  const board = state.classicBoard!;
  for (const [edgeId, edge] of Object.entries(board.topology.edges)) {
    if (edge.a !== intersectionId && edge.b !== intersectionId) continue;
    if (!board.roadsByEdge[edgeId]) return edgeId;
  }
  throw new Error('no valid edge');
}

describe('CatanX topological placement', () => {
  it('active usesTopologicalPlacement et crée classicBoard', () => {
    const state = createCatanXTopoSetup(82);
    expect(usesTopologicalPlacement(state)).toBe(true);
    expect(state.classicBoard).toBeTruthy();
    expect(Object.keys(state.classicBoard!.topology.intersections).length).toBeGreaterThan(0);
  });

  it('place village puis route sur intersection / arête', () => {
    const state = createCatanXTopoSetup(83);
    const playerId = state.setupPlayerOrder[0]!;
    const intersectionId = firstValidIntersection(state);

    const settlement = classicSetupPlaceSettlement(playerId, intersectionId, state);
    expect(settlement.success).toBe(true);
    expect(state.classicBoard!.occupiedIntersections[intersectionId]).toBe(playerId);
    expect(state.classicBoard!.setupStep).toBe('road');

    const edgeId = firstValidEdge(state, intersectionId);
    const road = classicSetupPlaceRoad(playerId, edgeId, state);
    expect(road.success).toBe(true);
    expect(state.classicBoard!.roadsByEdge[edgeId]).toBe(playerId);
    expect(state.setupPlacementIndex).toBe(1);
  });

  it('refuse setup_placement tuile en mode standard', () => {
    const ctx = makeContext(84);
    const state = createCatanXTopoSetup(84);
    const playerId = state.setupPlayerOrder[0]!;
    const tileId = [...state.map.keys()][0]!;
    const result = applyCommand(
      state,
      { type: 'setup_placement', playerId, tileId },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('liste des candidats mid-game une fois en playing', () => {
    const state = createCatanXTopoSetup(85);
    // Pose un village + route pour le premier joueur
    const playerId = state.setupPlayerOrder[0]!;
    const intersectionId = firstValidIntersection(state);
    classicSetupPlaceSettlement(playerId, intersectionId, state);
    classicSetupPlaceRoad(playerId, firstValidEdge(state, intersectionId), state);

    state.phase = 'playing';
    state.turnPhase = 'player_action';
    state.currentPlayerIndex = state.turnOrder.indexOf(playerId);
    const candidates = listClassicSettlementCandidates(state, playerId);
    expect(Array.isArray(candidates)).toBe(true);
  });

  it('une colonie reçoit toujours sa ressource malgré une fertilité inférieure à 100 %', () => {
    const state = createCatanXTopoSetup(86);
    const playerId = state.setupPlayerOrder[0]!;
    const intersectionId = firstValidIntersection(state);
    const placed = classicSetupPlaceSettlement(playerId, intersectionId, state);
    expect(placed.success).toBe(true);

    const buildingId = state.classicBoard!.buildingByIntersection[intersectionId]!;
    const building = state.buildings.get(buildingId)!;
    const tileId = building.productionTileIds![0]!;
    for (const [, tile] of state.map) tile.diceValue = 5;
    const tile = state.map.get(tileId)!;
    tile.diceValue = 6;
    tile.robber = false;
    tile.baseProduction = { wheat: 1 };
    tile.fertility = 80;
    tile.pollution = 0;

    const result = collectDiceResources(6, state, { skipBank: true });
    expect(result.find((entry) => entry.playerId === playerId)?.resources.wheat).toBe(1);
  });

  it('reconstruit les hexagones adjacents depuis l’intersection pour une ancienne sauvegarde', () => {
    const state = createCatanXTopoSetup(87);
    const playerId = state.setupPlayerOrder[0]!;
    const intersectionId = firstMultiTileIntersection(state);
    const placed = classicSetupPlaceSettlement(playerId, intersectionId, state);
    expect(placed.success).toBe(true);

    const buildingId = state.classicBoard!.buildingByIntersection[intersectionId]!;
    const building = state.buildings.get(buildingId)!;
    const targetTileId = building.productionTileIds!.find((id) => id !== building.tileId)!;
    // Simule une sauvegarde legacy ne connaissant que la tuile d’ancrage.
    building.productionTileIds = [building.tileId];
    for (const [, tile] of state.map) tile.diceValue = 5;
    const target = state.map.get(targetTileId)!;
    target.diceValue = 8;
    target.robber = false;
    target.baseProduction = { wood: 1 };
    target.fertility = 60;
    target.pollution = 50;

    const result = collectDiceResources(8, state, { skipBank: true });
    expect(result.find((entry) => entry.playerId === playerId)?.resources.wood).toBe(1);
  });
});

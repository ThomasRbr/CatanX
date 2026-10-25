import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  chooseClassicSetupEdge,
  chooseClassicSetupIntersection,
  listClassicRoadCandidates,
  listClassicCityCandidates,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createClassicGame(seed = 42): { state: GameState; ctx: ReturnType<typeof makeContext> } {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', { mapSeed: seed, playerCount: 2 });
  const result = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'ai' },
      ],
    },
    ctx,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('create failed');
  return { state: result.state, ctx };
}

describe('ClassicCommands — setup topologique autoritaire', () => {
  it('place village puis route et avance le serpent', () => {
    const { state, ctx } = createClassicGame(3);
    expect(state.phase).toBe('setup');
    expect(state.classicBoard?.setupStep).toBe('settlement');

    const playerId = state.setupPlayerOrder[0];
    const setupCtx = {
      topology: state.classicBoard!.topology,
      occupiedIntersections: state.classicBoard!.occupiedIntersections,
      anchorUsageByTile: state.classicBoard!.anchorUsageByTile,
      anchorIntersectionId: null as string | null,
      roadsByEdge: state.classicBoard!.roadsByEdge,
    };
    const intersectionId = chooseClassicSetupIntersection(state, setupCtx);
    expect(intersectionId).toBeTruthy();

    const settle = applyCommand(
      state,
      { type: 'setup_place_settlement', playerId, intersectionId: intersectionId! },
      ctx,
    );
    expect(settle.ok).toBe(true);
    if (!settle.ok) return;
    expect(settle.state.classicBoard?.setupStep).toBe('road');
    expect(settle.state.classicBoard?.occupiedIntersections[intersectionId!]).toBe(playerId);
    expect(settle.state.classicBoard?.piecesRemaining[playerId].settlements).toBe(4);

    const roadCtx = {
      ...setupCtx,
      occupiedIntersections: settle.state.classicBoard!.occupiedIntersections,
      anchorIntersectionId: intersectionId!,
      roadsByEdge: settle.state.classicBoard!.roadsByEdge,
    };
    const edgeId = chooseClassicSetupEdge(settle.state, roadCtx);
    expect(edgeId).toBeTruthy();

    const road = applyCommand(
      settle.state,
      { type: 'setup_place_road', playerId, edgeId: edgeId! },
      ctx,
    );
    expect(road.ok).toBe(true);
    if (!road.ok) return;
    expect(road.state.setupPlacementIndex).toBe(1);
    expect(road.state.classicBoard?.setupStep).toBe('settlement');
    expect(road.state.classicBoard?.roadsByEdge[edgeId!]).toBe(playerId);
  });

  it('rejette setup_placement tuile en mode classique', () => {
    const { state, ctx } = createClassicGame(5);
    const playerId = state.setupPlayerOrder[0];
    const tileId = [...state.map.keys()][0];
    const result = applyCommand(
      state,
      { type: 'setup_placement', playerId, tileId },
      ctx,
    );
    expect(result.ok).toBe(false);
  });
});

describe('ClassicCommands — constructions mid-game', () => {
  it('construit route et améliore en ville via commandes topologiques', () => {
    const { state: initial, ctx } = createClassicGame(7);
    autoCompleteClassicSetup(initial);
    let state = initial;
    expect(state.phase).toBe('playing');

    const playerId = state.turnOrder[0];
    const player = state.players.get(playerId)!;
    state.turnPhase = 'player_action';
    state.currentPlayerIndex = state.turnOrder.indexOf(playerId);
    player.resources = {
      ...player.resources,
      wood: 10,
      clay: 10,
      wheat: 10,
      sheep: 10,
      ore: 10,
    };

    const roadCandidate = listClassicRoadCandidates(state, playerId)[0];
    expect(roadCandidate).toBeTruthy();
    const road = applyCommand(
      state,
      { type: 'build_road', playerId, edgeId: roadCandidate!.edgeId },
      ctx,
    );
    expect(road.ok).toBe(true);
    if (!road.ok) return;
    state = road.state;
    expect(state.classicBoard?.roadsByEdge[roadCandidate!.edgeId]).toBe(playerId);
    expect(state.players.get(playerId)!.roads.length).toBeGreaterThan(0);

    const cityCandidate = listClassicCityCandidates(state, playerId)[0];
    expect(cityCandidate).toBeTruthy();
    const city = applyCommand(
      state,
      { type: 'upgrade_city', playerId, intersectionId: cityCandidate!.intersectionId },
      ctx,
    );
    expect(city.ok).toBe(true);
    if (!city.ok) return;
    const buildingId =
      city.state.classicBoard!.buildingByIntersection[cityCandidate!.intersectionId];
    expect(city.state.buildings.get(buildingId!)?.definitionId).toBe('city');
  });

  it('échoue build_road sur une arête déjà occupée', () => {
    const { state, ctx } = createClassicGame(9);
    const playerId = state.setupPlayerOrder[0];
    const setupCtx = {
      topology: state.classicBoard!.topology,
      occupiedIntersections: state.classicBoard!.occupiedIntersections,
      anchorUsageByTile: state.classicBoard!.anchorUsageByTile,
      anchorIntersectionId: null as string | null,
      roadsByEdge: state.classicBoard!.roadsByEdge,
    };
    const intersectionId = chooseClassicSetupIntersection(state, setupCtx)!;
    const settle = applyCommand(
      state,
      { type: 'setup_place_settlement', playerId, intersectionId },
      ctx,
    );
    expect(settle.ok).toBe(true);
    if (!settle.ok) return;
    const edgeId = chooseClassicSetupEdge(settle.state, {
      ...setupCtx,
      occupiedIntersections: settle.state.classicBoard!.occupiedIntersections,
      anchorIntersectionId: intersectionId,
      roadsByEdge: settle.state.classicBoard!.roadsByEdge,
    })!;
    const road = applyCommand(
      settle.state,
      { type: 'setup_place_road', playerId, edgeId },
      ctx,
    );
    expect(road.ok).toBe(true);
    if (!road.ok) return;

    road.state.phase = 'playing';
    road.state.turnPhase = 'player_action';
    road.state.currentPlayerIndex = road.state.turnOrder.indexOf(playerId);
    const player = road.state.players.get(playerId)!;
    player.resources = { ...player.resources, wood: 5, clay: 5 };
    const dup = applyCommand(road.state, { type: 'build_road', playerId, edgeId }, ctx);
    expect(dup.ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createGame,
  chooseUndergroundSkyAction,
  defaultUndergroundSkyConfig,
  nearestSkyHubsForIntersection,
  createClassicBoardState,
} from '@catanx/engine';
import type { GameConfig } from '../../../types/game';

function usConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    mode: 'standard',
    mapSize: 'tiny',
    mapSeed: 42,
    playerCount: 4,
    victoryConditions: ['points'],
    victoryPointTarget: 10,
    maxTurns: 0,
    enableSeasons: false,
    enableEvents: false,
    enableDiplomacy: false,
    enableMilitary: false,
    enableTechTree: false,
    enableProductionChains: false,
    fogOfWar: false,
    startingResources: 'none',
    barbarianStrength: {
      enabled: false,
      spawnRate: 0,
      strength: 0,
      scaling: false,
      navalBarbarians: false,
    },
    worldCouncil: false,
    difficultyModifier: 1,
    extensions: {
      undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
    },
    ...overrides,
  };
}

const players = [
  { name: 'A', civilization: 'empire' as const, type: 'human' as const },
  { name: 'B', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'C', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'D', civilization: 'empire' as const, type: 'ai' as const },
];

describe('chooseUndergroundSkyAction', () => {
  it('résout en priorité une thermale en attente', () => {
    const state = createGame(usConfig(), players);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources.wheat = 0;
    player.resources.sheep = 3;
    const us = state.extensions!.undergroundSky!;
    us.pendingResolutions.push({
      kind: 'thermal_output',
      playerId,
      outpostId: 'out_1',
      nodeId: 'node_1',
    });

    const cmd = chooseUndergroundSkyAction(state, playerId, { difficulty: 'hard' });
    expect(cmd?.type).toBe('us_choose_thermal_output');
    if (cmd?.type === 'us_choose_thermal_output') {
      expect(cmd.resource).toBe('wheat');
    }
  });

  it('propose une action US productive avec stock élevé', () => {
    const state = createGame(usConfig(), players);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 4, clay: 4, wheat: 4, sheep: 4, ore: 4 };
    const us = state.extensions!.undergroundSky!;
    // Bootstraper un puits pour débloquer prospection / tunnels
    const entryNodeId = Object.keys(us.undergroundGraph.nodes)[0]!;
    us.shafts.push({
      id: 'shaft1',
      playerId,
      intersectionId: 'i_boot',
      entryNodeId,
    });
    us.revealedUndergroundNodeIds.push(entryNodeId);

    const cmd = chooseUndergroundSkyAction(state, playerId, { difficulty: 'legendary' });
    expect(cmd).not.toBeNull();
    expect(
      [
        'us_survey_cavern',
        'us_build_tunnel',
        'us_build_outpost',
        'us_build_airport',
        'us_build_airship',
        'us_build_beacon',
        'us_complete_contract',
        'us_dispatch_airship',
        'us_build_shaft',
        'us_upgrade_extractor',
        'us_build_lift',
      ].includes(cmd!.type),
    ).toBe(true);
  });

  it('décharge un dirigeable amarré avec cargaison', () => {
    const state = createGame(usConfig(), players);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 0, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    const us = state.extensions!.undergroundSky!;
    us.airports.push({
      id: 'ap1',
      playerId,
      intersectionId: 'i1',
      suspended: false,
    });
    const hubId = Object.keys(us.skyGraph.hubs)[0]!;
    us.airships.push({
      id: 'ship1',
      playerId,
      airportId: 'ap1',
      capacity: 3,
      moveBudget: 2,
      etherSails: false,
      reinforcedHold: false,
      cargo: [{ kind: 'resource', key: 'wheat', amount: 2 }],
      route: null,
      currentHubId: hubId,
    });

    const cmd = chooseUndergroundSkyAction(state, playerId, { difficulty: 'hard' });
    expect(cmd?.type).toBe('us_unload_airship');
    if (cmd?.type === 'us_unload_airship') {
      expect(cmd.airshipId).toBe('ship1');
    }
  });

  it('ne propose pas de déchargement hors aéroport', () => {
    const state = createGame(usConfig(), players);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 0, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    const us = state.extensions!.undergroundSky!;
    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    const board = state.classicBoard;
    const intersectionId = Object.keys(board.topology.intersections)[0]!;
    us.airports.push({
      id: 'ap1',
      playerId,
      intersectionId,
      suspended: false,
    });
    const homeHubs = nearestSkyHubsForIntersection(state, intersectionId, 2);
    const awayHub = Object.keys(us.skyGraph.hubs).find((id) => !homeHubs.includes(id));
    expect(homeHubs.length).toBeGreaterThan(0);
    expect(awayHub).toBeTruthy();
    us.airships.push({
      id: 'ship1',
      playerId,
      airportId: 'ap1',
      capacity: 3,
      moveBudget: 2,
      etherSails: false,
      reinforcedHold: false,
      cargo: [{ kind: 'resource', key: 'wheat', amount: 2 }],
      route: null,
      currentHubId: awayHub!,
    });

    const cmd = chooseUndergroundSkyAction(state, playerId, { difficulty: 'legendary' });
    expect(cmd?.type).not.toBe('us_unload_airship');
  });

  it('ne propose pas de contrat sans dirigeable / soute', () => {
    const state = createGame(usConfig(), players);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 4, clay: 4, wheat: 4, sheep: 4, ore: 4 };
    // Pas d’aéroport / dirigeable → pas de complete_contract
    const cmd = chooseUndergroundSkyAction(state, playerId, { difficulty: 'legendary' });
    expect(cmd?.type).not.toBe('us_complete_contract');
  });

  it('ne softlock pas : easy peut renvoyer null hors pending', () => {
    const state = createGame(usConfig(), players);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 0, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    const cmd = chooseUndergroundSkyAction(state, playerId, { difficulty: 'easy' });
    expect(cmd).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createDefaultEngineContext,
  decideClassicAI,
  decideCitiesKnightsAction,
  runHeadlessSimulation,
  runHeadlessBatch,
  createEmptyBalanceMetrics,
  mergeSimulationIntoMetrics,
  summarizeMetrics,
} from '@catanx/engine';

const CK_EXT = {
  citiesKnights: {
    enabled: true as const,
    ruleset: 'catanx-essential-v1' as const,
    victoryPointBonus: 3 as const,
    adaptiveBarbarianTrack: true as const,
  },
};

describe('CitiesKnightsAI', () => {
  it('active un chevalier dormant quand la défense est urgente', () => {
    const ctx = createDefaultEngineContext(201);
    const config = buildGameConfigFromPreset('classic', {
      mapSeed: 201,
      playerCount: 2,
      extensions: CK_EXT,
    });
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
          { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.state;
    autoCompleteClassicSetup(state);
    state.turnPhase = 'player_action';
    state.currentPlayerIndex = 0;
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { ...player.resources, wheat: 2, ore: 2, sheep: 2 };
    const ck = state.extensions!.citiesKnights!;
    ck.barbarianTrackPosition = Math.max(0, ck.barbarianTrackLength - 1);
    const board = state.classicBoard!;
    let spot: string | null = null;
    for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== playerId) continue;
      const edge = board.topology.edges[edgeId];
      if (!edge) continue;
      for (const id of [edge.a, edge.b]) {
        if (!board.occupiedIntersections[id] && !ck.knights.some((k) => k.intersectionId === id)) {
          spot = id;
          break;
        }
      }
      if (spot) break;
    }
    expect(spot).toBeTruthy();
    ck.knights.push({
      id: 'ck-ai-1',
      ownerId: playerId,
      rank: 1,
      activated: false,
      intersectionId: spot!,
      activatedThisTurn: false,
      promotedThisTurn: false,
    });

    const decision = decideCitiesKnightsAction(state, playerId, { difficulty: 'medium' });
    expect(decision?.command.type).toBe('ck_activate_knight');
  });

  it('ne propose pas de promotion sans stock', () => {
    const ctx = createDefaultEngineContext(203);
    const config = buildGameConfigFromPreset('classic', {
      mapSeed: 203,
      playerCount: 2,
      extensions: CK_EXT,
    });
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
          { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.state;
    autoCompleteClassicSetup(state);
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wheat: 0, ore: 5, sheep: 5, wood: 0, clay: 0 };
    const ck = state.extensions!.citiesKnights!;
    ck.barbarianTrackPosition = ck.barbarianTrackLength - 1;
    ck.knightStocks[playerId] = { basic: 0, strong: 0, mighty: 0 };
    const board = state.classicBoard!;
    let spot: string | null = null;
    for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== playerId) continue;
      const edge = board.topology.edges[edgeId];
      if (!edge) continue;
      for (const id of [edge.a, edge.b]) {
        if (!board.occupiedIntersections[id]) {
          spot = id;
          break;
        }
      }
      if (spot) break;
    }
    ck.knights.push({
      id: 'ck-no-stock',
      ownerId: playerId,
      rank: 1,
      activated: true,
      intersectionId: spot!,
      activatedThisTurn: false,
      promotedThisTurn: false,
    });

    const decision = decideCitiesKnightsAction(state, playerId, { difficulty: 'medium' });
    expect(decision?.command.type).not.toBe('ck_promote_knight');
    expect(decision?.command.type).not.toBe('ck_recruit_knight');
  });

  it('propose une action C&K ou classique via decideClassicAI', () => {
    const ctx = createDefaultEngineContext(202);
    const config = buildGameConfigFromPreset('classic', {
      mapSeed: 202,
      playerCount: 2,
      extensions: CK_EXT,
    });
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'legendary' },
          { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'easy' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.state;
    autoCompleteClassicSetup(state);
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = {
      wood: 5,
      clay: 5,
      wheat: 5,
      sheep: 5,
      ore: 5,
    };
    const decision = decideClassicAI(state, playerId, { difficulty: 'legendary' });
    expect(decision?.kind).toBe('command');
    if (!decision || decision.kind !== 'command') return;
    expect([
      'ck_recruit_knight',
      'ck_activate_knight',
      'ck_promote_knight',
      'ck_improve_urban',
      'ck_build_wall',
      'ck_play_progress',
      'build_road',
      'build_settlement',
      'upgrade_city',
      'bank_trade',
      'end_turn',
    ]).toContain(decision.command.type);
  });
});

describe('C&K compatibility matrix (headless)', () => {
  const base = {
    maxTurns: 45,
    maxSteps: 1200,
    aiDifficulty: 'easy' as const,
    extensions: CK_EXT,
  };

  const cases: Array<{
    name: string;
    playerCount: number;
    mapSize?: 'tiny' | 'medium';
    modules?: Record<string, boolean>;
    maxSteps?: number;
  }> = [
    { name: '2p tiny', playerCount: 2, mapSize: 'tiny' },
    { name: '4p tiny', playerCount: 4, mapSize: 'tiny' },
    { name: '2p medium', playerCount: 2, mapSize: 'medium', maxSteps: 2000 },
    { name: '2p + seasons', playerCount: 2, mapSize: 'tiny', modules: {} },
    { name: '2p + events', playerCount: 2, mapSize: 'tiny', modules: { events: true } },
    {
      name: '2p + fog',
      playerCount: 2,
      mapSize: 'tiny',
      modules: { fogOfWar: true },
    },
  ];

  for (const c of cases) {
    it(`ne bloque pas : ${c.name}`, () => {
      const result = runHeadlessSimulation({
        seed: 310 + c.playerCount + (c.mapSize === 'medium' ? 17 : 0),
        playerCount: c.playerCount,
        mapSize: c.mapSize,
        modules: c.modules,
        ...base,
        maxSteps: c.maxSteps ?? base.maxSteps,
      });
      expect(result.blocked).toBe(false);
      expect(result.steps).toBeGreaterThan(10);
      expect(result.turns).toBeGreaterThan(1);
    });
  }

  it('lot 2p C&K : taux de blocage bas', () => {
    const batch = runHeadlessBatch([401, 402, 403], {
      playerCount: 2,
      mapSize: 'tiny',
      ...base,
    });
    let metrics = createEmptyBalanceMetrics();
    for (const game of batch) {
      metrics = mergeSimulationIntoMetrics(metrics, game);
    }
    const summary = summarizeMetrics(metrics);
    expect(metrics.gamesPlayed).toBe(3);
    expect(summary.blockRate).toBeLessThanOrEqual(0.34);
  });
});

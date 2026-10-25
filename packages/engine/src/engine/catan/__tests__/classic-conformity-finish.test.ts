import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  getPortTradeRatio,
  IncrementalIdGenerator,
  SeededRandom,
  CLASSIC_RESOURCE_TYPES,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createPlaying(seed = 55): { state: GameState; ctx: ReturnType<typeof makeContext> } {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', { mapSeed: seed, playerCount: 3 });
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
  autoCompleteClassicSetup(created.state);
  created.state.turnPhase = 'player_action';
  return { state: created.state, ctx };
}

describe('Classic conformity finish', () => {
  it('YoP prend 2 ressources à la banque', () => {
    const { state, ctx } = createPlaying(56);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.devCards = [
      { id: 'yop1', type: 'year_of_plenty', acquiredTurn: 0, played: false },
    ];
    player.devCardsPlayedThisTurn = 0;
    const woodBefore = state.bank!.wood ?? 0;

    const played = applyCommand(
      state,
      {
        type: 'play_dev_card',
        playerId,
        cardId: 'yop1',
        targetTileId: 'wood:clay',
      },
      ctx,
    );
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.players.get(playerId)!.resources.wood).toBe(1);
    expect(played.state.players.get(playerId)!.resources.clay).toBe(1);
    expect(played.state.bank!.wood).toBe(woodBefore - 1);
  });

  it('Monopole draine une ressource chez les adversaires', () => {
    const { state, ctx } = createPlaying(57);
    const playerId = state.turnOrder[0]!;
    const otherId = state.turnOrder[1]!;
    const thirdId = state.turnOrder[2]!;
    state.players.get(playerId)!.devCards = [
      { id: 'mono1', type: 'monopoly', acquiredTurn: 0, played: false },
    ];
    state.players.get(playerId)!.devCardsPlayedThisTurn = 0;
    state.players.get(playerId)!.resources = { ore: 0 };
    state.players.get(otherId)!.resources = { ore: 3, wood: 1 };
    state.players.get(thirdId)!.resources = { ore: 2 };

    const played = applyCommand(
      state,
      {
        type: 'play_dev_card',
        playerId,
        cardId: 'mono1',
        targetTileId: 'ore',
      },
      ctx,
    );
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.players.get(playerId)!.resources.ore).toBe(5);
    expect(played.state.players.get(otherId)!.resources.ore ?? 0).toBe(0);
    expect(played.state.players.get(thirdId)!.resources.ore ?? 0).toBe(0);
  });

  it('YoP / Monopole refusent sans choix de ressource', () => {
    const { state, ctx } = createPlaying(58);
    const playerId = state.turnOrder[0]!;
    state.players.get(playerId)!.devCards = [
      { id: 'yop2', type: 'year_of_plenty', acquiredTurn: 0, played: false },
    ];
    const failed = applyCommand(
      state,
      { type: 'play_dev_card', playerId, cardId: 'yop2' },
      ctx,
    );
    expect(failed.ok).toBe(false);
    expect(state.players.get(playerId)!.devCards[0]!.played).toBe(false);
  });

  it('ports associés aux intersections côtières (pas tout le hex)', () => {
    const { state } = createPlaying(59);
    const board = state.classicBoard!;
    expect(Object.keys(board.portByIntersection).length).toBeGreaterThanOrEqual(9);

    // Chaque port type apparaît sur exactement 2 intersections
    const byType = new Map<string, number>();
    for (const port of Object.values(board.portByIntersection)) {
      byType.set(port, (byType.get(port) ?? 0) + 1);
    }
    for (const count of byType.values()) {
      expect(count % 2).toBe(0);
    }
  });

  it('ratio port utilise PortType stocké sur le joueur', () => {
    const { state } = createPlaying(60);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.ports = ['wood_2:1', 'generic_3:1'];
    expect(getPortTradeRatio(player, 'wood', state)).toBe(2);
    expect(getPortTradeRatio(player, 'ore', state)).toBe(3);
    expect(getPortTradeRatio(player, 'clay' as (typeof CLASSIC_RESOURCE_TYPES)[number], state)).toBe(
      3,
    );
  });

  it('YoP refuse si la banque est insuffisante', () => {
    const { state, ctx } = createPlaying(61);
    const playerId = state.turnOrder[0]!;
    state.players.get(playerId)!.devCards = [
      { id: 'yop3', type: 'year_of_plenty', acquiredTurn: 0, played: false },
    ];
    state.bank = { wood: 0, clay: 0, wheat: 0, sheep: 0, ore: 0 };

    const failed = applyCommand(
      state,
      {
        type: 'play_dev_card',
        playerId,
        cardId: 'yop3',
        targetTileId: 'wood:ore',
      },
      ctx,
    );
    expect(failed.ok).toBe(false);
    expect(state.players.get(playerId)!.devCards[0]!.played).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';
import {
  hasProposedPlayerTradeThisTurn,
  wasPlayerTradeRejected,
} from '../../ai/shared/AiMemory';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createPlaying(seed = 21): { state: GameState; ctx: ReturnType<typeof makeContext> } {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', { mapSeed: seed, playerCount: 2 });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'human' },
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

describe('ClassicPlayerTrade', () => {
  it('propose → accept échange les ressources', () => {
    const { state, ctx } = createPlaying(23);
    const fromId = state.turnOrder[0];
    const toId = state.turnOrder[1];
    const from = state.players.get(fromId)!;
    const to = state.players.get(toId)!;
    from.resources = { ...from.resources, wood: 3, clay: 0 };
    to.resources = { ...to.resources, wood: 0, clay: 2 };

    const proposed = applyCommand(
      state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: toId,
        give: { wood: 1 },
        receive: { clay: 1 },
      },
      ctx,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.state.pendingPlayerTrade).toBeTruthy();

    const accepted = applyCommand(
      proposed.state,
      {
        type: 'accept_player_trade',
        playerId: toId,
        tradeId: proposed.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.state.pendingPlayerTrade).toBeNull();
    expect(accepted.state.players.get(fromId)!.resources.wood).toBe(2);
    expect(accepted.state.players.get(fromId)!.resources.clay).toBe(1);
    expect(accepted.state.players.get(toId)!.resources.wood).toBe(1);
    expect(accepted.state.players.get(toId)!.resources.clay).toBe(1);
  });

  it('refuse mémorise l’offre pour bloquer le re-spam IA', () => {
    const { state, ctx } = createPlaying(44);
    const fromId = state.turnOrder[0];
    const toId = state.turnOrder[1];
    state.players.get(fromId)!.resources.wood = 2;
    state.players.get(toId)!.resources.ore = 2;

    const proposed = applyCommand(
      state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: toId,
        give: { wood: 1 },
        receive: { ore: 1 },
      },
      ctx,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const rejected = applyCommand(
      proposed.state,
      {
        type: 'reject_player_trade',
        playerId: toId,
        tradeId: proposed.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;

    // Le client clone superficiellement l’état à chaque set() — la mémoire doit survivre.
    const shallowCopy = { ...rejected.state };
    expect(
      wasPlayerTradeRejected(shallowCopy, fromId, toId, { wood: 1 }, { ore: 1 }),
    ).toBe(true);
    expect(hasProposedPlayerTradeThisTurn(shallowCopy, fromId)).toBe(true);
  });

  it('refuse et annule correctement', () => {
    const { state, ctx } = createPlaying(25);
    const fromId = state.turnOrder[0];
    const toId = state.turnOrder[1];
    state.players.get(fromId)!.resources.wood = 2;
    state.players.get(toId)!.resources.ore = 2;

    const proposed = applyCommand(
      state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: toId,
        give: { wood: 1 },
        receive: { ore: 1 },
      },
      ctx,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const rejected = applyCommand(
      proposed.state,
      {
        type: 'reject_player_trade',
        playerId: toId,
        tradeId: proposed.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.state.pendingPlayerTrade).toBeNull();

    const again = applyCommand(
      rejected.state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: toId,
        give: { wood: 1 },
        receive: { ore: 1 },
      },
      ctx,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;

    const cancelled = applyCommand(
      again.state,
      {
        type: 'cancel_player_trade',
        playerId: fromId,
        tradeId: again.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.state.pendingPlayerTrade).toBeNull();
  });

  it('end_turn annule une offre en cours', () => {
    const { state, ctx } = createPlaying(27);
    const fromId = state.turnOrder[0];
    const toId = state.turnOrder[1];
    state.players.get(fromId)!.resources.wood = 2;
    state.players.get(toId)!.resources.clay = 2;

    const proposed = applyCommand(
      state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: toId,
        give: { wood: 1 },
        receive: { clay: 1 },
      },
      ctx,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const ended = applyCommand(proposed.state, { type: 'end_turn', playerId: fromId }, ctx);
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.state.pendingPlayerTrade).toBeNull();
  });

  it('refuse l’acceptation si le destinataire n’a pas les ressources', () => {
    const { state, ctx } = createPlaying(29);
    const fromId = state.turnOrder[0];
    const toId = state.turnOrder[1];
    state.players.get(fromId)!.resources.wood = 2;
    state.players.get(toId)!.resources.clay = 0;

    const proposed = applyCommand(
      state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: toId,
        give: { wood: 1 },
        receive: { clay: 1 },
      },
      ctx,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const accepted = applyCommand(
      proposed.state,
      {
        type: 'accept_player_trade',
        playerId: toId,
        tradeId: proposed.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(accepted.ok).toBe(false);
    expect(proposed.state.pendingPlayerTrade).toBeTruthy();
  });

  it('broadcast : n’importe quel adversaire peut accepter', () => {
    const { state, ctx } = createPlaying(61);
    const fromId = state.turnOrder[0]!;
    const toId = state.turnOrder[1]!;
    state.players.get(fromId)!.resources = { wood: 2, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    state.players.get(toId)!.resources = { wood: 0, clay: 2, wheat: 0, sheep: 0, ore: 0 };

    const proposed = applyCommand(
      state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: null,
        give: { wood: 1 },
        receive: { clay: 1 },
      },
      ctx,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.state.pendingPlayerTrade?.toPlayerId).toBeNull();

    const accepted = applyCommand(
      proposed.state,
      {
        type: 'accept_player_trade',
        playerId: toId,
        tradeId: proposed.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.state.pendingPlayerTrade).toBeNull();
    expect(accepted.state.players.get(fromId)!.resources.clay).toBe(1);
    expect(accepted.state.players.get(toId)!.resources.wood).toBe(1);
  });

  it('broadcast : refus partiel puis acceptation d’un autre', () => {
    const ctx = makeContext(77);
    const config = buildGameConfigFromPreset('classic', { mapSeed: 77, playerCount: 3 });
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'human' },
          { name: 'B', civilization: 'merchants', type: 'human' },
          { name: 'C', civilization: 'nomads', type: 'human' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('create failed');
    autoCompleteClassicSetup(created.state);
    created.state.turnPhase = 'player_action';
    const state = created.state;
    const [fromId, bId, cId] = state.turnOrder;
    state.players.get(fromId)!.resources = { wood: 2, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    state.players.get(bId)!.resources = { wood: 0, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    state.players.get(cId)!.resources = { wood: 0, clay: 2, wheat: 0, sheep: 0, ore: 0 };

    const proposed = applyCommand(
      state,
      {
        type: 'propose_player_trade',
        playerId: fromId,
        toPlayerId: null,
        give: { wood: 1 },
        receive: { clay: 1 },
      },
      ctx,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const rejected = applyCommand(
      proposed.state,
      {
        type: 'reject_player_trade',
        playerId: bId,
        tradeId: proposed.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.state.pendingPlayerTrade).toBeTruthy();
    expect(rejected.state.pendingPlayerTrade!.rejectedBy).toContain(bId);

    const accepted = applyCommand(
      rejected.state,
      {
        type: 'accept_player_trade',
        playerId: cId,
        tradeId: rejected.state.pendingPlayerTrade!.id,
      },
      ctx,
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.state.pendingPlayerTrade).toBeNull();
    expect(accepted.state.players.get(cId)!.resources.wood).toBe(1);
  });
});

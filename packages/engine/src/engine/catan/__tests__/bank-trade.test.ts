import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  maybeAcknowledgeCollection,
  hasCkCollectionBlockers,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createPlaying(
  preset: 'classic' | 'catanx',
  seed: number,
  withCk = false,
): { state: GameState; ctx: ReturnType<typeof makeContext> } {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset(preset, {
    mapSeed: seed,
    playerCount: 2,
    extensions: withCk
      ? {
          citiesKnights: {
            enabled: true,
            ruleset: 'catanx-essential-v1',
            victoryPointBonus: 3,
            adaptiveBarbarianTrack: true,
          },
        }
      : undefined,
  });
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
  created.state.phase = 'playing';
  created.state.turnPhase = 'player_action';
  return { state: created.state, ctx };
}

describe('bank_trade', () => {
  it('échange 4:1 classique', () => {
    const { state, ctx } = createPlaying('classic', 101);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 4, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    const bankOreBefore = state.bank!.ore ?? 0;
    const bankWoodBefore = state.bank!.wood ?? 0;

    const result = applyCommand(
      state,
      { type: 'bank_trade', playerId, give: { wood: 4 }, receive: { ore: 1 } },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.get(playerId)!.resources.wood ?? 0).toBe(0);
    expect(result.state.players.get(playerId)!.resources.ore ?? 0).toBe(1);
    expect(result.state.bank!.ore).toBe(bankOreBefore - 1);
    expect(result.state.bank!.wood).toBe(bankWoodBefore + 4);
  });

  it('échange 4:1 CatanX + C&K', () => {
    const { state, ctx } = createPlaying('catanx', 102, true);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 4, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    expect(state.bank).toBeTruthy();

    const result = applyCommand(
      state,
      { type: 'bank_trade', playerId, give: { wood: 4 }, receive: { ore: 1 } },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.log(result.error);
      return;
    }
    expect(result.state.players.get(playerId)!.resources.ore ?? 0).toBe(1);
  });

  it('applique le ratio port 3:1', () => {
    const { state, ctx } = createPlaying('classic', 103);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.ports = ['generic_3:1'];
    player.resources = { wood: 3, clay: 0, wheat: 0, sheep: 0, ore: 0 };

    const bad = applyCommand(
      state,
      { type: 'bank_trade', playerId, give: { wood: 4 }, receive: { ore: 1 } },
      ctx,
    );
    expect(bad.ok).toBe(false);

    const ok = applyCommand(
      state,
      { type: 'bank_trade', playerId, give: { wood: 3 }, receive: { ore: 1 } },
      ctx,
    );
    expect(ok.ok).toBe(true);
  });

  it('refuse hors phase player_action', () => {
    const { state, ctx } = createPlaying('classic', 104);
    const playerId = state.turnOrder[0]!;
    state.turnPhase = 'resource_collect';
    state.players.get(playerId)!.resources = { wood: 4 };

    const result = applyCommand(
      state,
      { type: 'bank_trade', playerId, give: { wood: 4 }, receive: { ore: 1 } },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('échange ressource → marchandise C&K (receive vide + receiveCommodities)', () => {
    const { state, ctx } = createPlaying('catanx', 106, true);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.ports = [];
    player.resources = { wood: 4, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    const ck = state.extensions!.citiesKnights!;
    ck.commodityBank.ck_cloth = 5;
    ck.merchant = { tileId: null, ownerId: null };
    const clothBefore = ck.playerCommodities[playerId]?.ck_cloth ?? 0;

    // Sans marchandises : doit échouer clairement (bug AI silencieux avant fix client)
    const stripped = applyCommand(
      state,
      { type: 'bank_trade', playerId, give: { wood: 4 }, receive: {} },
      ctx,
    );
    expect(stripped.ok).toBe(false);
    if (!stripped.ok) {
      expect(stripped.error.message).toMatch(/1 type/);
    }

    const result = applyCommand(
      state,
      {
        type: 'bank_trade',
        playerId,
        give: { wood: 4 },
        receive: {},
        receiveCommodities: { ck_cloth: 1 },
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.get(playerId)!.resources.wood ?? 0).toBe(0);
    expect(result.state.extensions!.citiesKnights!.playerCommodities[playerId]?.ck_cloth ?? 0).toBe(
      clothBefore + 1,
    );
  });
});

describe('collection softlock C&K', () => {
  it('avance en player_action après résolution Aqueduc pendant resource_collect', () => {
    const { state, ctx } = createPlaying('catanx', 105, true);
    const playerId = state.turnOrder[0]!;
    state.turnPhase = 'resource_collect';
    const ck = state.extensions!.citiesKnights!;
    ck.pendingResolutions.push({
      id: 'aq-1',
      kind: 'aqueduct',
      playerId,
      data: { turn: state.currentTurn },
    });
    expect(hasCkCollectionBlockers(state)).toBe(true);
    expect(maybeAcknowledgeCollection(state)).toBe(false);
    expect(state.turnPhase).toBe('resource_collect');

    const result = applyCommand(
      state,
      { type: 'ck_aqueduct_choose', playerId, resource: 'ore' },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hasCkCollectionBlockers(result.state)).toBe(false);
    expect(result.state.turnPhase).toBe('player_action');
  });
});

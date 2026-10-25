import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  getPortTradeRatio,
  grantPortsAdjacentToTile,
  hexAllNeighbors,
  hexToId,
  IncrementalIdGenerator,
  SeededRandom,
  usesLimitedBank,
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

function createCatanX(seed = 70): { state: GameState; ctx: ReturnType<typeof makeContext> } {
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
  created.state.phase = 'playing';
  created.state.turnPhase = 'player_action';
  return { state: created.state, ctx };
}

describe('CatanX bank / ports / YoP', () => {
  it('initialise une banque limitée en mode standard', () => {
    const { state } = createCatanX(71);
    expect(usesLimitedBank(state)).toBe(true);
    expect(state.bank).toBeTruthy();
    for (const res of CLASSIC_RESOURCE_TYPES) {
      expect(state.bank![res]).toBeGreaterThanOrEqual(19);
    }
  });

  it('YoP débite la banque et refuse si stock insuffisant', () => {
    const { state, ctx } = createCatanX(72);
    const playerId = state.turnOrder[0]!;
    state.players.get(playerId)!.devCards = [
      { id: 'yop-cx', type: 'year_of_plenty', acquiredTurn: 0, played: false },
    ];
    const woodBefore = state.bank!.wood ?? 0;

    const ok = applyCommand(
      state,
      {
        type: 'play_dev_card',
        playerId,
        cardId: 'yop-cx',
        targetTileId: 'wood:clay',
      },
      ctx,
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.state.bank!.wood).toBe(woodBefore - 1);

    state.players.get(playerId)!.devCards = [
      { id: 'yop-empty', type: 'year_of_plenty', acquiredTurn: 0, played: false },
    ];
    state.players.get(playerId)!.devCardsPlayedThisTurn = 0;
    state.bank = { wood: 0, clay: 0, wheat: 0, sheep: 0, ore: 0 };
    const fail = applyCommand(
      state,
      {
        type: 'play_dev_card',
        playerId,
        cardId: 'yop-empty',
        targetTileId: 'wood:ore',
      },
      ctx,
    );
    expect(fail.ok).toBe(false);
  });

  it('accorde un port adjacent à une tuile colonisée', () => {
    const { state } = createCatanX(73);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;

    // Place un havre sur une côte et colonise une terre voisine.
    let coastId: string | null = null;
    let landId: string | null = null;
    for (const [tileId, tile] of state.map) {
      if (tile.terrain !== 'coast') continue;
      for (const neighbor of hexAllNeighbors(tile.coord)) {
        const nid = hexToId(neighbor);
        const land = state.map.get(nid);
        if (land && land.terrain !== 'ocean' && land.terrain !== 'coast') {
          coastId = tileId;
          landId = nid;
          break;
        }
      }
      if (landId) break;
    }

    expect(coastId).toBeTruthy();
    expect(landId).toBeTruthy();
    if (!coastId || !landId) return;

    state.map.get(coastId)!.port = 'generic_3:1';
    player.ports = [];
    grantPortsAdjacentToTile(state, playerId, landId);
    expect(player.ports).toContain('generic_3:1');
    expect(getPortTradeRatio(player, 'wood', state)).toBe(3);
  });

  it('create_game CatanX pose villages + banque avant le client', () => {
    const ctx = makeContext(74);
    const config = buildGameConfigFromPreset('catanx', { mapSeed: 74, playerCount: 3 });
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
    if (!created.ok) return;
    expect(created.state.bank).toBeTruthy();
    expect(created.state.config.startingResources).toBe('none');
    for (const playerId of created.state.turnOrder) {
      const player = created.state.players.get(playerId)!;
      expect(player.settlements.length).toBeGreaterThanOrEqual(1);
      expect(Object.values(player.resources).every((n) => (n ?? 0) === 0)).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  createSnapshot,
  FixedClock,
  IncrementalIdGenerator,
  migrateSnapshot,
  normalizeCitiesKnightsState,
  SeededRandom,
  SCHEMA_VERSION,
  snapshotFromJSON,
  snapshotToGameState,
  snapshotToJSON,
} from '@catanx/engine';
import type { GameState } from '../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createCkPlaying(seed: number, playerCount = 2): GameState {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: seed,
    playerCount,
    extensions: {
      citiesKnights: {
        enabled: true,
        ruleset: 'catanx-essential-v1',
        victoryPointBonus: 3,
        adaptiveBarbarianTrack: true,
      },
    },
  });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `P${i + 1}`,
        civilization: 'empire',
        type: 'human' as const,
      })),
    },
    ctx,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('create failed');
  autoCompleteClassicSetup(created.state);
  created.state.turnPhase = 'player_action';
  return created.state;
}

describe('citiesKnights hardening (phase 10)', () => {
  it('normalise un blob schema 2 partiel (buffs / stocks / discards absents)', () => {
    const playerIds = ['a', 'b'];
    const normalized = normalizeCitiesKnightsState(
      {
        barbarianTrackPosition: 2,
        robberUnlocked: true,
        // progressBuffs / knightStocks / progressDiscards volontairement absents
        playerCommodities: { a: { ck_paper: 1 } },
      } as Parameters<typeof normalizeCitiesKnightsState>[0],
      playerIds,
      2,
    );

    expect(normalized.progressBuffs).toEqual({
      merchantFleet: null,
      craneDiscount: {},
      alchemistDice: null,
    });
    expect(normalized.progressDiscards).toEqual({ trade: [], politics: [], science: [] });
    expect(normalized.knightStocks.a).toEqual({ basic: 2, strong: 2, mighty: 2 });
    expect(normalized.knightStocks.b).toEqual({ basic: 2, strong: 2, mighty: 2 });
    expect(normalized.playerCommodities.a).toEqual({ ck_paper: 1 });
    expect(normalized.barbarianTrackPosition).toBe(2);
    expect(normalized.robberUnlocked).toBe(true);
    expect(normalized.pendingResolutions).toEqual([]);
  });

  it('migre schema 2 → 3 et hydrate les champs C&K au chargement', () => {
    const state = createCkPlaying(501);
    const snap = createSnapshot(state);
    const legacyCk = {
      ...snap.state.extensions!.citiesKnights!,
    } as Record<string, unknown>;
    delete legacyCk.progressBuffs;
    delete legacyCk.progressDiscards;
    delete legacyCk.knightStocks;

    const legacy = {
      ...snap,
      schemaVersion: 2,
      state: {
        ...snap.state,
        extensions: {
          ...snap.state.extensions,
          citiesKnights: legacyCk,
        },
      },
    };

    const migrated = migrateSnapshot(legacy as unknown as typeof snap);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);

    const restored = snapshotToGameState(migrated);
    const ck = restored.extensions!.citiesKnights!;
    expect(ck.progressBuffs.merchantFleet).toBeNull();
    expect(ck.progressDiscards.trade).toEqual([]);
    expect(ck.knightStocks[restored.turnOrder[0]!]).toEqual({
      basic: 2,
      strong: 2,
      mighty: 2,
    });
  });

  it('reconnect mid-pending Aqueduc : snapshot sans journal → résolution OK', () => {
    const state = createCkPlaying(502);
    const ctx = makeContext(502);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    ck.urbanLevels[playerId] = { trade: 0, politics: 0, science: 3 };
    ck.pendingResolutions.push({
      id: 'aq-reconnect',
      kind: 'aqueduct',
      playerId,
      data: {},
    });

    // Reconnexion serveur : souvent commandLog vide, état seul
    const snap = createSnapshot(state, []);
    const json = snapshotToJSON(snap);
    const loaded = snapshotFromJSON(json);
    expect(loaded.commandLog).toEqual([]);
    const restored = snapshotToGameState(loaded);
    expect(
      restored.extensions!.citiesKnights!.pendingResolutions.some(
        (r) => r.kind === 'aqueduct' && r.playerId === playerId,
      ),
    ).toBe(true);

    const endBlocked = applyCommand(restored, { type: 'end_turn', playerId }, ctx);
    expect(endBlocked.ok).toBe(false);

    const choose = applyCommand(
      restored,
      { type: 'ck_aqueduct_choose', playerId, resource: 'wood' },
      ctx,
    );
    expect(choose.ok).toBe(true);
    if (!choose.ok) return;
    expect(
      choose.state.extensions!.citiesKnights!.pendingResolutions.some((r) => r.kind === 'aqueduct'),
    ).toBe(false);
  });

  it('reconnect mid-pending retraite chevalier : pending conservé', () => {
    const state = createCkPlaying(503);
    const ctx = makeContext(503);
    const playerA = state.turnOrder[0]!;
    const playerB = state.turnOrder[1]!;
    const ck = state.extensions!.citiesKnights!;

    ck.knights.push({
      id: 'ck-hard-retreat',
      ownerId: playerB,
      rank: 1,
      activated: false,
      intersectionId: null,
      activatedThisTurn: false,
      promotedThisTurn: false,
    });
    ck.pendingResolutions.push({
      id: 'pending-retreat-hard',
      kind: 'knight_retreat',
      playerId: playerB,
      data: { knightId: 'ck-hard-retreat', options: ['opt-a', 'opt-b'] },
    });

    const restored = snapshotToGameState(snapshotFromJSON(snapshotToJSON(createSnapshot(state))));
    expect(
      restored.extensions!.citiesKnights!.pendingResolutions.some(
        (r) => r.kind === 'knight_retreat' && r.playerId === playerB,
      ),
    ).toBe(true);

    const end = applyCommand(restored, { type: 'end_turn', playerId: playerA }, ctx);
    expect(end.ok).toBe(false);

    const resolve = applyCommand(
      restored,
      {
        type: 'ck_resolve_knight_retreat',
        playerId: playerB,
        knightId: 'ck-hard-retreat',
        toIntersectionId: null,
      },
      ctx,
    );
    expect(resolve.ok).toBe(true);
  });

  it('round-trip JSON conserve pending pillage + invasionCount', () => {
    const state = createCkPlaying(504);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    ck.invasionCount = 2;
    ck.pendingResolutions.push({
      id: 'pill-1',
      kind: 'choose_pillage_city',
      playerId,
      data: { options: ['city-a'] },
    });

    const restored = snapshotToGameState(snapshotFromJSON(snapshotToJSON(createSnapshot(state))));
    const rck = restored.extensions!.citiesKnights!;
    expect(rck.invasionCount).toBe(2);
    expect(rck.pendingResolutions).toHaveLength(1);
    expect(rck.pendingResolutions[0]!.kind).toBe('choose_pillage_city');
  });
});

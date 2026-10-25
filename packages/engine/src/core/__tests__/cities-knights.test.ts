import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  applyCitiesKnightsCommodityProduction,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  ckBarbarianTrackLength,
  ckCommodityStockCap,
  createEngineContext,
  createSnapshot,
  FixedClock,
  IncrementalIdGenerator,
  isCitiesKnightsEnabled,
  migrateSnapshot,
  projectStateForViewer,
  SeededRandom,
  SCHEMA_VERSION,
  snapshotFromJSON,
  snapshotToJSON,
} from '@catanx/engine';
import type { GameState } from '../../types/game';
import type { CollectionResult } from '../../engine/resources/ResourceSystem';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createCkGame(seed = 77, playerCount = 2): GameState {
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
  return created.state;
}

describe('citiesKnights framework', () => {
  it('active l’extension, objectif +3, sans deck Développement', () => {
    const state = createCkGame(10, 4);
    expect(isCitiesKnightsEnabled(state)).toBe(true);
    expect(state.config.victoryPointTarget).toBe(13);
    expect(state.devDeck).toEqual([]);
    expect(state.extensions?.citiesKnights).toBeDefined();
    expect(state.extensions!.citiesKnights!.robberUnlocked).toBe(false);
    expect(state.extensions!.citiesKnights!.barbarianTrackLength).toBe(
      ckBarbarianTrackLength(4),
    );
    expect(state.extensions!.citiesKnights!.commodityBank.ck_paper).toBe(
      ckCommodityStockCap(4),
    );
  });

  it('migre les snapshots schema 1 sans extensions', () => {
    const state = createCkGame(11, 2);
    // Simuler une save legacy
    const snap = createSnapshot(state);
    const legacy = {
      ...snap,
      schemaVersion: 1,
      config: { ...snap.config, extensions: undefined },
      state: { ...snap.state, extensions: undefined },
    };
    const migrated = migrateSnapshot(legacy as typeof snap);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.config.extensions).toEqual({});
    expect(migrated.state.extensions).toEqual({});
  });

  it('masque marchandises et Progress adverses dans la vue privée', () => {
    const state = createCkGame(12, 2);
    autoCompleteClassicSetup(state);
    const alice = state.turnOrder[0]!;
    const bob = state.turnOrder[1]!;
    const ck = state.extensions!.citiesKnights!;
    ck.playerCommodities[bob] = { ck_paper: 2, ck_cloth: 1 };
    ck.publicCommodityCounts[bob] = 3;
    ck.progressHands[bob] = [
      { id: 'p1', type: 'merchant', deck: 'trade' },
      { id: 'p2', type: 'bishop', deck: 'politics' },
    ];
    ck.publicProgressCounts[bob] = 2;

    const forAlice = projectStateForViewer(state, alice);
    const bobCk = forAlice.extensions!.citiesKnights!;
    expect(bobCk.playerCommodities[bob]).toEqual({});
    expect(bobCk.progressHands[bob]).toEqual([]);
    expect(bobCk.publicCommodityCounts[bob]).toBe(3);
    expect(bobCk.publicProgressCounts[bob]).toBe(2);
  });
});

describe('citiesKnights setup & économie', () => {
  it('place colonie puis ville au setup', () => {
    const state = createCkGame(20, 2);
    autoCompleteClassicSetup(state);
    expect(state.phase).toBe('playing');

    for (const pid of state.turnOrder) {
      let settlements = 0;
      let cities = 0;
      for (const [iid, owner] of Object.entries(state.classicBoard!.occupiedIntersections)) {
        if (owner !== pid) continue;
        const bid = state.classicBoard!.buildingByIntersection[iid];
        const b = bid ? state.buildings.get(bid) : undefined;
        if (b?.definitionId === 'city') cities += 1;
        else settlements += 1;
      }
      expect(settlements).toBe(1);
      expect(cities).toBe(1);
    }
  });

  it('convertit la production ville en marchandises', () => {
    const state = createCkGame(30, 2);
    autoCompleteClassicSetup(state);
    const cityBuilding = [...state.buildings.values()].find((b) => b.definitionId === 'city');
    expect(cityBuilding).toBeTruthy();
    const tileId = cityBuilding!.productionTileIds?.[0] ?? cityBuilding!.tileId;
    const tile = state.map.get(tileId)!;
    tile.diceValue = 8;
    tile.baseProduction = { wood: 1 };
    tile.robber = false;

    const collections: CollectionResult[] = [
      { playerId: cityBuilding!.ownerId, resources: { wood: 2 }, bonuses: [] },
    ];
    applyCitiesKnightsCommodityProduction(state, 8, collections);
    expect(collections[0]!.resources.wood).toBe(1);
    const ck = state.extensions!.citiesKnights!;
    expect(ck.playerCommodities[cityBuilding!.ownerId]?.ck_paper).toBe(1);
  });

  it('ne retire pas la ressource classique si la banque de marchandises est vide', () => {
    const state = createCkGame(31, 2);
    autoCompleteClassicSetup(state);
    const cityBuilding = [...state.buildings.values()].find((b) => b.definitionId === 'city')!;
    const tileId = cityBuilding.productionTileIds?.[0] ?? cityBuilding.tileId;
    const tile = state.map.get(tileId)!;
    tile.diceValue = 9;
    tile.baseProduction = { wood: 1 };
    tile.robber = false;

    const ck = state.extensions!.citiesKnights!;
    ck.commodityBank.ck_paper = 0;

    const collections: CollectionResult[] = [
      { playerId: cityBuilding.ownerId, resources: { wood: 2 }, bonuses: [] },
    ];
    applyCitiesKnightsCommodityProduction(state, 9, collections);
    expect(collections[0]!.resources.wood).toBe(2);
    expect(ck.playerCommodities[cityBuilding.ownerId]?.ck_paper ?? 0).toBe(0);
  });

  it('défausse mixte ressources + marchandises', () => {
    const state = createCkGame(41, 2);
    autoCompleteClassicSetup(state);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 2, clay: 2 };
    const ck = state.extensions!.citiesKnights!;
    ck.playerCommodities[playerId] = { ck_paper: 4 };
    ck.publicCommodityCounts[playerId] = 4;
    // main = 8 → défausse 4
    state.sevenFlow = {
      playersToDiscard: [playerId],
      playersDiscarded: [],
      robberTileId: null,
      stealCandidates: [],
    };
    state.turnPhase = 'discard_resources';

    const ctx = makeContext(41);
    const discard = applyCommand(
      state,
      {
        type: 'discard_resources',
        playerId,
        resources: { wood: 2 },
        commodities: { ck_paper: 2 },
      },
      ctx,
    );
    expect(discard.ok).toBe(true);
    if (!discard.ok) return;
    expect(discard.state.players.get(playerId)!.resources.wood ?? 0).toBe(0);
    expect(
      discard.state.extensions!.citiesKnights!.playerCommodities[playerId]?.ck_paper,
    ).toBe(2);
  });

  it('brigand dormant : 7 défausse sans déplacement', () => {
    const state = createCkGame(40, 2);
    autoCompleteClassicSetup(state);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 4, clay: 4 };
    state.sevenFlow = {
      playersToDiscard: [playerId],
      playersDiscarded: [],
      robberTileId: null,
      stealCandidates: [],
    };
    state.turnPhase = 'discard_resources';
    state.currentPlayerIndex = 0;

    const ctx = makeContext(40);
    const discard = applyCommand(
      state,
      {
        type: 'discard_resources',
        playerId,
        resources: { wood: 4 },
      },
      ctx,
    );
    expect(discard.ok).toBe(true);
    if (!discard.ok) return;
    expect(discard.state.turnPhase).toBe('player_action');
    expect(discard.state.extensions!.citiesKnights!.robberUnlocked).toBe(false);

    const landTile = [...discard.state.map.entries()].find(
      ([, t]) => t.terrain !== 'ocean' && t.terrain !== 'glacier',
    )?.[0];
    expect(landTile).toBeTruthy();
    const move = applyCommand(
      discard.state,
      { type: 'move_robber', playerId, tileId: landTile! },
      ctx,
    );
    expect(move.ok).toBe(false);
  });

  it('piste adaptative 2–8 joueurs', () => {
    expect(ckBarbarianTrackLength(2)).toBe(4);
    expect(ckBarbarianTrackLength(3)).toBe(5);
    expect(ckBarbarianTrackLength(4)).toBe(7);
    expect(ckBarbarianTrackLength(5)).toBe(9);
    expect(ckBarbarianTrackLength(6)).toBe(11);
    expect(ckBarbarianTrackLength(7)).toBe(12);
    expect(ckBarbarianTrackLength(8)).toBe(14);
  });

  it('round-trip snapshot conserve l’état C&K', () => {
    const state = createCkGame(50, 3);
    const json = snapshotToJSON(createSnapshot(state));
    const restored = snapshotFromJSON(json);
    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.config.extensions?.citiesKnights?.enabled).toBe(true);
    expect(restored.state.extensions?.citiesKnights?.barbarianTrackLength).toBe(
      ckBarbarianTrackLength(3),
    );
  });
});

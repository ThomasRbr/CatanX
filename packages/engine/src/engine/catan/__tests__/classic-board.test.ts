import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  CLASSIC_BANK_STOCK,
  CLASSIC_DEV_DECK,
  CLASSIC_RESOURCE_TYPES,
  applyClassicBoardPreset,
  isClassicMode,
  collectDiceResources,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';
import type { BuildingInstance } from '../../../types/buildings';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createClassicGame(seed = 42): GameState {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', { mapSeed: seed, playerCount: 4 });
  const result = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'ai' },
        { name: 'C', civilization: 'empire', type: 'ai' },
        { name: 'D', civilization: 'scholars', type: 'ai' },
      ],
    },
    ctx,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('create_game failed');
  return result.state;
}

describe('ClassicBoard — conformité CATAN (socle)', () => {
  it('crée une partie classique avec mains vides et sans bonus de civilisation', () => {
    const state = createClassicGame();
    expect(isClassicMode(state)).toBe(true);
    expect(state.mapRadius).toBe(2);
    expect(state.map.size).toBe(19);

    for (const [, player] of state.players) {
      expect(player.resources).toEqual({});
      expect(player.researchedTechs).toEqual([]);
      expect(player.specialAbilities).toEqual([]);
      expect(player.settlements).toEqual([]);
      expect(player.ownedTiles).toEqual([]);
    }

    for (const [, tile] of state.map) {
      expect(tile.owner).toBeNull();
      expect(tile.fertility).toBe(100);
    }
  });

  it('initialise la banque 19×5 et le deck de 25 cartes', () => {
    const state = createClassicGame(7);
    expect(state.bank).toEqual(CLASSIC_BANK_STOCK);
    expect(state.devDeck).toHaveLength(CLASSIC_DEV_DECK.length);

    const counts = new Map<string, number>();
    for (const type of state.devDeck!) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    expect(counts.get('knight')).toBe(14);
    expect(counts.get('victory_point')).toBe(5);
    expect(counts.get('road_building')).toBe(2);
    expect(counts.get('year_of_plenty')).toBe(2);
    expect(counts.get('monopoly')).toBe(2);
    expect(counts.has('spy')).toBe(false);
  });

  it('expose une topologie classique avec inventaire 5/4/15', () => {
    const state = createClassicGame(11);
    expect(state.classicBoard).toBeDefined();
    expect(Object.keys(state.classicBoard!.topology.intersections).length).toBeGreaterThan(30);
    expect(Object.keys(state.classicBoard!.topology.edges).length).toBeGreaterThan(40);
    for (const playerId of state.turnOrder) {
      expect(state.classicBoard!.piecesRemaining[playerId]).toEqual({
        settlements: 5,
        cities: 4,
        roads: 15,
      });
    }
  });

  it('produit 1 ressource par colonie sans fertilité, même à fertility 60', () => {
    const state = createClassicGame(3);
    const wheatTile = [...state.map.values()].find(
      (tile) => tile.terrain === 'plains' && tile.diceValue != null,
    );
    expect(wheatTile).toBeDefined();
    wheatTile!.fertility = 60;

    const building: BuildingInstance = {
      id: 'b1',
      definitionId: 'settlement',
      ownerId: state.turnOrder[0],
      tileId: wheatTile!.id,
      level: 1,
      health: 100,
      constructedTurn: 1,
      workers: [],
      isActive: true,
      productionProgress: 0,
      productionTileIds: [wheatTile!.id],
    };
    state.buildings.set(building.id, building);

    const results = collectDiceResources(wheatTile!.diceValue!, state);
    const mine = results.find((r) => r.playerId === state.turnOrder[0]);
    expect(mine?.resources.wheat).toBe(1);
    expect(state.bank!.wheat).toBe(CLASSIC_BANK_STOCK.wheat - 1);
  });

  it('deux colonies du même joueur sur le même terrain produisent chacune', () => {
    const state = createClassicGame(5);
    const tile = [...state.map.values()].find((t) => t.terrain === 'forest' && t.diceValue);
    expect(tile).toBeDefined();

    const owner = state.turnOrder[0];
    for (const id of ['b1', 'b2'] as const) {
      state.buildings.set(id, {
        id,
        definitionId: 'settlement',
        ownerId: owner,
        tileId: tile!.id,
        level: 1,
        health: 100,
        constructedTurn: 1,
        workers: [],
        isActive: true,
        productionProgress: 0,
        productionTileIds: [tile!.id],
      });
    }

    const results = collectDiceResources(tile!.diceValue!, state);
    const mine = results.find((r) => r.playerId === owner);
    expect(mine?.resources.wood).toBe(2);
  });

  it('une ville conserve productionTileIds et produit le double', () => {
    const state = createClassicGame(13);
    const tileA = [...state.map.values()].find((t) => t.terrain === 'hill' && t.diceValue);
    const tileB = [...state.map.values()].find(
      (t) => t.terrain === 'forest' && t.diceValue && t.id !== tileA?.id,
    );
    expect(tileA && tileB).toBeTruthy();

    const owner = state.turnOrder[0];
    state.buildings.set('city1', {
      id: 'city1',
      definitionId: 'city',
      ownerId: owner,
      tileId: tileA!.id,
      level: 2,
      health: 100,
      constructedTurn: 1,
      workers: [],
      isActive: true,
      productionProgress: 0,
      productionTileIds: [tileA!.id, tileB!.id],
    });

    const fromA = collectDiceResources(tileA!.diceValue!, state).find((r) => r.playerId === owner);
    expect(fromA?.resources.clay).toBe(2);

    const fromB = collectDiceResources(tileB!.diceValue!, state).find((r) => r.playerId === owner);
    expect(fromB?.resources.wood).toBe(2);
  });

  it('pénurie banque : plusieurs joueurs concernés → personne ne reçoit', () => {
    const state = createClassicGame(17);
    state.bank = { wood: 19, clay: 19, wheat: 1, sheep: 19, ore: 19 };
    const wheatTile = [...state.map.values()].find((t) => t.terrain === 'plains' && t.diceValue);
    expect(wheatTile).toBeDefined();

    for (const [index, playerId] of state.turnOrder.slice(0, 2).entries()) {
      state.buildings.set(`w${index}`, {
        id: `w${index}`,
        definitionId: 'settlement',
        ownerId: playerId,
        tileId: wheatTile!.id,
        level: 1,
        health: 100,
        constructedTurn: 1,
        workers: [],
        isActive: true,
        productionProgress: 0,
        productionTileIds: [wheatTile!.id],
      });
    }

    const results = collectDiceResources(wheatTile!.diceValue!, state);
    expect(results.every((r) => !r.resources.wheat)).toBe(true);
    expect(state.bank!.wheat).toBe(1);
  });

  it('applyClassicBoardPreset force fertility 100', () => {
    const state = createClassicGame(9);
    for (const [, tile] of state.map) {
      tile.fertility = 40;
    }
    applyClassicBoardPreset(state);
    for (const [, tile] of state.map) {
      expect(tile.fertility).toBe(100);
    }
    expect(CLASSIC_RESOURCE_TYPES.length).toBe(5);
  });
});

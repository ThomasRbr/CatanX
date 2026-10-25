import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  defaultSeasonsConfig,
  deserializeMaps,
  FixedClock,
  getPublicDevCardCount,
  getPublicResourceCount,
  IncrementalIdGenerator,
  projectStateForViewer,
  SeededRandom,
  serializeMaps,
} from '@catanx/engine';
import type { GameState } from '../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createPlaying(seed = 41): GameState {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', { mapSeed: seed, playerCount: 2 });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'Alice', civilization: 'empire', type: 'human' },
        { name: 'Bob', civilization: 'merchants', type: 'human' },
      ],
    },
    ctx,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('create failed');
  autoCompleteClassicSetup(created.state);
  created.state.turnPhase = 'player_action';
  return created.state;
}

describe('projectStateForViewer', () => {
  it('masque les ressources et cartes des adversaires', () => {
    const state = createPlaying(42);
    const aliceId = state.turnOrder[0]!;
    const bobId = state.turnOrder[1]!;
    const alice = state.players.get(aliceId)!;
    const bob = state.players.get(bobId)!;

    alice.resources = { wood: 3, clay: 1 };
    bob.resources = { ore: 4, wheat: 2 };
    bob.devCards = [
      { id: 'd1', type: 'knight', acquiredTurn: 1, played: false },
      { id: 'd2', type: 'victory_point', acquiredTurn: 1, played: false },
      { id: 'd3', type: 'knight', acquiredTurn: 1, played: true },
    ];
    state.devDeck = ['knight', 'monopoly', 'road_building', 'victory_point'];

    const forAlice = projectStateForViewer(state, aliceId);
    const aliceView = forAlice.players.get(aliceId)!;
    const bobView = forAlice.players.get(bobId)!;

    expect(aliceView.resources.wood).toBe(3);
    expect(bobView.resources).toEqual({});
    expect(getPublicResourceCount(bobView)).toBe(6);
    expect(bobView.devCards).toHaveLength(1);
    expect(bobView.devCards[0]?.type).toBe('knight');
    expect(getPublicDevCardCount(bobView)).toBe(2);
    expect(forAlice.devDeck).toEqual([]);
    expect(forAlice.publicDevDeckCount).toBe(4);

    // État autoritaire intact
    expect(bob.resources.ore).toBe(4);
    expect(state.devDeck).toHaveLength(4);
  });

  it('spectateur : toutes les mains masquées', () => {
    const state = createPlaying(43);
    const aliceId = state.turnOrder[0]!;
    state.players.get(aliceId)!.resources = { wood: 5 };

    const forSpec = projectStateForViewer(state, null);
    const aliceView = forSpec.players.get(aliceId)!;
    expect(aliceView.resources).toEqual({});
    expect(getPublicResourceCount(aliceView)).toBe(5);
  });

  it('offre de commerce : termes visibles seulement aux parties', () => {
    const state = createPlaying(44);
    const aliceId = state.turnOrder[0]!;
    const bobId = state.turnOrder[1]!;
    state.pendingPlayerTrade = {
      id: 't1',
      fromPlayerId: aliceId,
      toPlayerId: bobId,
      give: { wood: 1 },
      receive: { clay: 1 },
      createdTurn: 1,
    };

    const forAlice = projectStateForViewer(state, aliceId);
    expect(forAlice.pendingPlayerTrade?.give).toEqual({ wood: 1 });

    const forSpec = projectStateForViewer(state, null);
    expect(forSpec.pendingPlayerTrade?.give).toEqual({});
    expect(forSpec.pendingPlayerTrade?.receive).toEqual({});
    expect(forSpec.pendingPlayerTrade?.termsHidden).toBe(true);
    expect(forAlice.pendingPlayerTrade?.termsHidden).toBe(false);
  });

  it('sérialise sans fuite sur le fil', () => {
    const state = createPlaying(45);
    const aliceId = state.turnOrder[0]!;
    const bobId = state.turnOrder[1]!;
    state.players.get(bobId)!.resources = { ore: 7 };
    state.devDeck = ['monopoly', 'year_of_plenty'];

    const wire = serializeMaps(projectStateForViewer(state, aliceId));
    const json = JSON.stringify(wire);
    expect(json).not.toContain('"ore":7');
    expect(json).not.toContain('monopoly');
    expect(json).not.toContain('year_of_plenty');

    const roundTrip = deserializeMaps(wire);
    expect(getPublicResourceCount(roundTrip.players.get(bobId)!)).toBe(7);
    expect(roundTrip.publicDevDeckCount).toBe(2);
  });

  it('ne régénère pas le deck sur une vue projetée désérialisée', () => {
    const state = createPlaying(46);
    const aliceId = state.turnOrder[0]!;
    state.devDeck = ['monopoly', 'knight'];

    const wire = serializeMaps(projectStateForViewer(state, aliceId));
    const roundTrip = deserializeMaps(wire);
    expect(roundTrip.publicDevDeckCount).toBe(2);
    expect(roundTrip.devDeck).toEqual([]);
  });

  it('masque les intentions de Veillée mais conserve le statut prêt', () => {
    const ctx = makeContext(47);
    const config = buildGameConfigFromPreset('catanx', {
      mapSeed: 47,
      playerCount: 2,
      extensions: { seasons: defaultSeasonsConfig({ enabled: true }) },
    });
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'Alice', civilization: 'empire', type: 'human' },
          { name: 'Bob', civilization: 'merchants', type: 'human' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('create failed');
    const [aliceId, bobId] = created.state.turnOrder;
    const seasons = created.state.extensions!.seasons!;
    seasons.nextPreparations[aliceId!] = 'harvest';
    seasons.nextPreparationTargets[aliceId!] = 'ore';
    seasons.nextPreparations[bobId!] = 'shelter';
    seasons.preparationReady[aliceId!] = true;
    seasons.preparationReady[bobId!] = true;

    const forAlice = projectStateForViewer(created.state, aliceId!);
    expect(forAlice.extensions!.seasons!.nextPreparations[aliceId!]).toBe('harvest');
    expect(forAlice.extensions!.seasons!.nextPreparationTargets[aliceId!]).toBe('ore');
    expect(forAlice.extensions!.seasons!.nextPreparations[bobId!]).toBeNull();
    expect(forAlice.extensions!.seasons!.preparationReady[bobId!]).toBe(true);
  });
});

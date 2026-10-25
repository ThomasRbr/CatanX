import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  resolveCkInvasion,
  countCitiesOnBoard,
  playerDefenseContribution,
  listPillagableCities,
  pillageCity,
  drawProgressCard,
} from '@catanx/engine';
import type { GameState } from '../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createCkPlaying(seed = 110): GameState {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: seed,
    playerCount: 2,
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
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'human' },
      ],
    },
    ctx,
  );
  if (!created.ok) throw new Error('create failed');
  autoCompleteClassicSetup(created.state);
  created.state.turnPhase = 'player_action';
  created.state.currentPlayerIndex = 0;
  return created.state;
}

describe('citiesKnights invasion + progress', () => {
  it('crée des decks Progress 18 cartes', () => {
    const state = createCkPlaying(111);
    const ck = state.extensions!.citiesKnights!;
    expect(ck.progressDecks.trade).toHaveLength(18);
    expect(ck.progressDecks.politics).toHaveLength(18);
    expect(ck.progressDecks.science).toHaveLength(18);
  });

  it('victoire défenseurs : PV Défenseur au meilleur contributeur', () => {
    const state = createCkPlaying(112);
    const playerA = state.turnOrder[0]!;
    const playerB = state.turnOrder[1]!;
    const ck = state.extensions!.citiesKnights!;

    // 2 villes après setup C&K (1 chacun typiquement) — force barbares = count cities
    const cities = countCitiesOnBoard(state);
    expect(cities).toBeGreaterThanOrEqual(2);

    // Chevalier actif fort pour A
    ck.knights.push({
      id: 'k1',
      ownerId: playerA,
      rank: 3,
      activated: true,
      intersectionId: 'fake',
      activatedThisTurn: false,
      promotedThisTurn: false,
    });
    ck.knights.push({
      id: 'k2',
      ownerId: playerB,
      rank: 1,
      activated: true,
      intersectionId: 'fake2',
      activatedThisTurn: false,
      promotedThisTurn: false,
    });

    expect(playerDefenseContribution(state, playerA)).toBe(3);
    const result = resolveCkInvasion(state);
    expect(result.outcome).toBe('defenders_win');
    expect(result.defenderVpAwardedTo).toBe(playerA);
    expect(ck.defenderVp[playerA]).toBe(1);
    expect(ck.knights.every((k) => !k.activated)).toBe(true);
    expect(ck.barbarianTrackPosition).toBe(0);
    expect(ck.robberUnlocked).toBe(true);
  });

  it('égalité défenseurs : choix de deck Progress', () => {
    const state = createCkPlaying(113);
    const playerA = state.turnOrder[0]!;
    const playerB = state.turnOrder[1]!;
    const ck = state.extensions!.citiesKnights!;

    ck.knights.push({
      id: 'k1',
      ownerId: playerA,
      rank: 2,
      activated: true,
      intersectionId: 'a',
      activatedThisTurn: false,
      promotedThisTurn: false,
    });
    ck.knights.push({
      id: 'k2',
      ownerId: playerB,
      rank: 2,
      activated: true,
      intersectionId: 'b',
      activatedThisTurn: false,
      promotedThisTurn: false,
    });

    const result = resolveCkInvasion(state);
    expect(result.outcome).toBe('defenders_win');
    expect(result.defenderVpAwardedTo).toBeNull();
    expect(result.progressDrawPlayerIds).toEqual(expect.arrayContaining([playerA, playerB]));
    expect(ck.pendingResolutions.filter((r) => r.kind === 'choose_progress_deck')).toHaveLength(2);

    const ctx = makeContext(113);
    const draw = applyCommand(
      state,
      { type: 'ck_choose_progress_deck', playerId: playerA, deck: 'science' },
      ctx,
    );
    expect(draw.ok).toBe(true);
    expect(ck.progressHands[playerA]!.length).toBe(1);
  });

  it('défaite : pillage de la ville du moins contributeur', () => {
    const state = createCkPlaying(114);
    const playerA = state.turnOrder[0]!;
    const playerB = state.turnOrder[1]!;
    const ck = state.extensions!.citiesKnights!;

    // Pas de chevaliers → les deux à 0 ; chacun avec ville pillable perd une ville
    const pillagableA = listPillagableCities(state, playerA);
    const pillagableB = listPillagableCities(state, playerB);
    expect(pillagableA.length + pillagableB.length).toBeGreaterThan(0);

    const citiesBefore = countCitiesOnBoard(state);
    const result = resolveCkInvasion(state);
    expect(result.outcome).toBe('barbarians_win');
    expect(result.pillagedPlayerIds.length).toBeGreaterThan(0);

    // Auto-pillage si une seule ville
    const citiesAfter = countCitiesOnBoard(state);
    const pendingPillage = ck.pendingResolutions.filter((r) => r.kind === 'pillage_city');
    if (pendingPillage.length === 0) {
      expect(citiesAfter).toBeLessThan(citiesBefore);
    }
  });

  it('métropole immune au pillage', () => {
    const state = createCkPlaying(115);
    const playerA = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    const cities = listPillagableCities(state, playerA);
    expect(cities.length).toBeGreaterThan(0);
    const host = cities[0]!;
    ck.metropolises.trade = { ownerId: playerA, intersectionId: host };
    expect(listPillagableCities(state, playerA)).not.toContain(host);
  });

  it('pillage sans stock colonie : ne rend pas la ville au stock', () => {
    const state = createCkPlaying(116);
    const playerId = state.turnOrder[0]!;
    const board = state.classicBoard!;
    const stock = board.piecesRemaining[playerId]!;
    stock.settlements = 0;
    const citiesBefore = stock.cities;
    const cityId = listPillagableCities(state, playerId)[0]!;
    const result = pillageCity(state, playerId, cityId);
    expect(result.success).toBe(true);
    expect(stock.cities).toBe(citiesBefore);
    expect(stock.settlements).toBe(0);
  });

  it('pioche Progress avec main pleine force une défausse', () => {
    const state = createCkPlaying(117);
    const ctx = makeContext(117);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;

    for (let i = 0; i < 3; i++) {
      const d = drawProgressCard(state, playerId, 'trade');
      expect(d.ok).toBe(true);
    }
    expect(ck.progressHands[playerId]).toHaveLength(3);

    const over = drawProgressCard(state, playerId, 'trade');
    expect(over.ok).toBe(true);
    expect(over.needsDiscard).toBe(true);
    expect(ck.progressHands[playerId]).toHaveLength(4);
    expect(ck.pendingResolutions.some((r) => r.kind === 'discard_progress')).toBe(true);

    const cardId = ck.progressHands[playerId]![0]!.id;
    const discard = applyCommand(state, { type: 'ck_discard_progress', playerId, cardId }, ctx);
    expect(discard.ok).toBe(true);
    expect(ck.progressHands[playerId]).toHaveLength(3);
    expect(ck.progressDiscards.trade.length).toBe(1);
  });
});

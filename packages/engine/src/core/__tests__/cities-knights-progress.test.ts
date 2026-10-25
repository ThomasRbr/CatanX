import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  ckPlayProgress,
  getPortTradeRatio,
  projectStateForViewer,
  getUrbanLevel,
} from '@catanx/engine';
import type { CkProgressPlayImpact } from '../../types/citiesKnights';
import type { GameState } from '../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createCkPlaying(seed = 200): GameState {
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

function giveCard(state: GameState, playerId: string, type: string, deck = 'science') {
  const ck = state.extensions!.citiesKnights!;
  const card = {
    id: `test_${type}`,
    type: type as 'crane',
    deck: deck as 'science',
  };
  if (!ck.progressHands[playerId]) ck.progressHands[playerId] = [];
  ck.progressHands[playerId]!.push(card);
  return card;
}

describe('citiesKnights progress effects', () => {
  it('limite les cartes Progrès à une par tour', () => {
    const state = createCkPlaying(200);
    const playerId = state.turnOrder[0]!;
    giveCard(state, playerId, 'crane', 'science');
    giveCard(state, playerId, 'road_building', 'science');

    expect(ckPlayProgress(playerId, 'test_crane', state).success).toBe(true);
    const blocked = ckPlayProgress(playerId, 'test_road_building', state);
    expect(blocked.success).toBe(false);
    expect(blocked.reason).toContain('seule carte Progrès');

    state.currentTurn += 1;
    expect(ckPlayProgress(playerId, 'test_road_building', state).success).toBe(true);
  });

  it('Grue réduit le coût d’amélioration', () => {
    const state = createCkPlaying(201);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    giveCard(state, playerId, 'crane', 'science');
    expect(ckPlayProgress(playerId, 'test_crane', state).success).toBe(true);
    expect(ck.progressBuffs.craneDiscount[playerId]).toBe(1);

    ck.playerCommodities[playerId] = { ck_paper: 2 };
    // Niveau 2 coûterait 2 ; Grue → 1
    const improve = applyCommand(
      state,
      { type: 'ck_improve_urban', playerId, track: 'science' },
      makeContext(201),
    );
    // D'abord niv 1 sans grue déjà... on a la grue active : coût niv1 = max(1,1-1)=1
    expect(improve.ok).toBe(true);
    expect(getUrbanLevel(state, playerId, 'science')).toBe(1);
    expect(ck.progressBuffs.craneDiscount[playerId] ?? 0).toBe(0);

    // Rejouer grue pour niv 2
    state.currentTurn += 1;
    giveCard(state, playerId, 'crane', 'science');
    // Re-id card
    const card2 = ck.progressHands[playerId]!.find((c) => c.type === 'crane')!;
    expect(ckPlayProgress(playerId, card2.id, state).success).toBe(true);
    ck.playerCommodities[playerId] = { ck_paper: 1 };
    const improve2 = applyCommand(
      state,
      { type: 'ck_improve_urban', playerId, track: 'science' },
      makeContext(201),
    );
    expect(improve2.ok).toBe(true);
    expect(getUrbanLevel(state, playerId, 'science')).toBe(2);
    expect(ck.playerCommodities[playerId]?.ck_paper ?? 0).toBe(0);
  });

  it('Warlord active tous les chevaliers', () => {
    const state = createCkPlaying(202);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    ck.knights.push({
      id: 'k1',
      ownerId: playerId,
      rank: 1,
      activated: false,
      intersectionId: 'x',
      activatedThisTurn: false,
      promotedThisTurn: false,
    });
    giveCard(state, playerId, 'warlord', 'politics');
    expect(ckPlayProgress(playerId, 'test_warlord', state).success).toBe(true);
    expect(ck.knights[0]!.activated).toBe(true);
  });

  it('Alchimiste fixe les dés au prochain lancer', () => {
    const state = createCkPlaying(203);
    const playerId = state.turnOrder[0]!;
    state.turnPhase = 'start_of_turn';
    giveCard(state, playerId, 'alchemist', 'science');
    expect(ckPlayProgress(playerId, 'test_alchemist', state, { die1: 4, die2: 3 }).success).toBe(
      true,
    );
    expect(state.extensions!.citiesKnights!.progressBuffs.alchemistDice).toEqual({
      die1: 4,
      die2: 3,
    });

    const roll = applyCommand(state, { type: 'roll_dice', playerId }, makeContext(203));
    expect(roll.ok).toBe(true);
    if (!roll.ok) return;
    expect(roll.state.lastDiceRoll?.die1).toBe(4);
    expect(roll.state.lastDiceRoll?.die2).toBe(3);
    expect(roll.state.lastDiceRoll?.total).toBe(7);
  });

  it('Flotte marchande donne 2:1 jusqu’à fin de tour', () => {
    const state = createCkPlaying(204);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    // Isole l'effet de la carte des ports attribués aléatoirement pendant le setup.
    player.ports = [];
    giveCard(state, playerId, 'merchant_fleet', 'trade');
    expect(
      ckPlayProgress(playerId, 'test_merchant_fleet', state, { resource: 'ore' }).success,
    ).toBe(true);
    expect(getPortTradeRatio(player, 'ore', state)).toBe(2);
    expect(getPortTradeRatio(player, 'wheat', state)).toBeGreaterThan(2);
  });

  it('Monopole ressources prend jusqu’à 2 par adversaire', () => {
    const state = createCkPlaying(205);
    const playerA = state.turnOrder[0]!;
    const playerB = state.turnOrder[1]!;
    state.players.get(playerB)!.resources = { wheat: 3 };
    state.players.get(playerA)!.resources = {};
    giveCard(state, playerA, 'resource_monopoly', 'trade');
    expect(
      ckPlayProgress(playerA, 'test_resource_monopoly', state, { resource: 'wheat' }).success,
    ).toBe(true);
    expect(state.players.get(playerB)!.resources.wheat).toBe(1);
    expect(state.players.get(playerA)!.resources.wheat).toBe(2);

    const entry = state.actionLog[state.actionLog.length - 1]!;
    const impact = entry.data.progressImpact as CkProgressPlayImpact;
    expect(impact.cardType).toBe('resource_monopoly');
    expect(impact.targetPlayerIds).toEqual([playerB]);
    expect(impact.impacts[playerB]?.resourceDelta.wheat).toBe(-2);
    expect(impact.impacts[playerA]?.resourceDelta.wheat).toBe(2);

    const victimView = projectStateForViewer(state, playerB);
    const victimEntry = victimView.actionLog[victimView.actionLog.length - 1]!;
    const victimImpact = victimEntry.data.progressImpact as CkProgressPlayImpact;
    expect(victimImpact.impacts[playerB]?.resourceDelta.wheat).toBe(-2);
    expect(victimImpact.impacts[playerA]).toBeUndefined();
  });

  it('Construction de routes ajoute 2 routes gratuites', () => {
    const state = createCkPlaying(206);
    const playerId = state.turnOrder[0]!;
    giveCard(state, playerId, 'road_building', 'science');
    expect(ckPlayProgress(playerId, 'test_road_building', state).success).toBe(true);
    expect(state.players.get(playerId)!.freeRoadsRemaining).toBe(2);
  });

  it('Inventeur ne peut jamais déplacer un jeton 6 ou 8', () => {
    const state = createCkPlaying(207);
    const playerId = state.turnOrder[0]!;
    const redTile = [...state.map.values()].find(
      (tile) => tile.diceValue === 6 || tile.diceValue === 8,
    );
    const ordinaryTile = [...state.map.values()].find(
      (tile) => tile.diceValue != null && ![6, 8].includes(tile.diceValue),
    );
    expect(redTile).toBeTruthy();
    expect(ordinaryTile).toBeTruthy();
    giveCard(state, playerId, 'inventor', 'science');

    const redValue = redTile!.diceValue;
    const ordinaryValue = ordinaryTile!.diceValue;
    const result = ckPlayProgress(playerId, 'test_inventor', state, {
      tokenTileA: redTile!.id,
      tokenTileB: ordinaryTile!.id,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('6 et 8');
    expect(redTile!.diceValue).toBe(redValue);
    expect(ordinaryTile!.diceValue).toBe(ordinaryValue);
  });
});

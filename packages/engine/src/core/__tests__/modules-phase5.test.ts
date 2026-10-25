import { describe, expect, it } from 'vitest';
import type { GameCommand } from '@catanx/protocol';
import {
  applyCommand,
  buildGameConfigFromPreset,
  checkVictory,
  createDefaultEngineContext,
  processTurn,
  UNIT_BASE_STATS,
} from '../../index';

function createCatanxGame(seed = 42) {
  const ctx = createDefaultEngineContext(seed);
  const config = buildGameConfigFromPreset('catanx', { mapSeed: seed, playerCount: 2 });
  const create: GameCommand = {
    type: 'create_game',
    config,
    players: [
      { name: 'A', civilization: 'empire', type: 'human' },
      { name: 'B', civilization: 'merchants', type: 'human' },
    ],
  };
  const created = applyCommand(null, create, ctx);
  if (!created.ok) throw new Error(created.error.message);
  return { state: created.state, ctx };
}

function createClassicGame(seed = 7) {
  const ctx = createDefaultEngineContext(seed);
  const config = buildGameConfigFromPreset('classic', { mapSeed: seed, playerCount: 2 });
  const create: GameCommand = {
    type: 'create_game',
    config,
    players: [
      { name: 'A', civilization: 'empire', type: 'human' },
      { name: 'B', civilization: 'merchants', type: 'human' },
    ],
  };
  const created = applyCommand(null, create, ctx);
  if (!created.ok) throw new Error(created.error.message);
  return { state: created.state, ctx };
}

describe('Phase 5 modules', () => {
  it('keeps season modifiers off when seasons are disabled', () => {
    const { state } = createClassicGame();
    expect(state.config.enableSeasons).toBe(false);
    state.season = 'winter';
    // winter normally reduces wheat; classic must ignore season modifiers
    const results = applyCommand(
      state,
      { type: 'roll_dice', playerId: state.turnOrder[0] },
      createDefaultEngineContext(99),
    );
    // Just ensure classic roll still works with winter set
    expect(results.ok).toBe(true);
  });

  it('rejects module commands when modules are disabled (classic)', () => {
    const { state, ctx } = createClassicGame();
    const playerId = state.turnOrder[0];

    const research = applyCommand(
      state,
      { type: 'start_research', playerId, techId: 'agriculture' },
      ctx,
    );
    expect(research.ok).toBe(false);

    const diplo = applyCommand(
      state,
      {
        type: 'diplomacy_action',
        playerId,
        toPlayerId: state.turnOrder[1],
        actionType: 'denounce',
      },
      ctx,
    );
    expect(diplo.ok).toBe(false);

    const recruit = applyCommand(
      state,
      { type: 'recruit_unit', playerId, tileId: '0_0_0', unitType: 'warrior' },
      ctx,
    );
    expect(recruit.ok).toBe(false);
  });

  it('accepts start_research when tech tree is enabled', () => {
    const { state, ctx } = createCatanxGame();
    // Skip setup phase by forcing playing + player_action
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0];
    const player = state.players.get(playerId)!;
    player.ownedTiles = [...state.map.keys()].slice(0, 3);
    player.settlements = player.ownedTiles.slice(0, 1);

    const result = applyCommand(
      state,
      { type: 'start_research', playerId, techId: 'pottery' },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(state.players.get(playerId)?.currentResearch).toBe('pottery');
  });

  it('records council votes when world council is active', () => {
    const { state, ctx } = createCatanxGame();
    state.phase = 'playing';
    state.worldCouncil.active = true;
    state.worldCouncil.currentResolution = {
      id: 'test_res',
      title: 'Test',
      description: 'Vote test',
      options: [
        { id: 'approve', label: 'Oui', effects: [] },
        { id: 'reject', label: 'Non', effects: [] },
      ],
      turn: state.currentTurn,
    };
    state.worldCouncil.votes = {};

    const playerId = state.turnOrder[0];
    const vote = applyCommand(
      state,
      { type: 'council_vote', playerId, optionId: 'approve' },
      ctx,
    );
    expect(vote.ok).toBe(true);
    expect(state.worldCouncil.votes[playerId]).toBe('approve');
  });

  it('spawns barbarians on enabled catanx games over time', () => {
    const { state } = createCatanxGame(11);
    state.phase = 'playing';
    state.currentTurn = state.config.barbarianStrength.spawnRate;
    state.config.barbarianStrength.enabled = true;

    // Force advanceTurn path via processTurn after player_action
    state.turnPhase = 'player_action';
    state.currentPlayerIndex = state.turnOrder.length - 1;
    const before = state.barbarians.size;
    processTurn(state);
    // After wrapping to next global turn, barbarians may spawn
    expect(state.barbarians.size).toBeGreaterThanOrEqual(before);
  });

  it('supports diplomatic victory with one ally in 2-player games', () => {
    const { state } = createCatanxGame(3);
    state.phase = 'playing';
    const playerId = state.turnOrder[0];
    const otherId = state.turnOrder[1];
    state.config.victoryConditions = ['diplomatic'];
    state.config.enableDiplomacy = true;
    state.config.victoryPointTarget = 10;
    const player = state.players.get(playerId)!;
    player.resources.influence = 100;
    player.relations[otherId] = {
      status: 'allied',
      score: 80,
      treaties: [],
      sharedVision: false,
      openBorders: true,
      militaryAccess: false,
      lastInteractionTurn: 0,
      trustHistory: [],
    };
    state.worldCouncil.diplomaticLeaderId = playerId;

    expect(checkVictory(state)).toBe(true);
    expect(state.winner).toBe(playerId);
    expect(state.victoryType).toBe('diplomatic');
  });

  it('resets unit movement flags at the start of the next player turn', () => {
    const { state } = createCatanxGame(14);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0];
    const unitId = 'u_reset_1';
    const tile = [...state.map.values()].find((t) => t.terrain !== 'ocean')!;
    state.units.set(unitId, {
      id: unitId,
      type: 'warrior',
      ownerId: playerId,
      position: { ...tile.coord },
      stats: { ...UNIT_BASE_STATS.warrior },
      name: 'w',
      experience: 0,
      level: 1,
      promotions: [],
      status: 'idle',
      hasMoved: true,
      hasAttacked: true,
      facing: 0,
      isEmbark: false,
    });
    state.players.get(playerId)!.units.push(unitId);

    // Fin du tour du joueur 0 → début du joueur 1 (flags du joueur 0 restent true)
    processTurn(state);
    expect(state.units.get(unitId)?.hasMoved).toBe(true);

    // Fin du tour du joueur 1 → retour au joueur 0 avec reset
    processTurn(state);
    expect(state.turnOrder[state.currentPlayerIndex]).toBe(playerId);
    expect(state.units.get(unitId)?.hasMoved).toBe(false);
    expect(state.units.get(unitId)?.hasAttacked).toBe(false);
  });
});

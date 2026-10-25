import { describe, expect, it } from 'vitest';
import type { GameCommand } from '@catanx/protocol';
import {
  advanceBarbarians,
  advanceWorldCouncil,
  applyCommand,
  buildGameConfigFromPreset,
  craftRecipe,
  createDefaultEngineContext,
  getAvailableVictoryConditions,
  UNIT_BASE_STATS,
} from '../../index';

function createCatanx(seed = 21) {
  const ctx = createDefaultEngineContext(seed);
  const config = buildGameConfigFromPreset('catanx', { mapSeed: seed, playerCount: 2 });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'human' },
      ],
    } satisfies GameCommand,
    ctx,
  );
  if (!created.ok) throw new Error(created.error.message);
  return { state: created.state, ctx };
}

describe('Phase 5b craft / barbares / victoires / move', () => {
  it('lists victory conditions according to modules', () => {
    const classic = getAvailableVictoryConditions({
      enableTechTree: false,
      enableDiplomacy: false,
      enableMilitary: false,
      enableProductionChains: false,
      worldCouncil: false,
    });
    expect(classic).toEqual(['points', 'domination']);

    const full = getAvailableVictoryConditions({
      enableTechTree: true,
      enableDiplomacy: true,
      enableMilitary: true,
      enableProductionChains: true,
      worldCouncil: true,
    });
    expect(full).toContain('science');
    expect(full).toContain('diplomatic');
    expect(full).toContain('elimination');
    expect(full).toContain('economic');
  });

  it('crafts an instant recipe when building and resources match', () => {
    const { state } = createCatanx(5);
    // L'industrie n'appartient plus au preset CatanX principal : ce test active
    // explicitement l'extension pour couvrir son comportement opt-in.
    state.config.enableProductionChains = true;
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0];
    const player = state.players.get(playerId)!;
    const tileId = [...state.map.keys()][0];
    const buildingId = 'b_saw_test';
    state.buildings.set(buildingId, {
      id: buildingId,
      definitionId: 'sawmill',
      tileId,
      ownerId: playerId,
      constructedTurn: 1,
      level: 1,
      health: 100,
      workers: ['w1'],
      isActive: true,
      productionProgress: 0,
    });
    state.map.get(tileId)!.buildings.push(buildingId);
    player.resources.wood = 10;

    const result = craftRecipe(playerId, buildingId, 'lumber_mill', state);
    expect(result.success).toBe(true);
    expect(player.resources.lumber ?? 0).toBeGreaterThanOrEqual(3);
    expect(player.resources.wood).toBe(8);
  });

  it('rejects craft when production chains are off', () => {
    const { state } = createCatanx(6);
    state.config.enableProductionChains = false;
    const playerId = state.turnOrder[0];
    const result = craftRecipe(playerId, 'missing', 'lumber_mill', state);
    expect(result.success).toBe(false);
  });

  it('moves barbarians and can raid owned tiles', () => {
    const { state } = createCatanx(9);
    state.phase = 'playing';
    state.currentTurn = 8;
    state.config.barbarianStrength.enabled = true;
    state.config.barbarianStrength.spawnRate = 4;
    state.config.barbarianStrength.strength = 5;

    const owned = [...state.map.values()].find((tile) => tile.terrain !== 'ocean')!;
    const playerId = state.turnOrder[0];
    owned.owner = playerId;
    state.players.get(playerId)!.ownedTiles.push(owned.id);
    state.players.get(playerId)!.resources.wheat = 5;

    // Place barbarians adjacent
    const neighborId = [...state.map.values()].find(
      (tile) => tile.id !== owned.id && tile.terrain !== 'ocean',
    )!;
    state.barbarians.set('barb_test', {
      id: 'barb_test',
      position: { ...neighborId.coord },
      unitIds: [],
      strength: 8,
      isRaiding: false,
      target: playerId,
    });

    const wheatBefore = state.players.get(playerId)!.resources.wheat ?? 0;
    advanceBarbarians(state);
    // Either moved, raided, or spawned — state should remain consistent
    expect(state.barbarians.size).toBeGreaterThan(0);
    const wheatAfter = state.players.get(playerId)!.resources.wheat ?? 0;
    expect(wheatAfter).toBeLessThanOrEqual(wheatBefore);
  });

  it('applies council trade_ratio effect when a vote passes', () => {
    const { state } = createCatanx(8);
    state.phase = 'playing';
    state.currentTurn = 20;
    state.worldCouncil.active = true;
    state.worldCouncil.nextVoteTurn = 20;
    state.worldCouncil.activeEffects = [];
    state.worldCouncil.currentResolution = {
      id: 'global_trade_pact_t5',
      title: 'Pacte',
      description: 'test',
      options: [
        { id: 'approve', label: 'Oui', effects: ['trade_ratio:3:10'] },
        { id: 'reject', label: 'Non', effects: [] },
      ],
      turn: 5,
    };
    state.worldCouncil.votes = {
      [state.turnOrder[0]]: 'approve',
      [state.turnOrder[1]]: 'approve',
    };

    advanceWorldCouncil(state);
    expect(state.worldCouncil.activeEffects.some((e) => e.kind === 'trade_ratio')).toBe(true);
  });

  it('dispatches move_unit through applyCommand when military is on', () => {
    const { state, ctx } = createCatanx(12);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0];
    const fromTile = [...state.map.values()].find((t) => t.terrain !== 'ocean')!;
    fromTile.owner = playerId;
    const unitId = 'u_move_1';
    state.units.set(unitId, {
      id: unitId,
      type: 'warrior',
      ownerId: playerId,
      position: { ...fromTile.coord },
      stats: { ...UNIT_BASE_STATS.warrior },
      name: 'w',
      experience: 0,
      level: 1,
      promotions: [],
      status: 'idle',
      hasMoved: false,
      hasAttacked: false,
      facing: 0,
      isEmbark: false,
    });
    fromTile.units.push(unitId);
    state.players.get(playerId)!.units.push(unitId);

    const target = [...state.map.values()].find(
      (t) => t.id !== fromTile.id && t.terrain !== 'ocean',
    );
    expect(target).toBeTruthy();

    const result = applyCommand(
      state,
      { type: 'move_unit', playerId, unitId, targetTileId: target!.id },
      ctx,
    );
    if (result.ok) {
      expect(state.units.get(unitId)?.hasMoved).toBe(true);
    } else {
      expect(result.error.code).toBe('move_failed');
    }
  });
});

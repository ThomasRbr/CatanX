import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createDefaultEngineContext,
  createSnapshot,
  migrateLegacySave,
  modulesFromConfig,
  replayCommands,
  snapshotFromJSON,
  snapshotToGameState,
  snapshotToJSON,
} from '@catanx/engine';
import type { GameCommand } from '@catanx/protocol';

describe('module gating', () => {
  it('classic preset désactive les modules avancés', () => {
    const config = buildGameConfigFromPreset('classic');
    const modules = modulesFromConfig(config);
    expect(config.enableSeasons).toBe(false);
    expect(config.extensions?.seasons?.enabled).toBe(false);
    expect(modules.armies).toBe(false);
    expect(modules.technologies).toBe(false);
    expect(modules.events).toBe(false);
  });
});

describe('snapshots', () => {
  it('sérialise et recharge une partie', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 7, playerCount: 2 });
    const commands: GameCommand[] = [
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'human' },
          { name: 'B', civilization: 'empire', type: 'ai' },
        ],
      },
    ];
    const ctx = createDefaultEngineContext(7);
    const result = replayCommands(commands, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snapshot = createSnapshot(result.state, commands, 7);
    const json = snapshotToJSON(snapshot);
    const parsed = snapshotFromJSON(json);
    const reloaded = snapshotToGameState(parsed);

    expect(reloaded.id).toBe(result.state.id);
    expect(reloaded.config.mapSeed).toBe(7);
    expect(reloaded.players.size).toBe(2);
  });

  it('migre une sauvegarde legacy sans schemaVersion', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 3, playerCount: 2 });
    const ctx = createDefaultEngineContext(3);
    const created = applyCommand(null, {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'empire', type: 'ai' },
      ],
    }, ctx);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const legacy = JSON.stringify(created.state, (_k, v) => {
      if (v instanceof Map) return { __type: 'Map', value: Array.from(v.entries()) };
      if (v instanceof Set) return { __type: 'Set', value: Array.from(v.values()) };
      return v;
    });

    const migrated = migrateLegacySave(legacy);
    expect(migrated.schemaVersion).toBeGreaterThan(0);
    expect(migrated.config.mapSeed).toBe(3);
  });
});

describe('road_building', () => {
  it('accorde 2 routes gratuites', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 11, playerCount: 2 });
    const ctx = createDefaultEngineContext(11);
    const created = applyCommand(null, {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'empire', type: 'ai' },
      ],
    }, ctx);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const player = created.state.players.get(created.state.turnOrder[0]);
    expect(player).toBeTruthy();
    if (!player) return;

    player.devCards.push({
      id: 'card_test',
      type: 'road_building',
      acquiredTurn: 0,
      played: false,
    });

    created.state.turnPhase = 'player_action';
    const played = applyCommand(created.state, {
      type: 'play_dev_card',
      playerId: player.id,
      cardId: 'card_test',
    }, ctx);

    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const updated = played.state.players.get(player.id);
    expect(updated?.freeRoadsRemaining).toBe(2);
  });
});

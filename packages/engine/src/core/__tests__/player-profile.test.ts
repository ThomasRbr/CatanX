import { describe, expect, it } from 'vitest';
import {
  buildGameConfigFromPreset,
  createDefaultEngineContext,
  createSnapshot,
  replayCommands,
  snapshotFromJSON,
  snapshotToGameState,
  snapshotToJSON,
} from '@catanx/engine';
import type { GameCommand } from '@catanx/protocol';

describe('player visual profile', () => {
  it('survit à la création, au protocole et à une sauvegarde complète', () => {
    const profile = {
      portrait: 'navigator',
      accessory: 'captain',
      emblem: 'compass',
      banner: 'tide',
      frame: 'turquoise',
      title: 'pathfinder',
      tagline: 'Toujours un cap d’avance.',
      pieceColor: 'cyan',
      skinTone: 'honey',
      hairColor: 'copper',
      expression: 'joyful',
      outfit: 'voyager',
      aura: 'aurora',
      cardMaterial: 'holographic',
      pieceFinish: 'frosted',
      diceStyle: 'turquoise',
    } as const;
    const config = buildGameConfigFromPreset('classic', { mapSeed: 919, playerCount: 2 });
    const commands: GameCommand[] = [
      {
        type: 'create_game',
        config,
        players: [
          { name: 'Ariane', civilization: 'merchants', type: 'human', color: 'cyan', profile },
          { name: 'Bastien', civilization: 'empire', type: 'ai' },
        ],
      },
    ];
    const result = replayCommands(commands, createDefaultEngineContext(919));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const player = result.state.players.get(result.state.turnOrder[0]!);
    expect(player?.color).toBe('cyan');
    expect(player?.profile).toEqual(profile);

    const restored = snapshotToGameState(
      snapshotFromJSON(snapshotToJSON(createSnapshot(result.state, commands, 919))),
    );
    expect(restored.players.get(restored.turnOrder[0]!)?.profile).toEqual(profile);
  });
});

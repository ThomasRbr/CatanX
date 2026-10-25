import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  replayCommands,
  SeededRandom,
  validateModules,
  CATANX_PRESET,
  CLASSIC_PRESET,
} from '@catanx/engine';
import type { GameCommand } from '@catanx/protocol';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

describe('presets', () => {
  it('classic désactive les modules avancés', () => {
    const config = buildGameConfigFromPreset('classic');
    expect(config.mapSize).toBe('tiny');
    expect(config.victoryPointTarget).toBe(10);
    expect(config.enableMilitary).toBe(false);
    expect(config.enableTechTree).toBe(false);
    expect(config.enableEvents).toBe(false);
  });

  it("catanx conserve l'économie classique et laisse l'industrie en option", () => {
    const config = buildGameConfigFromPreset('catanx');
    expect(config.extensions?.seasons?.enabled).toBe(true);
    expect(CATANX_PRESET.modules.productionChains).toBe(false);
    expect(config.enableSeasons).toBe(true);
    expect(config.enableProductionChains).toBe(false);
  });

  it('valide les dépendances de modules', () => {
    const issues = validateModules({
      ...CLASSIC_PRESET.modules,
      productionChains: true,
      technologies: false,
    });
    expect(issues.some((i) => i.code === 'missing_dependency')).toBe(true);
  });
});

describe('applyCommand / replay', () => {
  it('crée une partie déterministe avec la même graine', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 42, playerCount: 2 });
    const players = [
      { name: 'A', civilization: 'empire', type: 'human' as const },
      { name: 'B', civilization: 'empire', type: 'ai' as const },
    ];
    const command: GameCommand = { type: 'create_game', config, players };

    const ctx1 = makeContext(42);
    const ctx2 = makeContext(42);
    const r1 = applyCommand(null, command, ctx1);
    const r2 = applyCommand(null, command, ctx2);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.state.id).toBe(r2.state.id);
    expect(r1.state.map.size).toBe(r2.state.map.size);
    expect([...r1.state.players.keys()]).toEqual([...r2.state.players.keys()]);
  });

  it('rejoue un journal de commandes identiquement', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 99, playerCount: 2 });
    const players = [
      { name: 'A', civilization: 'empire', type: 'human' as const },
      { name: 'B', civilization: 'empire', type: 'ai' as const },
    ];
    const log: GameCommand[] = [{ type: 'create_game', config, players }];

    const a = replayCommands(log, makeContext(99));
    const b = replayCommands(log, makeContext(99));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.state.currentTurn).toBe(b.state.currentTurn);
    expect(a.state.turnOrder).toEqual(b.state.turnOrder);
  });
});

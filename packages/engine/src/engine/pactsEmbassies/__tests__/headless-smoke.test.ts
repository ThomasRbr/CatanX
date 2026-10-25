/**
 * Smoke headless : parties courtes avec pactsEmbassies activé.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createEngineContext,
  createGame,
  defaultPactsEmbassiesConfig,
  SeededRandom,
  FixedClock,
  IncrementalIdGenerator,
  decideClassicAI,
} from '@catanx/engine';
import { autoCompleteClassicSetup } from '../../../sim/prepareClassicSetup';
import type { GameConfig } from '../../../types/game';

function ctx(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000 + seed),
    new IncrementalIdGenerator(),
  );
}

function config(seed: number): GameConfig {
  return {
    mode: 'standard',
    mapSize: 'tiny',
    mapSeed: seed,
    playerCount: 3,
    victoryConditions: ['points'],
    victoryPointTarget: 10,
    maxTurns: 40,
    enableSeasons: false,
    enableEvents: false,
    enableDiplomacy: false,
    enableMilitary: false,
    enableTechTree: false,
    enableProductionChains: false,
    fogOfWar: false,
    startingResources: 'none',
    barbarianStrength: {
      enabled: false,
      spawnRate: 0,
      strength: 0,
      scaling: false,
      navalBarbarians: false,
    },
    worldCouncil: false,
    difficultyModifier: 1,
    extensions: {
      pactsEmbassies: defaultPactsEmbassiesConfig({ enabled: true }),
    },
  };
}

const players = [
  { name: 'P1', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'P2', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'P3', civilization: 'empire' as const, type: 'ai' as const },
];

describe('pactsEmbassies headless smoke', () => {
  it('termine 8 parties sans exception (plafond tours)', () => {
    for (let seed = 200; seed < 208; seed += 1) {
      let state = createGame(config(seed), players);
      autoCompleteClassicSetup(state);
      expect(state.phase).toBe('playing');
      expect(state.config.victoryPointTarget).toBe(13);

      const engine = ctx(seed);
      let steps = 0;
      while (state.phase !== 'finished' && steps < 200) {
        steps += 1;
        const playerId = state.turnOrder[state.currentPlayerIndex]!;
        const decision = decideClassicAI(state, playerId, { difficulty: 'medium' });
        if (!decision || decision.kind !== 'command') {
          const end = applyCommand(state, { type: 'end_turn', playerId }, engine);
          if (!end.ok) break;
          state = end.state;
          continue;
        }
        const result = applyCommand(state, decision.command, engine);
        if (!result.ok) {
          const end = applyCommand(state, { type: 'end_turn', playerId }, engine);
          if (!end.ok) break;
          state = end.state;
          continue;
        }
        state = result.state;
      }
      expect(steps).toBeGreaterThan(5);
      expect(steps).toBeLessThanOrEqual(200);
      expect(state.extensions?.pactsEmbassies).toBeDefined();
      expect(state.extensions?.pactsEmbassies?.globalRound ?? 0).toBeGreaterThan(0);
    }
  }, 120_000);
});

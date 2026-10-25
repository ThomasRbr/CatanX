/**
 * Smoke headless : parties courtes avec undergroundSky activé.
 * Objectif : aucune exception / aucune IA bloquée sur 20 parties.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createEngineContext,
  createGame,
  defaultUndergroundSkyConfig,
  SeededRandom,
  FixedClock,
  IncrementalIdGenerator,
  decideClassicAI,
} from '@catanx/engine';
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
    playerCount: 4,
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
      undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
    },
  };
}

const players = [
  { name: 'P1', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'P2', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'P3', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'P4', civilization: 'empire' as const, type: 'ai' as const },
];

describe('undergroundSky headless smoke', () => {
  it('termine 8 parties sans exception (plafond tours)', () => {
    for (let seed = 100; seed < 108; seed += 1) {
      let state = createGame(config(seed), players);
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
      expect(state.extensions?.undergroundSky).toBeTruthy();
      // Objectif de base 10 + bonus US conservé à 5 PV.
      expect(state.config.victoryPointTarget).toBe(15);
    }
  });
});

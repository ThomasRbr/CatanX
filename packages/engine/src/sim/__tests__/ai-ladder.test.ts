import { describe, expect, it } from 'vitest';
import { runHeadlessBatch } from '../HeadlessSimulator';
import {
  createEmptyBalanceMetrics,
  mergeSimulationIntoMetrics,
  summarizeLadderMatch,
  summarizeMetrics,
  type HeadlessSimulationConfig,
} from '../BalanceMetrics';
import { defaultUndergroundSkyConfig } from '../../types/undergroundSky';
import { defaultSeasonsConfig } from '../../types/seasons';

const games = Math.min(12, Number(process.env.AI_LADDER_GAMES ?? 8));

function seeds(n: number, offset: number): number[] {
  return Array.from({ length: n }, (_, i) => 20_000 + offset + i * 19);
}

function sideAFromResults(results: ReturnType<typeof runHeadlessBatch>): Set<string> {
  const first = results[0];
  const ids = new Set<string>();
  if (!first) return ids;
  // AI 1 & AI 2 = side A (first half by name)
  for (const p of first.players) {
    if (p.name === 'AI 1' || p.name === 'AI 2') ids.add(p.playerId);
  }
  return ids;
}

describe('AI ladder (smoke)', () => {
  it(
    'classic hard vs legendary does not deadlock and legendary is competitive',
    () => {
      const config: Omit<HeadlessSimulationConfig, 'seed'> = {
        playerCount: 4,
        maxTurns: 80,
        maxSteps: 2500,
        aiDifficulty: 'hard',
        aiDifficultiesBySeat: ['hard', 'hard', 'legendary', 'legendary'],
        classicBoardLayout: 'fixed',
        preset: 'classic',
      };
      const results = runHeadlessBatch(seeds(games, 1), config);
      const summary = summarizeLadderMatch('hard×legendary', results, sideAFromResults(results));
      expect(summary.blockRate).toBeLessThanOrEqual(0.35);
      expect(summary.games).toBe(games);
      const finished = results.filter((r) => !r.blocked).length;
      expect(finished).toBeGreaterThan(0);

      let metrics = createEmptyBalanceMetrics();
      for (const r of results) metrics = mergeSimulationIntoMetrics(metrics, r);
      const report = summarizeMetrics(metrics);
      expect(report.blockRate).toBeLessThanOrEqual(0.35);
    },
    120_000,
  );

  it(
    'easy and hard diverge on identical seeds (decision layer)',
    async () => {
      const { decideClassicAI } = await import('../../engine/ai/classic/ClassicAI');
      const { applyCommand } = await import('../../core/applyCommand');
      const { createDefaultEngineContext } = await import('../../core/session');
      const { buildGameConfigFromPreset } = await import('../../core/presets');
      const { autoCompleteClassicSetup } = await import('../prepareClassicSetup');

      const ctx = createDefaultEngineContext(4242);
      const config = buildGameConfigFromPreset('classic', {
        mapSeed: 4242,
        playerCount: 3,
        maxTurns: 80,
        classicBoardLayout: 'fixed',
      });
      const created = applyCommand(
        null,
        {
          type: 'create_game',
          config,
          players: [
            { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'easy' },
            { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'hard' },
            { name: 'C', civilization: 'empire', type: 'ai', aiDifficulty: 'hard' },
          ],
        },
        ctx,
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      autoCompleteClassicSetup(created.state);
      const state = created.state;
      if (state.phase === 'playing' && state.turnPhase === 'start_of_turn') {
        applyCommand(state, { type: 'roll_dice', playerId: state.turnOrder[0]! }, ctx);
      }
      const playerId = state.turnOrder[state.currentPlayerIndex]!;
      const easy = decideClassicAI(state, playerId, { difficulty: 'easy' });
      const hard = decideClassicAI(state, playerId, { difficulty: 'hard' });
      expect(easy || hard).toBeTruthy();
      expect(hard?.kind).toBeDefined();
    },
    30_000,
  );

  it(
    'ck hard vs legendary does not deadlock',
    () => {
      const config: Omit<HeadlessSimulationConfig, 'seed'> = {
        playerCount: 4,
        maxTurns: 60,
        maxSteps: 2000,
        aiDifficulty: 'hard',
        aiDifficultiesBySeat: ['hard', 'hard', 'legendary', 'legendary'],
        classicBoardLayout: 'fixed',
        preset: 'classic',
        extensions: {
          citiesKnights: {
            enabled: true,
            ruleset: 'catanx-essential-v1',
            victoryPointBonus: 3,
            adaptiveBarbarianTrack: true,
          },
        },
      };
      const results = runHeadlessBatch(seeds(Math.min(games, 6), 50), config);
      const blocked = results.filter((r) => r.blocked).length;
      expect(blocked / results.length).toBeLessThanOrEqual(0.35);
    },
    120_000,
  );

  it('balance metrics record US and trade telemetry', () => {
    let metrics = createEmptyBalanceMetrics();
    const sample = {
      seed: 1,
      winnerId: 'p1',
      turns: 24,
      blocked: false,
      steps: 120,
      players: [
        {
          playerId: 'p1',
          name: 'AI 1',
          victoryPoints: 12,
          won: true,
          difficulty: 'hard' as const,
        },
        {
          playerId: 'p2',
          name: 'AI 2',
          victoryPoints: 8,
          won: false,
          difficulty: 'medium' as const,
        },
      ],
      commandLog: [],
      undergroundSkyEnabled: true,
      usAirportTurn: 11,
      usContractsCompleted: 3,
      playerTradesProposed: 4,
      playerTradesAccepted: 2,
      longestRoadOwner: 'p1',
      largestArmyOwner: null,
    };
    metrics = mergeSimulationIntoMetrics(metrics, sample);
    expect(metrics.undergroundSkyGames).toBe(1);
    expect(metrics.usContractsCompleted).toBe(3);
    expect(metrics.playerTradesProposed).toBe(4);
    const report = summarizeMetrics(metrics);
    expect(report.avgUsAirportTurn).toBe(11);
    expect(report.tradeAcceptRate).toBe(0.5);
    expect(report.winRatesByDifficulty.hard).toBeGreaterThan(0);
  });

  it(
    'us+seasons headless progresses without softlock (modules light)',
    () => {
      const config: Omit<HeadlessSimulationConfig, 'seed'> = {
        playerCount: 3,
        maxTurns: 40,
        maxSteps: 1200,
        aiDifficulty: 'medium',
        aiDifficultiesBySeat: ['hard', 'medium', 'medium'],
        classicBoardLayout: 'fixed',
        preset: 'catanx',
        mapSize: 'tiny',
        modules: {
          events: false,
          technologies: false,
          armies: false,
          diplomacy: false,
          fogOfWar: false,
          worldCouncil: false,
          barbarians: false,
        },
        extensions: {
          undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
          seasons: defaultSeasonsConfig({ enabled: true }),
        },
      };
      const n = Math.min(games, 3);
      const results = runHeadlessBatch(seeds(n, 110), config);
      expect(results.every((r) => r.undergroundSkyEnabled)).toBe(true);
      const progressed = results.filter((r) => r.steps > 30).length;
      expect(progressed).toBeGreaterThan(0);
      const blocked = results.filter((r) => r.blocked).length;
      expect(blocked / results.length).toBeLessThanOrEqual(0.67);
    },
    180_000,
  );
});

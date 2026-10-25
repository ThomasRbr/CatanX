import { describe, expect, it } from 'vitest';
import {
  createEmptyBalanceMetrics,
  mergeSimulationIntoMetrics,
  runHeadlessBatch,
  summarizeMetrics,
} from '@catanx/engine';

const CK_EXT = {
  citiesKnights: {
    enabled: true as const,
    ruleset: 'catanx-essential-v1' as const,
    victoryPointBonus: 3 as const,
    adaptiveBarbarianTrack: true as const,
  },
};

/**
 * Lot IA C&K. CI : 40 parties (défaut).
 * Batch long : `CK_BATCH_SIZE=1000 npm run sim:ck`
 */
describe('C&K headless batch', () => {
  it(
    'taux de blocage bas sur un lot de parties',
    () => {
      const games = Math.max(1, Number(process.env.CK_BATCH_SIZE ?? 40));
      const seeds = Array.from({ length: games }, (_, i) => 10_000 + i);
      const batch = runHeadlessBatch(seeds, {
        playerCount: 2,
        mapSize: 'tiny',
        maxTurns: 40,
        maxSteps: 900,
        aiDifficulty: 'easy',
        extensions: CK_EXT,
      });

      let metrics = createEmptyBalanceMetrics();
      for (const game of batch) {
        metrics = mergeSimulationIntoMetrics(metrics, game);
      }
      const summary = summarizeMetrics(metrics);

      expect(metrics.gamesPlayed).toBe(games);
      // Tolérance CI : quelques seeds peuvent encore stagner sans bloquer la livraison.
      expect(summary.blockRate).toBeLessThanOrEqual(games >= 200 ? 0.12 : 0.2);
      expect(summary.averageStepsPerGame).toBeGreaterThan(20);

      if (process.env.CK_BATCH_CLI === '1') {
        // eslint-disable-next-line no-console
        console.log(
          `[sim:ck] games=${games} blockRate=${summary.blockRate.toFixed(3)} ` +
            `avgSteps=${summary.averageStepsPerGame.toFixed(1)} avgTurns=${metrics.averageTurns.toFixed(1)}`,
        );
      }
    },
    Number(process.env.CK_BATCH_SIZE ?? 40) >= 200 ? 600_000 : 120_000,
  );
});

import type { AIDifficulty } from '../../../types/player';
import { randomFloat, randomInt } from '../../../core/rng';

export interface DifficultyPolicy {
  /** Probability of taking a non-mandatory scored action. */
  actionChance: number;
  /** On easy: chance to pick randomly among scored candidates. */
  suboptimalChance: number;
  /** Top-k window when picking suboptimal. */
  topK: number;
  /** Use L1 turn planner. */
  useTurnPlanner: boolean;
  /** Use L2 bounded search on critical decisions. */
  useBoundedSearch: boolean;
  /** Max actions simulated in a turn plan. */
  plannerDepth: number;
  /** Beam width for turn planner. */
  plannerBeam: number;
  /** Node budget for L2 search. */
  searchNodeBudget: number;
  /** Soft time budget (ms) for L2; soft-enforced via node checks. */
  searchTimeBudgetMs: number;
  /** Accept incoming player trades when Δeval is non-negative. */
  smartTradeAccept: boolean;
  /** Blind accept rate when smartTradeAccept is false. */
  blindAcceptRate: number;
  /** Allow outgoing player trades. */
  proposePlayerTrades: boolean;
  /** Allow bank trades toward builds. */
  allowBankTrades: boolean;
}

const POLICIES: Record<AIDifficulty, DifficultyPolicy> = {
  easy: {
    actionChance: 0.45,
    suboptimalChance: 0.5,
    topK: 5,
    useTurnPlanner: false,
    useBoundedSearch: false,
    plannerDepth: 0,
    plannerBeam: 1,
    searchNodeBudget: 0,
    searchTimeBudgetMs: 0,
    smartTradeAccept: false,
    blindAcceptRate: 0.55,
    proposePlayerTrades: false,
    allowBankTrades: false,
  },
  medium: {
    actionChance: 0.85,
    suboptimalChance: 0.1,
    topK: 2,
    useTurnPlanner: true,
    useBoundedSearch: false,
    plannerDepth: 3,
    plannerBeam: 4,
    searchNodeBudget: 0,
    searchTimeBudgetMs: 0,
    smartTradeAccept: true,
    blindAcceptRate: 0.85,
    proposePlayerTrades: true,
    allowBankTrades: true,
  },
  hard: {
    actionChance: 1,
    suboptimalChance: 0,
    topK: 1,
    useTurnPlanner: true,
    useBoundedSearch: false,
    plannerDepth: 5,
    plannerBeam: 6,
    searchNodeBudget: 0,
    searchTimeBudgetMs: 0,
    smartTradeAccept: true,
    blindAcceptRate: 1,
    proposePlayerTrades: true,
    allowBankTrades: true,
  },
  legendary: {
    actionChance: 1,
    suboptimalChance: 0,
    topK: 1,
    useTurnPlanner: true,
    useBoundedSearch: true,
    plannerDepth: 7,
    plannerBeam: 10,
    searchNodeBudget: 800,
    searchTimeBudgetMs: 40,
    smartTradeAccept: true,
    blindAcceptRate: 1,
    proposePlayerTrades: true,
    allowBankTrades: true,
  },
};

export function getDifficultyPolicy(difficulty: AIDifficulty): DifficultyPolicy {
  return POLICIES[difficulty] ?? POLICIES.medium;
}

export function shouldTakeRiskyAction(difficulty: AIDifficulty): boolean {
  return randomFloat(0, 1) < getDifficultyPolicy(difficulty).actionChance;
}

export function pickSuboptimal<T>(items: T[], difficulty: AIDifficulty): T | null {
  if (items.length === 0) return null;
  const policy = getDifficultyPolicy(difficulty);
  if (policy.suboptimalChance > 0 && items.length > 1 && randomFloat(0, 1) < policy.suboptimalChance) {
    const k = Math.min(policy.topK, items.length);
    return items[randomInt(0, k - 1)] ?? null;
  }
  return items[0] ?? null;
}

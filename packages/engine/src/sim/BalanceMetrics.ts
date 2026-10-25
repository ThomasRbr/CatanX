import type { GameCommand } from '@catanx/protocol';
import { AIDifficulty } from '../types/player';
import { GameState, type MapSize } from '../types/game';
import type { GameModules } from '../core/presets';
import type { GameExtensionsConfig } from '../types/citiesKnights';

export interface BalanceMetrics {
  gamesPlayed: number;
  winsByPlayer: Record<string, number>;
  /** Wins keyed by AI difficulty seat (aggregated across games). */
  winsByDifficulty?: Partial<Record<AIDifficulty, number>>;
  gamesByDifficulty?: Partial<Record<AIDifficulty, number>>;
  averageTurns: number;
  averageVictoryPoints: Record<string, number>;
  blockedGames: number;
  totalSteps: number;
  /** Trophy / C&K extras (optional aggregates). */
  longestRoadWins?: number;
  largestArmyWins?: number;
  defenderWins?: number;
  metropolisPlacements?: number;
  /** Saisons — agrégats optionnels. */
  seasonsEnabledGames?: number;
  severeClimateActivations?: number;
  seasonalBonusAwards?: number;
  /** Underground Sky aggregates. */
  undergroundSkyGames?: number;
  usAirportsBuilt?: number;
  usAirportsByTurnSum?: number;
  usAirportsByTurnCount?: number;
  usContractsCompleted?: number;
  /** Player trade aggregates. */
  playerTradesProposed?: number;
  playerTradesAccepted?: number;
}

export interface SimulationPlayerResult {
  playerId: string;
  name: string;
  victoryPoints: number;
  won: boolean;
  difficulty?: AIDifficulty;
}

export interface SimulationResult {
  seed: number;
  winnerId: string | null;
  turns: number;
  blocked: boolean;
  steps: number;
  players: SimulationPlayerResult[];
  commandLog: GameCommand[];
  seasonsEnabled?: boolean;
  severeClimateCount?: number;
  seasonalBonusCount?: number;
  undergroundSkyEnabled?: boolean;
  usAirportTurn?: number | null;
  usContractsCompleted?: number;
  playerTradesProposed?: number;
  playerTradesAccepted?: number;
  longestRoadOwner?: string | null;
  largestArmyOwner?: string | null;
}

export function createEmptyBalanceMetrics(): BalanceMetrics {
  return {
    gamesPlayed: 0,
    winsByPlayer: {},
    winsByDifficulty: {},
    gamesByDifficulty: {},
    averageTurns: 0,
    averageVictoryPoints: {},
    blockedGames: 0,
    totalSteps: 0,
    longestRoadWins: 0,
    largestArmyWins: 0,
    defenderWins: 0,
    metropolisPlacements: 0,
    seasonsEnabledGames: 0,
    severeClimateActivations: 0,
    seasonalBonusAwards: 0,
    undergroundSkyGames: 0,
    usAirportsBuilt: 0,
    usAirportsByTurnSum: 0,
    usAirportsByTurnCount: 0,
    usContractsCompleted: 0,
    playerTradesProposed: 0,
    playerTradesAccepted: 0,
  };
}

export function mergeSimulationIntoMetrics(
  metrics: BalanceMetrics,
  result: SimulationResult,
  extras?: {
    longestRoadOwner?: string | null;
    largestArmyOwner?: string | null;
    defenderVp?: Record<string, number>;
    metropolisCount?: number;
    seasonsEnabled?: boolean;
    severeClimateCount?: number;
    seasonalBonusCount?: number;
  },
): BalanceMetrics {
  const next: BalanceMetrics = {
    ...metrics,
    gamesPlayed: metrics.gamesPlayed + 1,
    winsByPlayer: { ...metrics.winsByPlayer },
    winsByDifficulty: { ...(metrics.winsByDifficulty ?? {}) },
    gamesByDifficulty: { ...(metrics.gamesByDifficulty ?? {}) },
    averageVictoryPoints: { ...metrics.averageVictoryPoints },
    blockedGames: metrics.blockedGames + (result.blocked ? 1 : 0),
    totalSteps: metrics.totalSteps + result.steps,
    longestRoadWins: metrics.longestRoadWins ?? 0,
    largestArmyWins: metrics.largestArmyWins ?? 0,
    defenderWins: metrics.defenderWins ?? 0,
    metropolisPlacements: metrics.metropolisPlacements ?? 0,
    seasonsEnabledGames: metrics.seasonsEnabledGames ?? 0,
    severeClimateActivations: metrics.severeClimateActivations ?? 0,
    seasonalBonusAwards: metrics.seasonalBonusAwards ?? 0,
    undergroundSkyGames: metrics.undergroundSkyGames ?? 0,
    usAirportsBuilt: metrics.usAirportsBuilt ?? 0,
    usAirportsByTurnSum: metrics.usAirportsByTurnSum ?? 0,
    usAirportsByTurnCount: metrics.usAirportsByTurnCount ?? 0,
    usContractsCompleted: metrics.usContractsCompleted ?? 0,
    playerTradesProposed: metrics.playerTradesProposed ?? 0,
    playerTradesAccepted: metrics.playerTradesAccepted ?? 0,
  };

  next.averageTurns =
    (metrics.averageTurns * metrics.gamesPlayed + result.turns) / next.gamesPlayed;

  for (const player of result.players) {
    if (player.difficulty) {
      next.gamesByDifficulty![player.difficulty] =
        (next.gamesByDifficulty![player.difficulty] ?? 0) + 1;
    }
    if (player.won) {
      next.winsByPlayer[player.playerId] = (next.winsByPlayer[player.playerId] ?? 0) + 1;
      if (player.difficulty) {
        next.winsByDifficulty![player.difficulty] =
          (next.winsByDifficulty![player.difficulty] ?? 0) + 1;
      }
    }
    const prevAvg = metrics.averageVictoryPoints[player.playerId] ?? 0;
    const prevCount = metrics.gamesPlayed;
    next.averageVictoryPoints[player.playerId] =
      (prevAvg * prevCount + player.victoryPoints) / next.gamesPlayed;
  }

  const lrOwner = extras?.longestRoadOwner ?? result.longestRoadOwner;
  const laOwner = extras?.largestArmyOwner ?? result.largestArmyOwner;
  if (lrOwner && result.winnerId === lrOwner) {
    next.longestRoadWins = (next.longestRoadWins ?? 0) + 1;
  }
  if (laOwner && result.winnerId === laOwner) {
    next.largestArmyWins = (next.largestArmyWins ?? 0) + 1;
  }
  if (extras?.metropolisCount) {
    next.metropolisPlacements =
      (next.metropolisPlacements ?? 0) + extras.metropolisCount;
  }
  if (extras?.defenderVp) {
    for (const [id, vp] of Object.entries(extras.defenderVp)) {
      if (vp > 0 && id === result.winnerId) {
        next.defenderWins = (next.defenderWins ?? 0) + 1;
      }
    }
  }
  if (extras?.seasonsEnabled || result.seasonsEnabled) {
    next.seasonsEnabledGames = (next.seasonsEnabledGames ?? 0) + 1;
  }
  const severe =
    extras?.severeClimateCount ?? result.severeClimateCount ?? 0;
  if (severe > 0) {
    next.severeClimateActivations =
      (next.severeClimateActivations ?? 0) + severe;
  }
  const bonuses =
    extras?.seasonalBonusCount ?? result.seasonalBonusCount ?? 0;
  if (bonuses > 0) {
    next.seasonalBonusAwards = (next.seasonalBonusAwards ?? 0) + bonuses;
  }

  if (result.undergroundSkyEnabled) {
    next.undergroundSkyGames = (next.undergroundSkyGames ?? 0) + 1;
  }
  if (result.usAirportTurn != null) {
    next.usAirportsBuilt = (next.usAirportsBuilt ?? 0) + 1;
    next.usAirportsByTurnSum =
      (next.usAirportsByTurnSum ?? 0) + result.usAirportTurn;
    next.usAirportsByTurnCount = (next.usAirportsByTurnCount ?? 0) + 1;
  }
  next.usContractsCompleted =
    (next.usContractsCompleted ?? 0) + (result.usContractsCompleted ?? 0);
  next.playerTradesProposed =
    (next.playerTradesProposed ?? 0) + (result.playerTradesProposed ?? 0);
  next.playerTradesAccepted =
    (next.playerTradesAccepted ?? 0) + (result.playerTradesAccepted ?? 0);

  return next;
}

export function summarizeMetrics(metrics: BalanceMetrics): {
  winRates: Record<string, number>;
  winRatesByDifficulty: Partial<Record<AIDifficulty, number>>;
  blockRate: number;
  averageStepsPerGame: number;
  avgUsAirportTurn: number | null;
  tradeAcceptRate: number | null;
} {
  const winRates: Record<string, number> = {};
  for (const [playerId, wins] of Object.entries(metrics.winsByPlayer)) {
    winRates[playerId] = metrics.gamesPlayed > 0 ? wins / metrics.gamesPlayed : 0;
  }

  const winRatesByDifficulty: Partial<Record<AIDifficulty, number>> = {};
  for (const diff of ['easy', 'medium', 'hard', 'legendary'] as AIDifficulty[]) {
    const games = metrics.gamesByDifficulty?.[diff] ?? 0;
    const wins = metrics.winsByDifficulty?.[diff] ?? 0;
    if (games > 0) winRatesByDifficulty[diff] = wins / games;
  }

  const proposed = metrics.playerTradesProposed ?? 0;
  const accepted = metrics.playerTradesAccepted ?? 0;
  const airportCount = metrics.usAirportsByTurnCount ?? 0;

  return {
    winRates,
    winRatesByDifficulty,
    blockRate: metrics.gamesPlayed > 0 ? metrics.blockedGames / metrics.gamesPlayed : 0,
    averageStepsPerGame: metrics.gamesPlayed > 0 ? metrics.totalSteps / metrics.gamesPlayed : 0,
    avgUsAirportTurn:
      airportCount > 0
        ? (metrics.usAirportsByTurnSum ?? 0) / airportCount
        : null,
    tradeAcceptRate: proposed > 0 ? accepted / proposed : null,
  };
}

/** Derive command-log counters for a finished simulation. */
export function extractSimulationTelemetry(commandLog: GameCommand[]): {
  usAirportTurn: number | null;
  usContractsCompleted: number;
  playerTradesProposed: number;
  playerTradesAccepted: number;
} {
  let usAirportTurn: number | null = null;
  let usContractsCompleted = 0;
  let playerTradesProposed = 0;
  let playerTradesAccepted = 0;
  let turnHint = 0;
  for (const cmd of commandLog) {
    if (cmd.type === 'end_turn') turnHint += 1;
    if (cmd.type === 'roll_dice') turnHint = Math.max(turnHint, 1);
    if (cmd.type === 'us_build_airport' && usAirportTurn == null) {
      usAirportTurn = Math.max(1, turnHint);
    }
    if (cmd.type === 'us_complete_contract') usContractsCompleted += 1;
    if (cmd.type === 'propose_player_trade') playerTradesProposed += 1;
    if (cmd.type === 'accept_player_trade') playerTradesAccepted += 1;
  }
  return {
    usAirportTurn,
    usContractsCompleted,
    playerTradesProposed,
    playerTradesAccepted,
  };
}

/** Cross-difficulty ladder summary. */
export interface LadderMatchResult {
  label: string;
  games: number;
  winsA: number;
  winsB: number;
  blockRate: number;
  winRateA: number;
}

export function summarizeLadderMatch(
  label: string,
  results: SimulationResult[],
  sideAPlayerIds: Set<string>,
): LadderMatchResult {
  let winsA = 0;
  let winsB = 0;
  let blocked = 0;
  for (const r of results) {
    if (r.blocked) blocked += 1;
    if (!r.winnerId) continue;
    if (sideAPlayerIds.has(r.winnerId)) winsA += 1;
    else winsB += 1;
  }
  const decided = winsA + winsB;
  return {
    label,
    games: results.length,
    winsA,
    winsB,
    blockRate: results.length > 0 ? blocked / results.length : 0,
    winRateA: decided > 0 ? winsA / decided : 0,
  };
}

export interface HeadlessSimulationConfig {
  seed: number;
  playerCount: number;
  maxTurns: number;
  maxSteps: number;
  aiDifficulty: AIDifficulty;
  /** Optional per-seat difficulties (index → difficulty). Overrides aiDifficulty when set. */
  aiDifficultiesBySeat?: AIDifficulty[];
  classicBoardLayout?: 'fixed' | 'random';
  /** Preset de base (défaut classic). */
  preset?: 'classic' | 'catanx' | 'custom' | 'scenario';
  mapSize?: MapSize;
  modules?: Partial<GameModules>;
  extensions?: GameExtensionsConfig;
}

export function buildSimulationPlayers(
  state: GameState,
  winnerId: string | null,
): SimulationPlayerResult[] {
  return [...state.players.values()].map((player) => ({
    playerId: player.id,
    name: player.name,
    victoryPoints: player.stats.victoryPoints,
    won: player.id === winnerId,
    difficulty: player.aiDifficulty,
  }));
}

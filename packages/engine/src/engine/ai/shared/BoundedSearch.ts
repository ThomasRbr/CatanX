import type { GameState } from '../../../types/game';
import type { AIDifficulty } from '../../../types/player';
import { evaluatePosition } from './PositionEvaluator';
import { getDifficultyPolicy } from './DifficultyPolicy';
import { opponentThreatScore } from './TrophyThreat';
import { isClassicLandTerrain } from '../../catan/CatanTopology';
import { usesTopologicalPlacement } from '../../catan/ClassicBoard';

export interface ScoredTile {
  tileId: string;
  score: number;
}

function diceWeight(value: number | null | undefined): number {
  if (!value) return 0;
  return 6 - Math.abs(7 - value);
}

/** Players who actually touch a hex via topo buildings (or legacy settlements/cities). */
export function playersTouchingTile(
  state: GameState,
  tileId: string,
  excludePlayerId?: string,
): string[] {
  const owners = new Set<string>();
  const board = state.classicBoard;

  if (usesTopologicalPlacement(state) && board) {
    for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
      if (excludePlayerId && owner === excludePlayerId) continue;
      const tiles = board.topology.intersections[iid]?.tileIds ?? [];
      if (tiles.includes(tileId)) owners.add(owner);
    }
  } else {
    for (const [id, p] of state.players) {
      if (excludePlayerId && id === excludePlayerId) continue;
      if (p.settlements.includes(tileId) || p.cities.includes(tileId)) owners.add(id);
    }
  }

  return [...owners];
}

export function scoreRobberTile(
  state: GameState,
  playerId: string,
  tileId: string,
): number {
  if (tileId === state.robberPosition) return -999;
  const tile = state.map.get(tileId);
  if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') return -999;

  const victims = playersTouchingTile(state, tileId, playerId);
  if (victims.length === 0) return -50;

  let score = diceWeight(tile.diceValue) * 2;
  for (const vid of victims) {
    score += opponentThreatScore(state, vid);
    const buildingMult = (() => {
      const board = state.classicBoard;
      if (!board) return 1;
      let m = 1;
      for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
        if (owner !== vid) continue;
        if (!(board.topology.intersections[iid]?.tileIds ?? []).includes(tileId)) continue;
        const bid = board.buildingByIntersection[iid];
        const b = bid ? state.buildings.get(bid) : undefined;
        if (b?.definitionId === 'city' || b?.definitionId === 'metropolis') m = 2;
      }
      return m;
    })();
    score += diceWeight(tile.diceValue) * 3 * buildingMult;
  }
  return score;
}

export function listScoredRobberTiles(state: GameState, playerId: string): ScoredTile[] {
  return [...state.map.entries()]
    .filter(([, tile]) => isClassicLandTerrain(tile.terrain) && tile.terrain !== 'desert')
    .map(([tileId]) => ({ tileId, score: scoreRobberTile(state, playerId, tileId) }))
    .filter((e) => e.score > -900)
    .sort((a, b) => b.score - a.score);
}

export interface BoundedSearchOptions {
  difficulty: AIDifficulty;
  /** Candidate tile ids already filtered. */
  candidates: string[];
}

/**
 * L2: expectimax-lite over robber / critical tile choices.
 * Scores each candidate by victim production loss × threat VP + eval nudge.
 */
export function boundedChooseBestTile(
  state: GameState,
  playerId: string,
  options: BoundedSearchOptions,
): string | null {
  const policy = getDifficultyPolicy(options.difficulty);
  const scored = options.candidates
    .map((tileId) => ({ tileId, score: scoreRobberTile(state, playerId, tileId) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (!policy.useBoundedSearch) return scored[0]!.tileId;

  const budget = Math.max(1, policy.searchNodeBudget);
  const limit = Math.min(scored.length, Math.max(4, Math.floor(budget / 15)));
  let bestId = scored[0]!.tileId;
  let bestScore = Number.NEGATIVE_INFINITY;
  let nodes = 0;
  const myEval = evaluatePosition(state, playerId);

  for (const entry of scored.slice(0, limit)) {
    nodes += 1;
    if (nodes > budget) break;
    const victims = playersTouchingTile(state, entry.tileId, playerId);
    let expectimax = entry.score;
    for (const vid of victims) {
      // Approximate lost production for victim × how close they are to winning
      expectimax += opponentThreatScore(state, vid) * 0.35;
    }
    // Prefer denying the current VP leader when scores are close
    const leaderBoost = victims.some((vid) => {
      const p = state.players.get(vid);
      return p && p.stats.victoryPoints >= (state.players.get(playerId)?.stats.victoryPoints ?? 0) + 1;
    })
      ? 4
      : 0;
    const total = expectimax + leaderBoost + myEval * 0.002;
    if (total > bestScore) {
      bestScore = total;
      bestId = entry.tileId;
    }
  }

  return bestId;
}

/** Setup / critical pick among a shortlist: keep best, break near-ties toward higher score stability. */
export function boundedPickFromScored<T extends { score: number }>(
  items: T[],
  difficulty: AIDifficulty,
): T | null {
  if (items.length === 0) return null;
  const policy = getDifficultyPolicy(difficulty);
  if (!policy.useBoundedSearch) return items[0] ?? null;
  const best = items[0]!.score;
  const window = items.filter((i) => i.score >= best - 1.5).slice(0, 5);
  // Prefer the highest-scoring among the near-tie window (already sorted)
  return window[0] ?? items[0] ?? null;
}

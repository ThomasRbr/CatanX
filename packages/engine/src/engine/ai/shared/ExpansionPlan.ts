/**
 * Plan d’expansion multitour : cible village + chemin de routes minimal.
 * Évite les routes « autour de l’hex » qui ne réduisent pas le chemin.
 */

import type { GameState } from '../../../types/game';
import type { ResourceBundle } from '../../../types/resources';
import { listClassicSettlementCandidates } from '../../catan/ClassicCommands';
import { usesTopologicalPlacement } from '../../catan/ClassicBoard';
import { intersectionTouchesLand } from '../../catan/CatanTopology';
import { isCitiesKnightsEnabled } from '../../../core/extensions';
import { isBlockedByEnemyKnight } from '../../citiesKnights/knights';
import { applySeasonalBuildCost } from '../../seasons/costs';
import { snapshotTrophyThreat } from './TrophyThreat';
import {
  clearExpansionStickyTarget,
  getPlayerAiMemory,
  setExpansionStickyTarget,
} from './AiMemory';

const SETTLEMENT_COST: ResourceBundle = {
  wood: 1,
  clay: 1,
  wheat: 1,
  sheep: 1,
};

export interface ExpansionPlan {
  targetIntersectionId: string | null;
  /** Arêtes encore à construire, ordonnées depuis le réseau jusqu’à la cible. */
  pathEdgeIds: string[];
  nextEdgeId: string | null;
  pathLength: number;
  targetScore: number;
  /** Prioriser village / trade banque plutôt que routes hors chemin. */
  focusSettlement: boolean;
}

type AdjLink = { to: string; edgeId: string };

function buildAdjacency(state: GameState): Map<string, AdjLink[]> {
  const board = state.classicBoard!;
  const adj = new Map<string, AdjLink[]>();
  for (const edge of Object.values(board.topology.edges)) {
    if (!adj.has(edge.a)) adj.set(edge.a, []);
    if (!adj.has(edge.b)) adj.set(edge.b, []);
    adj.get(edge.a)!.push({ to: edge.b, edgeId: edge.id });
    adj.get(edge.b)!.push({ to: edge.a, edgeId: edge.id });
  }
  return adj;
}

/** Intersections déjà touchées par le réseau du joueur (bâtiment ou route). */
export function playerNetworkIntersections(
  state: GameState,
  playerId: string,
): Set<string> {
  const board = state.classicBoard!;
  const out = new Set<string>();
  for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
    if (owner === playerId) out.add(iid);
  }
  for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
    if (owner !== playerId) continue;
    const edge = board.topology.edges[edgeId];
    if (!edge) continue;
    out.add(edge.a);
    out.add(edge.b);
  }
  return out;
}

/**
 * Chemin de construction minimal (0-1 BFS) :
 * - route déjà à soi : coût 0
 * - arête libre : coût 1
 * - route adverse / chevalier bloquant : impassable
 */
export function shortestBuildPathTo(
  state: GameState,
  playerId: string,
  targetIntersectionId: string,
): string[] | null {
  const board = state.classicBoard;
  if (!board) return null;
  const start = playerNetworkIntersections(state, playerId);
  if (start.size === 0) return null;
  if (start.has(targetIntersectionId)) return [];

  const adj = buildAdjacency(state);
  const dist = new Map<string, number>();
  const prev = new Map<string, { from: string; edgeId: string; build: boolean }>();
  const deque: string[] = [];

  for (const s of start) {
    dist.set(s, 0);
    deque.push(s);
  }

  while (deque.length > 0) {
    const cur = deque.shift()!;
    const d = dist.get(cur) ?? 0;
    if (cur === targetIntersectionId) break;

    for (const link of adj.get(cur) ?? []) {
      const owner = board.roadsByEdge[link.edgeId];
      if (owner && owner !== playerId) continue;
      if (
        isCitiesKnightsEnabled(state) &&
        (isBlockedByEnemyKnight(state, cur, playerId) ||
          isBlockedByEnemyKnight(state, link.to, playerId))
      ) {
        continue;
      }

      const build = owner !== playerId;
      const stepCost = build ? 1 : 0;
      const nextDist = d + stepCost;
      const prevDist = dist.get(link.to);
      if (prevDist !== undefined && prevDist <= nextDist) continue;

      dist.set(link.to, nextDist);
      prev.set(link.to, { from: cur, edgeId: link.edgeId, build });
      if (stepCost === 0) deque.unshift(link.to);
      else deque.push(link.to);
    }
  }

  if (!dist.has(targetIntersectionId)) return null;

  const edges: string[] = [];
  let walk: string | undefined = targetIntersectionId;
  const guard = new Set<string>();
  while (walk && !start.has(walk)) {
    if (guard.has(walk)) return null;
    guard.add(walk);
    const step = prev.get(walk);
    if (!step) return null;
    if (step.build) edges.push(step.edgeId);
    walk = step.from;
  }
  edges.reverse();
  return edges;
}

function settlementCost(state: GameState, playerId: string): ResourceBundle {
  return applySeasonalBuildCost(state, playerId, 'settlement', SETTLEMENT_COST);
}

/**
 * Choisit la meilleure cible : score village − pénalité longueur de chemin.
 */
export function computeExpansionPlan(
  state: GameState,
  playerId: string,
): ExpansionPlan {
  const empty: ExpansionPlan = {
    targetIntersectionId: null,
    pathEdgeIds: [],
    nextEdgeId: null,
    pathLength: 0,
    targetScore: 0,
    focusSettlement: false,
  };

  if (!usesTopologicalPlacement(state) || !state.classicBoard) return empty;

  const board = state.classicBoard;
  const stock = board.piecesRemaining[playerId];
  // Plus de villages en stock → pas de plan d’expansion village
  if (!stock || stock.settlements <= 0) return empty;

  let settlements = listClassicSettlementCandidates(state, playerId);
  if (isCitiesKnightsEnabled(state)) {
    settlements = settlements.filter(
      (c) => !isBlockedByEnemyKnight(state, c.intersectionId, playerId),
    );
  }

  type Candidate = { intersectionId: string; score: number; path: string[] };
  const evaluated: Candidate[] = [];

  // 1) Spots déjà placeables (touchent une route) — chemin vide
  for (const s of settlements.slice(0, 12)) {
    evaluated.push({
      intersectionId: s.intersectionId,
      score: s.score,
      path: [],
    });
  }

  // 2) Spots futurs joignables (pas encore adjacents à une route)
  const network = playerNetworkIntersections(state, playerId);
  const roadsLeft = stock.roads ?? 0;
  const virtualTargets: Array<{ intersectionId: string; score: number }> = [];

  for (const iid of Object.keys(board.topology.intersections)) {
    if (board.occupiedIntersections[iid]) continue;
    if (!intersectionTouchesLand(board.topology, state.map, iid)) continue;
    const inter = board.topology.intersections[iid]!;
    if (inter.neighborIds.some((n) => board.occupiedIntersections[n])) continue;
    if (settlements.some((s) => s.intersectionId === iid)) continue;
    if (isCitiesKnightsEnabled(state) && isBlockedByEnemyKnight(state, iid, playerId)) {
      continue;
    }

    let prod = 0;
    for (const tileId of inter.tileIds) {
      const tile = state.map.get(tileId);
      if (!tile?.diceValue) continue;
      prod += 6 - Math.abs(7 - tile.diceValue);
      if (tile.port) prod += 2;
    }
    if (prod <= 0) continue;
    virtualTargets.push({ intersectionId: iid, score: 50 + prod });
  }
  virtualTargets.sort((a, b) => b.score - a.score);

  for (const v of virtualTargets.slice(0, 24)) {
    const path = shortestBuildPathTo(state, playerId, v.intersectionId);
    if (!path) continue;
    if (path.length === 0) continue; // déjà sur réseau mais pas candidat → invalide / stock
    if (path.length > 6) continue;
    if (path.length > roadsLeft) continue; // impossible avec le stock actuel
    evaluated.push({
      intersectionId: v.intersectionId,
      score: v.score,
      path,
    });
  }

  if (evaluated.length === 0) {
    clearExpansionStickyTarget(state, playerId);
    return empty;
  }

  const mem = getPlayerAiMemory(state, playerId);
  // Sticky : abandonner si un village est déjà placeable ailleurs
  const placeableNow = evaluated.some((c) => c.path.length === 0);
  if (placeableNow && mem.expansionTargetId) {
    const stickyPlaceable = evaluated.find(
      (c) => c.intersectionId === mem.expansionTargetId && c.path.length === 0,
    );
    if (!stickyPlaceable) {
      clearExpansionStickyTarget(state, playerId);
    }
  }

  // Sticky : garder la cible mémorisée si encore dans les candidats et chemin ≤ sticky+1
  if (mem.expansionTargetId) {
    const sticky = evaluated.find((c) => c.intersectionId === mem.expansionTargetId);
    if (sticky) {
      const stillGood =
        sticky.path.length <= Math.max(mem.lastPathLength, 0) + 1 &&
        sticky.path.length <= 6;
      if (stillGood) {
        const pathLength = sticky.path.length;
        const threat = snapshotTrophyThreat(state, playerId);
        const focusSettlement =
          pathLength === 0 || (pathLength <= 2 && threat.longestRoadPressure < 2);
        setExpansionStickyTarget(state, playerId, sticky.intersectionId, pathLength);
        return {
          targetIntersectionId: sticky.intersectionId,
          pathEdgeIds: sticky.path,
          nextEdgeId: sticky.path[0] ?? null,
          pathLength,
          targetScore: sticky.score,
          focusSettlement,
        };
      }
    }
    // Cible invalide
    clearExpansionStickyTarget(state, playerId);
  }

  let best: Candidate | null = null;
  let bestValue = -Infinity;
  for (const c of evaluated) {
    let value = c.score - c.path.length * 18;
    // Port race : privilégier les spots touchant un port
    const inter = board.topology.intersections[c.intersectionId];
    if (inter) {
      const touchesPort = inter.tileIds.some((tid) => Boolean(state.map.get(tid)?.port));
      if (touchesPort) value += 14;
      // Deny : adversaire déjà connecté au voisinage
      let enemyNear = 0;
      for (const nid of inter.neighborIds) {
        for (const edge of Object.values(board.topology.edges)) {
          if (edge.a !== nid && edge.b !== nid) continue;
          const owner = board.roadsByEdge[edge.id];
          if (owner && owner !== playerId) enemyNear += 1;
        }
      }
      if (enemyNear > 0) value += 8 + enemyNear * 2;
    }
    if (value > bestValue) {
      bestValue = value;
      best = c;
    }
  }
  if (!best) {
    clearExpansionStickyTarget(state, playerId);
    return empty;
  }

  const pathLength = best.path.length;
  const threat = snapshotTrophyThreat(state, playerId);

  const focusSettlement =
    pathLength === 0 || (pathLength <= 2 && threat.longestRoadPressure < 2);

  setExpansionStickyTarget(state, playerId, best.intersectionId, pathLength);

  return {
    targetIntersectionId: best.intersectionId,
    pathEdgeIds: best.path,
    nextEdgeId: best.path[0] ?? null,
    pathLength,
    targetScore: best.score,
    focusSettlement,
  };
}

/**
 * Bonus / malus pour une arête candidate selon le plan d’expansion.
 */
export function roadPlanBonus(
  state: GameState,
  playerId: string,
  edgeId: string,
  plan?: ExpansionPlan,
): number {
  const expansion = plan ?? computeExpansionPlan(state, playerId);
  const threat = snapshotTrophyThreat(state, playerId);

  if (!expansion.targetIntersectionId || expansion.pathEdgeIds.length === 0) {
    // Village adjacent (path vide) : ne pas encourager les routes parasites
    if (expansion.pathLength === 0 && expansion.targetIntersectionId) {
      return threat.longestRoadPressure >= 2 ? 3 : -18;
    }
    if (threat.longestRoadPressure > 0) return 4;
    return -8;
  }

  const idx = expansion.pathEdgeIds.indexOf(edgeId);
  if (idx === 0) {
    return 45 + Math.max(0, 12 - expansion.pathLength * 2);
  }
  if (idx > 0) {
    return 20 - idx * 3;
  }

  if (threat.longestRoadPressure >= 2) return 2;
  if (expansion.focusSettlement) return -20;
  return -12;
}

/** @deprecated alias — utiliser roadPlanBonus */
export function roadGoalBonus(
  state: GameState,
  playerId: string,
  edgeId: string,
): number {
  return roadPlanBonus(state, playerId, edgeId);
}

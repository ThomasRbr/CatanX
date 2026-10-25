import { GameState } from '../../../types/game';
import {
  CatanTopology,
  chooseSettlementAnchorTile,
  intersectionTouchesLand,
  isClassicLandTerrain,
} from '../../catan/CatanTopology';
import type { PortType } from '../../../types/hex';
import { normalizePortType } from '../../../types/hex';
import { seasonResourceBonus } from '../shared/SeasonBias';
import { pickSuboptimal } from '../shared/DifficultyPolicy';
import { boundedPickFromScored } from '../shared/BoundedSearch';
import type { AIDifficulty } from '../../../types/player';
import { getDifficultyPolicy } from '../shared/DifficultyPolicy';

export interface ClassicSetupContext {
  topology: CatanTopology;
  occupiedIntersections: Record<string, string>;
  anchorUsageByTile: Record<string, number>;
  anchorIntersectionId: string | null;
  roadsByEdge: Record<string, string>;
}

function diceWeight(value: number | null): number {
  if (!value) return 0;
  return 6 - Math.abs(7 - value);
}

function portBonus(port: PortType | null | undefined, resources: Set<string>): number {
  const normalized = normalizePortType(port);
  if (!normalized) return 0;
  if (normalized === 'generic_3:1') return 2;
  const resource = normalized.replace(/_2:1$/, '');
  if (resource && !resources.has(resource)) return 3.5;
  return 2.2;
}

function numberCollisionPenalty(
  diceValues: number[],
  ownedDice: number[],
): number {
  let penalty = 0;
  const counts = new Map<number, number>();
  for (const v of [...diceValues, ...ownedDice]) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  for (const [v, c] of counts) {
    if (c > 1 && (v === 6 || v === 8)) penalty += 4 * (c - 1);
    else if (c > 1 && (v === 5 || v === 9)) penalty += 2 * (c - 1);
    else if (c > 1) penalty += 1 * (c - 1);
  }
  return penalty;
}

function playerOwnedDice(state: GameState, playerId: string, setup: ClassicSetupContext): number[] {
  const out: number[] = [];
  for (const [iid, owner] of Object.entries(setup.occupiedIntersections)) {
    if (owner !== playerId) continue;
    const intersection = setup.topology.intersections[iid];
    if (!intersection) continue;
    for (const tileId of intersection.tileIds) {
      const tile = state.map.get(tileId);
      if (tile?.diceValue) out.push(tile.diceValue);
    }
  }
  return out;
}

function blockOpponentBonus(
  state: GameState,
  setup: ClassicSetupContext,
  intersectionId: string,
  playerId: string | null,
): number {
  // Mild: intersections that deny a high-value spot near opponents' roads/settlements
  const intersection = setup.topology.intersections[intersectionId];
  if (!intersection) return 0;
  let bonus = 0;
  for (const n of intersection.neighborIds) {
    const owner = setup.occupiedIntersections[n];
    if (owner && owner !== playerId) bonus += 0.8;
  }
  return bonus;
}

export function scoreClassicSetupIntersection(
  state: GameState,
  setup: ClassicSetupContext,
  intersectionId: string,
  options?: { playerId?: string | null },
): number {
  const intersection = setup.topology.intersections[intersectionId];
  if (!intersection) return Number.NEGATIVE_INFINITY;
  if (!intersectionTouchesLand(setup.topology, state.map, intersectionId)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (setup.occupiedIntersections[intersectionId]) return Number.NEGATIVE_INFINITY;
  const blockedByNeighbor = intersection.neighborIds.some((neighborId) =>
    Boolean(setup.occupiedIntersections[neighborId]),
  );
  if (blockedByNeighbor) return Number.NEGATIVE_INFINITY;

  const anchorTileId = chooseSettlementAnchorTile(
    setup.topology,
    state.map,
    intersectionId,
    setup.anchorUsageByTile,
  );
  if (!anchorTileId) return Number.NEGATIVE_INFINITY;

  const resources = new Set<string>();
  const diceValues: number[] = [];
  let score = 0;
  for (const tileId of intersection.tileIds) {
    const tile = state.map.get(tileId);
    if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') continue;
      score += diceWeight(tile.diceValue) * 2;
      score += portBonus(tile.port, resources);
    if (tile.diceValue) diceValues.push(tile.diceValue);
    for (const resource of Object.keys(tile.baseProduction ?? {})) {
      resources.add(resource);
    }
  }

  score += resources.size * 1.2;
  score -= (setup.anchorUsageByTile[anchorTileId] ?? 0) * 2;

  const owned = options?.playerId
    ? playerOwnedDice(state, options.playerId, setup)
    : [];
  score -= numberCollisionPenalty(diceValues, owned);

  if (options?.playerId) {
    score += blockOpponentBonus(state, setup, intersectionId, options.playerId);
  }

  score += seasonResourceBonus(state, resources, Math.max(1, score));

  return score;
}

export function chooseClassicSetupIntersection(
  state: GameState,
  setup: ClassicSetupContext,
  options?: { playerId?: string | null; difficulty?: AIDifficulty },
): string | null {
  const entries = Object.entries(setup.topology.intersections);
  const scored: Array<{ id: string; score: number }> = [];

  for (const [intersectionId] of entries) {
    const score = scoreClassicSetupIntersection(state, setup, intersectionId, {
      playerId: options?.playerId ?? state.setupPlayerOrder?.[state.setupPlacementIndex] ?? null,
    });
    if (score === Number.NEGATIVE_INFINITY) continue;
    scored.push({ id: intersectionId, score });
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  const difficulty = options?.difficulty ?? 'medium';
  const policy = getDifficultyPolicy(difficulty);
  if (policy.useBoundedSearch) {
    return boundedPickFromScored(scored, difficulty)?.id ?? null;
  }
  return pickSuboptimal(
    scored.map((s) => s.id),
    difficulty,
  );
}

export function chooseClassicSetupEdge(
  state: GameState,
  setup: ClassicSetupContext,
): string | null {
  if (!setup.anchorIntersectionId) return null;

  const candidates = Object.entries(setup.topology.edges).filter(([edgeId, edge]) => {
    if (setup.roadsByEdge[edgeId]) return false;
    return edge.a === setup.anchorIntersectionId || edge.b === setup.anchorIntersectionId;
  });

  let bestId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const [edgeId, edge] of candidates) {
    const targetIntersectionId = edge.a === setup.anchorIntersectionId ? edge.b : edge.a;
    const targetIntersection = setup.topology.intersections[targetIntersectionId];
    if (!targetIntersection) continue;

    let score = 0;
    const resources = new Set<string>();
    for (const tileId of targetIntersection.tileIds) {
      const tile = state.map.get(tileId);
      if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') continue;
      score += diceWeight(tile.diceValue);
      for (const r of Object.keys(tile.baseProduction ?? {})) resources.add(r);
    }
    // Prefer pointing toward a future high settlement spot
    const future = scoreClassicSetupIntersection(
      state,
      {
        ...setup,
        // Pretend current anchor is occupied so distance rule still applies to others
        occupiedIntersections: {
          ...setup.occupiedIntersections,
          [setup.anchorIntersectionId!]: '__self__',
        },
      },
      targetIntersectionId,
    );
    if (future !== Number.NEGATIVE_INFINITY) score += future * 0.35;
    score += seasonResourceBonus(state, resources, Math.max(1, score));

    if (score > bestScore) {
      bestScore = score;
      bestId = edgeId;
    }
  }

  return bestId;
}

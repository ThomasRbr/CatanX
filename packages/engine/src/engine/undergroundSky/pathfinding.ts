/**
 * Pathfinding céleste — Dijkstra avec courants, turbulence et balises.
 */

import type { SkyGraph, SkyBeacon } from '../../types/undergroundSky';

export interface SkyPathResult {
  hubPath: string[];
  totalCost: number;
  legCosts: number[];
}

function laneCost(
  graph: SkyGraph,
  from: string,
  to: string,
  beaconsByHub: Record<string, string | undefined>,
  ownerId: string | undefined,
): number | null {
  for (const lane of Object.values(graph.lanes)) {
    const forward = lane.from === from && lane.to === to;
    const reverse = lane.from === to && lane.to === from;
    if (!forward && !reverse) continue;

    let cost =
      lane.currentDirection === 'forward'
        ? forward
          ? 1
          : 2
        : reverse
          ? 1
          : 2;

    const dest = graph.hubs[to];
    if (dest?.site === 'turbulent_zone') {
      cost += 1;
    }

    // Remise balise appliquée après reconstruction du chemin (legs).
    void beaconsByHub;
    void ownerId;
    return cost;
  }
  return null;
}

/**
 * Coût d’une liaison : 1 avec le courant, 2 contre ;
 * +1 si le hub d’arrivée est turbulent.
 */
export function skyLaneTravelCost(
  graph: SkyGraph,
  fromHubId: string,
  toHubId: string,
): number | null {
  return laneCost(graph, fromHubId, toHubId, {}, undefined);
}

/**
 * Dijkstra : trajet le plus rapide.
 * Remise balise propriétaire : −1 par hub balisé traversé (hors départ),
 * appliquée au coût total, minimum 1.
 */
export function findShortestSkyPath(
  graph: SkyGraph,
  fromHubId: string,
  toHubId: string,
  opts?: {
    playerId?: string;
    beacons?: SkyBeacon[];
    /** Joueurs alliés (Accord des Alizés) dont les balises comptent. */
    alliedPlayerIds?: string[];
  },
): SkyPathResult | null {
  if (!graph.hubs[fromHubId] || !graph.hubs[toHubId]) return null;
  if (fromHubId === toHubId) {
    return { hubPath: [fromHubId], totalCost: 1, legCosts: [] };
  }

  const allowedOwners = new Set<string>();
  if (opts?.playerId) allowedOwners.add(opts.playerId);
  for (const id of opts?.alliedPlayerIds ?? []) allowedOwners.add(id);

  const beaconOwner = new Set(
    (opts?.beacons ?? [])
      .filter((b) => allowedOwners.has(b.playerId))
      .map((b) => b.hubId),
  );

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const leg = new Map<string, number>();
  const pending = new Set(Object.keys(graph.hubs));

  for (const id of pending) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }
  dist.set(fromHubId, 0);

  while (pending.size > 0) {
    let u: string | null = null;
    let best = Infinity;
    for (const id of pending) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null || best === Infinity) break;
    pending.delete(u);
    if (u === toHubId) break;

    const neighbors = graph.adjacency[u] ?? [];
    for (const v of neighbors) {
      if (!pending.has(v)) continue;
      const edgeCost = skyLaneTravelCost(graph, u, v);
      if (edgeCost === null) continue;
      const alt = best + edgeCost;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
        leg.set(v, edgeCost);
      }
    }
  }

  if ((dist.get(toHubId) ?? Infinity) === Infinity) return null;

  const hubPath: string[] = [];
  const legCosts: number[] = [];
  let cursor: string | null = toHubId;
  while (cursor) {
    hubPath.unshift(cursor);
    const previous: string | null = prev.get(cursor) ?? null;
    if (previous !== null) {
      legCosts.unshift(leg.get(cursor) ?? 0);
    }
    cursor = previous;
  }

  // Remise balises (−1 / hub intermédiaire ou destination) appliquée aux legs
  // pour que ETA et progression réelle restent alignées.
  for (let i = 1; i < hubPath.length; i += 1) {
    if (!beaconOwner.has(hubPath[i]!)) continue;
    const legIndex = i - 1;
    legCosts[legIndex] = Math.max(0, (legCosts[legIndex] ?? 0) - 1);
  }
  const totalCost = Math.max(
    1,
    legCosts.reduce((sum, cost) => sum + cost, 0),
  );

  return { hubPath, totalCost, legCosts };
}

/** ETA en tours du propriétaire = ceil(totalCost / moveBudget). */
export function estimateAirshipEta(totalCost: number, moveBudget: number): number {
  const budget = Math.max(1, moveBudget);
  return Math.max(1, Math.ceil(totalCost / budget));
}

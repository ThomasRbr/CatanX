/**
 * Génération déterministe des graphes Souterrain et Ciel.
 */

import type { HexTile } from '../../types/hex';
import type { CatanTopology } from '../catan/CatanTopology';
import { isClassicLandTerrain } from '../catan/CatanTopology';
import { hexAllNeighbors, hexToId } from '../hex/HexMath';
import { SeededRandom } from '../../core/rng';
import type {
  SkyGraph,
  SkyHub,
  SkyLane,
  SkySiteKind,
  UndergroundDiscoveryKind,
  UndergroundEdge,
  UndergroundGraph,
  UndergroundNode,
} from '../../types/undergroundSky';
import {
  US_DISCOVERY_GEOLOGY,
  US_DISCOVERY_WEIGHTS,
  US_NUMBER_TOKENS,
  US_PRODUCTION_DISCOVERIES,
  US_SKY_SITE_WEIGHTS,
  pickWeighted,
} from './catalog';

function undergroundNodeId(tileId: string): string {
  return `un_${tileId}`;
}

function undergroundEdgeId(a: string, b: string): string {
  const pair = [a, b].sort();
  return `ue_${pair[0]}|${pair[1]}`;
}

function skyHubId(index: number): string {
  return `sh_${index}`;
}

function skyLaneId(a: string, b: string): string {
  const pair = [a, b].sort();
  return `sl_${pair[0]}|${pair[1]}`;
}

/** Tous les sites employés par les contrats doivent exister sur chaque carte. */
export const REQUIRED_SKY_SITES: readonly SkySiteKind[] = [
  'calm_mooring',
  'aether_source',
  'floating_garden',
  'wind_bazaar',
  'observatory',
  'hanging_ruins',
  'turbulent_zone',
] as const;

function landTiles(map: Map<string, HexTile>): HexTile[] {
  const tiles: HexTile[] = [];
  for (const tile of map.values()) {
    if (isClassicLandTerrain(tile.terrain)) tiles.push(tile);
  }
  tiles.sort((a, b) => a.id.localeCompare(b.id));
  return tiles;
}

function rebuildAdjacency(
  edges: Record<string, { a?: string; b?: string; from?: string; to?: string }>,
): Record<string, string[]> {
  const adjacency: Record<string, string[]> = {};
  for (const edge of Object.values(edges)) {
    const a = edge.a ?? edge.from;
    const b = edge.b ?? edge.to;
    if (!a || !b) continue;
    if (!adjacency[a]) adjacency[a] = [];
    if (!adjacency[b]) adjacency[b] = [];
    if (!adjacency[a]!.includes(b)) adjacency[a]!.push(b);
    if (!adjacency[b]!.includes(a)) adjacency[b]!.push(a);
  }
  for (const id of Object.keys(adjacency)) {
    adjacency[id]!.sort((x, y) => x.localeCompare(y));
  }
  return adjacency;
}

function averageDegree(adjacency: Record<string, string[]>): number {
  const ids = Object.keys(adjacency);
  if (ids.length === 0) return 0;
  const sum = ids.reduce((s, id) => s + (adjacency[id]?.length ?? 0), 0);
  return sum / ids.length;
}

function bfsReachable(
  adjacency: Record<string, string[]>,
  start: string,
  blocked?: Set<string>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  seen.add(start);
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of adjacency[u] ?? []) {
      if (seen.has(v)) continue;
      if (blocked?.has(undergroundEdgeId(u, v))) continue;
      seen.add(v);
      queue.push(v);
    }
  }
  return seen;
}

function countPathsToRegion(
  adjacency: Record<string, string[]>,
  start: string,
  region: Set<string>,
  maxDepth = 24,
): number {
  if (region.has(start)) return 2;
  let paths = 0;
  const stack: Array<{ node: string; visited: Set<string> }> = [
    { node: start, visited: new Set([start]) },
  ];
  while (stack.length > 0 && paths < 2) {
    const { node, visited } = stack.pop()!;
    if (visited.size > maxDepth) continue;
    for (const next of adjacency[node] ?? []) {
      if (visited.has(next)) continue;
      if (region.has(next)) {
        paths += 1;
        if (paths >= 2) return paths;
        continue;
      }
      const nextVisited = new Set(visited);
      nextVisited.add(next);
      stack.push({ node: next, visited: nextVisited });
    }
  }
  return paths;
}

function pickSurfaceEdgeForWell(
  topology: CatanTopology | undefined,
  tileId: string,
  rng: SeededRandom,
): string | null {
  if (!topology) return null;
  const candidates = Object.values(topology.edges)
    .filter((e) => e.tileIds.includes(tileId))
    .map((e) => e.id)
    .sort((a, b) => a.localeCompare(b));
  if (candidates.length === 0) return null;
  return candidates[rng.nextInt(0, candidates.length - 1)]!;
}

function assignDiscoveries(
  nodeIds: string[],
  rng: SeededRandom,
): Record<string, UndergroundDiscoveryKind> {
  const result: Record<string, UndergroundDiscoveryKind> = {};
  for (const id of nodeIds) {
    result[id] = pickWeighted(US_DISCOVERY_WEIGHTS, rng.next());
  }
  return result;
}

function assignNumberTokens(
  nodes: Record<string, UndergroundNode>,
  adjacency: Record<string, string[]>,
  rng: SeededRandom,
): void {
  const producers = Object.values(nodes).filter((n) =>
    (US_PRODUCTION_DISCOVERIES as readonly string[]).includes(n.discovery),
  );
  producers.sort((a, b) => a.id.localeCompare(b.id));

  const tokens = [...US_NUMBER_TOKENS];
  // Répéter le pool pour couvrir de grandes cartes
  while (tokens.length < producers.length) {
    tokens.push(...US_NUMBER_TOKENS);
  }
  const shuffled = rng.shuffle(tokens).slice(0, producers.length);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    let ok = true;
    const assignment = rng.shuffle([...shuffled]);
    for (let i = 0; i < producers.length; i += 1) {
      producers[i]!.numberToken = assignment[i]!;
    }
    for (const node of producers) {
      const token = node.numberToken;
      if (token !== 6 && token !== 8) continue;
      for (const neighborId of adjacency[node.id] ?? []) {
        const neighbor = nodes[neighborId];
        if (!neighbor?.numberToken) continue;
        if (
          (token === 6 && neighbor.numberToken === 8) ||
          (token === 8 && neighbor.numberToken === 6)
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (ok) return;
  }
}

/**
 * Graphe souterrain : 1 nœud / hex terrestre, arêtes d’adjacence filtrées
 * vers un degré moyen ~2,6, noyau à ≥2 chemins vers les régions majeures.
 */
export function generateUndergroundGraph(
  map: Map<string, HexTile>,
  seed: number,
  topology?: CatanTopology,
): UndergroundGraph {
  const rng = new SeededRandom(seed ^ 0x55a1_0c0d);
  const lands = landTiles(map);
  const nodes: Record<string, UndergroundNode> = {};
  const nodeIds: string[] = [];

  for (const tile of lands) {
    const id = undergroundNodeId(tile.id);
    nodeIds.push(id);
    nodes[id] = {
      id,
      surfaceTileId: tile.id,
      discovery: 'fossil_roots',
      numberToken: null,
      geologyCategory: 'production',
      surfaceEdgeId: null,
      thermalChoice: null,
      workshopDiscountClaimed: false,
      sealedChamberClaimed: false,
    };
  }

  // Candidats d’arêtes = adjacences hex terrestres
  type Cand = { id: string; a: string; b: string; key: string };
  const candidates: Cand[] = [];
  const seen = new Set<string>();
  for (const tile of lands) {
    const a = undergroundNodeId(tile.id);
    for (const nCoord of hexAllNeighbors(tile.coord)) {
      const nId = hexToId(nCoord);
      const nTile = map.get(nId);
      if (!nTile || !isClassicLandTerrain(nTile.terrain)) continue;
      const b = undergroundNodeId(nId);
      const key = undergroundEdgeId(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ id: key, a, b, key });
    }
  }
  candidates.sort((x, y) => x.key.localeCompare(y.key));

  // Kruskal MST (ordre déterministe mélangé)
  const shuffledCands = rng.shuffle([...candidates]);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  const union = (a: string, b: string): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent.set(ra, rb);
    return true;
  };
  for (const id of nodeIds) parent.set(id, id);

  const edges: Record<string, UndergroundEdge> = {};
  for (const c of shuffledCands) {
    if (union(c.a, c.b)) {
      edges[c.id] = { id: c.id, a: c.a, b: c.b };
    }
  }

  let adjacency = rebuildAdjacency(edges);

  // Régions majeures : quartiles géographiques (q,r)
  const withCoord = lands.map((t) => ({
    id: undergroundNodeId(t.id),
    q: t.coord.q,
    r: t.coord.r,
  }));
  const qs = withCoord.map((c) => c.q).sort((a, b) => a - b);
  const rs = withCoord.map((c) => c.r).sort((a, b) => a - b);
  const qMid = qs[Math.floor(qs.length / 2)] ?? 0;
  const rMid = rs[Math.floor(rs.length / 2)] ?? 0;
  const regions: Set<string>[] = [
    new Set(),
    new Set(),
    new Set(),
    new Set(),
  ];
  for (const c of withCoord) {
    const qi = c.q >= qMid ? 1 : 0;
    const ri = c.r >= rMid ? 1 : 0;
    regions[qi * 2 + ri]!.add(c.id);
  }

  // Garantir ≥2 chemins depuis le centre vers chaque région non vide
  const center =
    withCoord
      .map((c) => ({
        id: c.id,
        d: Math.abs(c.q) + Math.abs(c.r),
      }))
      .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))[0]?.id ??
    nodeIds[0];

  const remaining = shuffledCands.filter((c) => !edges[c.id]);
  for (const region of regions) {
    if (!center || region.size === 0) continue;
    let paths = countPathsToRegion(adjacency, center, region);
    let guard = 0;
    while (paths < 2 && guard < remaining.length) {
      const next = remaining[guard++];
      if (!next || edges[next.id]) continue;
      // N’ajoute que si ça touche la région ou le composant du centre
      const reach = bfsReachable(adjacency, center);
      if (
        !(reach.has(next.a) || reach.has(next.b)) &&
        !(region.has(next.a) || region.has(next.b))
      ) {
        continue;
      }
      edges[next.id] = { id: next.id, a: next.a, b: next.b };
      adjacency = rebuildAdjacency(edges);
      paths = countPathsToRegion(adjacency, center, region);
    }
  }

  // Arêtes secondaires jusqu’à degré moyen ~2.6
  const targetDegree = 2.6;
  for (const c of remaining) {
    if (edges[c.id]) continue;
    if (averageDegree(adjacency) >= targetDegree) break;
    edges[c.id] = { id: c.id, a: c.a, b: c.b };
    adjacency = rebuildAdjacency(edges);
  }

  // Découvertes + jetons + puits naturels
  const discoveries = assignDiscoveries(nodeIds, rng);
  for (const id of nodeIds) {
    const discovery = discoveries[id]!;
    nodes[id]!.discovery = discovery;
    nodes[id]!.geologyCategory = US_DISCOVERY_GEOLOGY[discovery];
    if (discovery === 'natural_well') {
      nodes[id]!.surfaceEdgeId = pickSurfaceEdgeForWell(
        topology,
        nodes[id]!.surfaceTileId,
        rng,
      );
    }
  }
  assignNumberTokens(nodes, adjacency, rng);

  return { nodes, edges, adjacency };
}

/**
 * Graphe céleste adaptatif : hubs, MST + secondaires (~2.5), courants.
 */
export function generateSkyGraph(
  map: Map<string, HexTile>,
  seed: number,
  playerCount = 4,
): SkyGraph {
  const rng = new SeededRandom(seed ^ 0x5c7_a1e);
  const lands = landTiles(map);
  const hubCount = clampHubCount(lands.length, playerCount);

  // Ancrer les hubs sur un sous-échantillon déterministe des hex terrestres
  const anchors = rng.shuffle([...lands]).slice(0, hubCount);
  // Si pas assez de terres, répéter
  while (anchors.length < hubCount && lands.length > 0) {
    anchors.push(lands[anchors.length % lands.length]!);
  }

  const hubs: Record<string, SkyHub> = {};
  const hubIds: string[] = [];
  for (let i = 0; i < hubCount; i += 1) {
    const id = skyHubId(i);
    hubIds.push(id);
    hubs[id] = {
      id,
      site: 'calm_mooring',
      anchorTileId: anchors[i]?.id ?? null,
      firstVisitorRewards: {},
      hangingRuinsClaimed: false,
    };
  }

  // Distances entre hubs (via coords d’ancre)
  type Cand = { id: string; a: string; b: string; dist: number };
  const candidates: Cand[] = [];
  for (let i = 0; i < hubIds.length; i += 1) {
    for (let j = i + 1; j < hubIds.length; j += 1) {
      const a = hubIds[i]!;
      const b = hubIds[j]!;
      const ta = hubs[a]!.anchorTileId
        ? map.get(hubs[a]!.anchorTileId!)
        : undefined;
      const tb = hubs[b]!.anchorTileId
        ? map.get(hubs[b]!.anchorTileId!)
        : undefined;
      const dist =
        ta && tb
          ? Math.abs(ta.coord.q - tb.coord.q) +
            Math.abs(ta.coord.r - tb.coord.r) +
            Math.abs(ta.coord.s - tb.coord.s)
          : 99;
      candidates.push({ id: skyLaneId(a, b), a, b, dist });
    }
  }
  candidates.sort(
    (x, y) => x.dist - y.dist || x.id.localeCompare(y.id),
  );

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  const union = (a: string, b: string): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent.set(ra, rb);
    return true;
  };
  for (const id of hubIds) parent.set(id, id);

  const lanes: Record<string, SkyLane> = {};
  for (const c of candidates) {
    if (union(c.a, c.b)) {
      lanes[c.id] = {
        id: c.id,
        from: c.a,
        to: c.b,
        currentDirection: rng.next() < 0.5 ? 'forward' : 'reverse',
      };
    }
  }

  let adjacency = rebuildAdjacency(lanes);
  const targetDegree = 2.5;
  for (const c of candidates) {
    if (lanes[c.id]) continue;
    if (averageDegree(adjacency) >= targetDegree) break;
    lanes[c.id] = {
      id: c.id,
      from: c.a,
      to: c.b,
      currentDirection: rng.next() < 0.5 ? 'forward' : 'reverse',
    };
    adjacency = rebuildAdjacency(lanes);
  }

  // Sites par poids, puis réparation déterministe pour garantir que chaque
  // destination utilisée par les contrats existe sur la carte.
  for (const id of hubIds) {
    hubs[id]!.site = pickWeighted(US_SKY_SITE_WEIGHTS, rng.next());
  }
  const siteCounts = new Map<SkySiteKind, number>();
  for (const hub of Object.values(hubs)) {
    siteCounts.set(hub.site, (siteCounts.get(hub.site) ?? 0) + 1);
  }
  const repairPool = rng.shuffle([...hubIds]);
  for (const requiredSite of REQUIRED_SKY_SITES) {
    if ((siteCounts.get(requiredSite) ?? 0) > 0) continue;
    const targetId = repairPool.find((id) => (siteCounts.get(hubs[id]!.site) ?? 0) > 1);
    if (!targetId) break;
    const replacedSite = hubs[targetId]!.site;
    hubs[targetId]!.site = requiredSite;
    siteCounts.set(replacedSite, (siteCounts.get(replacedSite) ?? 1) - 1);
    siteCounts.set(requiredSite, 1);
  }

  return { hubs, lanes, adjacency };
}

export function clampHubCount(landHexCount: number, playerCount = 4): number {
  return Math.min(
    30,
    Math.max(8, Math.max(2, playerCount) * 2, Math.round(landHexCount / 5)),
  );
}

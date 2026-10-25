import { HexLayout, hexCorners, hexToPixel } from '../hex/HexMath';
import { HexTile, PixelCoord, TerrainType } from '../../types/hex';

export interface CatanIntersection {
  id: string;
  tileIds: string[];
  neighborIds: string[];
  x: number;
  y: number;
}

export interface CatanEdge {
  id: string;
  a: string;
  b: string;
  tileIds: string[];
}

export interface CatanTopology {
  intersections: Record<string, CatanIntersection>;
  edges: Record<string, CatanEdge>;
}

const CANONICAL_LAYOUT: HexLayout = {
  size: 100,
  origin: { x: 0, y: 0 },
  flat: false,
};

function vertexKey(point: PixelCoord): string {
  return `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
}

function edgeKey(a: string, b: string): string {
  const pair = [a, b].sort();
  return `${pair[0]}|${pair[1]}`;
}

function toIntersectionId(key: string): string {
  return `v_${key}`;
}

function toEdgeId(key: string): string {
  return `e_${key}`;
}

function distanceSquared(a: PixelCoord, b: PixelCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function distancePointToSegment(point: PixelCoord, a: PixelCoord, b: PixelCoord): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 0.00001) {
    return Math.sqrt(distanceSquared(point, a));
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSq));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(point.x - cx, point.y - cy);
}

export function buildCatanTopology(map: Map<string, HexTile>, layout?: HexLayout): CatanTopology {
  const intersections = new Map<string, CatanIntersection>();
  const edges = new Map<string, CatanEdge>();
  const tileCorners = new Map<string, string[]>();

  for (const [tileId, tile] of map) {
    const canonicalCenter = hexToPixel(tile.coord, CANONICAL_LAYOUT);
    const canonicalCorners = hexCorners(
      canonicalCenter,
      CANONICAL_LAYOUT.size,
      CANONICAL_LAYOUT.flat,
    );

    const renderCenter = hexToPixel(tile.coord, layout ?? CANONICAL_LAYOUT);
    const renderCorners = hexCorners(
      renderCenter,
      (layout ?? CANONICAL_LAYOUT).size,
      (layout ?? CANONICAL_LAYOUT).flat,
    );

    const cornerIds: string[] = [];

    for (let i = 0; i < 6; i += 1) {
      const key = vertexKey(canonicalCorners[i]);
      const intersectionId = toIntersectionId(key);
      cornerIds.push(intersectionId);

      const current = intersections.get(intersectionId);
      if (!current) {
        intersections.set(intersectionId, {
          id: intersectionId,
          tileIds: [tileId],
          neighborIds: [],
          x: renderCorners[i].x,
          y: renderCorners[i].y,
        });
      } else {
        if (!current.tileIds.includes(tileId)) current.tileIds.push(tileId);
        current.x = renderCorners[i].x;
        current.y = renderCorners[i].y;
      }
    }

    tileCorners.set(tileId, cornerIds);
  }

  for (const [tileId, corners] of tileCorners) {
    for (let i = 0; i < 6; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      const key = edgeKey(a, b);
      const id = toEdgeId(key);
      const current = edges.get(id);
      if (!current) {
        edges.set(id, { id, a, b, tileIds: [tileId] });
      } else if (!current.tileIds.includes(tileId)) {
        current.tileIds.push(tileId);
      }

      const ia = intersections.get(a);
      const ib = intersections.get(b);
      if (ia && !ia.neighborIds.includes(b)) ia.neighborIds.push(b);
      if (ib && !ib.neighborIds.includes(a)) ib.neighborIds.push(a);
    }
  }

  return {
    intersections: Object.fromEntries(intersections.entries()),
    edges: Object.fromEntries(edges.entries()),
  };
}

export function intersectionTouchesLand(
  topology: CatanTopology,
  map: Map<string, HexTile>,
  intersectionId: string,
): boolean {
  const intersection = topology.intersections[intersectionId];
  if (!intersection) return false;
  return intersection.tileIds.some((tileId) => {
    const tile = map.get(tileId);
    if (!tile) return false;
    return !['ocean', 'coast', 'glacier'].includes(tile.terrain);
  });
}

export function chooseSettlementAnchorTile(
  topology: CatanTopology,
  map: Map<string, HexTile>,
  intersectionId: string,
  usageByTile: Record<string, number> = {},
): string | null {
  const intersection = topology.intersections[intersectionId];
  if (!intersection) return null;

  const candidates = intersection.tileIds
    .map((tileId) => map.get(tileId))
    .filter((tile): tile is HexTile => Boolean(tile))
    .filter((tile) => !['ocean', 'coast', 'glacier'].includes(tile.terrain));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aWeight = a.diceValue ? 7 - Math.abs(7 - a.diceValue) : 0;
    const bWeight = b.diceValue ? 7 - Math.abs(7 - b.diceValue) : 0;
    const usageDelta = (usageByTile[a.id] ?? 0) - (usageByTile[b.id] ?? 0);
    if (usageDelta !== 0) return usageDelta;
    return bWeight - aWeight;
  });

  return candidates[0].id;
}

export function findNearestIntersection(
  topology: CatanTopology,
  point: PixelCoord,
  maxDistance: number,
): string | null {
  let bestId: string | null = null;
  let best = maxDistance * maxDistance;

  for (const intersection of Object.values(topology.intersections)) {
    const d = distanceSquared(point, { x: intersection.x, y: intersection.y });
    if (d > best) continue;
    best = d;
    bestId = intersection.id;
  }

  return bestId;
}

export function findNearestEdge(
  topology: CatanTopology,
  point: PixelCoord,
  maxDistance: number,
): string | null {
  let bestId: string | null = null;
  let best = maxDistance;

  for (const edge of Object.values(topology.edges)) {
    const a = topology.intersections[edge.a];
    const b = topology.intersections[edge.b];
    if (!a || !b) continue;
    const d = distancePointToSegment(point, { x: a.x, y: a.y }, { x: b.x, y: b.y });
    if (d > best) continue;
    best = d;
    bestId = edge.id;
  }

  return bestId;
}

export function isClassicLandTerrain(terrain: TerrainType): boolean {
  return terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'glacier';
}

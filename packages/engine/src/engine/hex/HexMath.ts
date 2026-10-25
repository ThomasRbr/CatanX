// ============================================================
// HexMath — Moteur hexagonal complet
// Système de coordonnées cube (q, r, s)
// Référence : https://www.redblobgames.com/grids/hexagons/
// ============================================================

import {
  CubeCoord,
  OffsetCoord,
  PixelCoord,
  HexDirection,
  HEX_DIRECTIONS,
  HEX_DIAGONALS,
} from '../../types/hex';

// ============================================================
// OPÉRATIONS DE BASE
// ============================================================

export function hexAdd(a: CubeCoord, b: CubeCoord): CubeCoord {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s };
}

export function hexSubtract(a: CubeCoord, b: CubeCoord): CubeCoord {
  return { q: a.q - b.q, r: a.r - b.r, s: a.s - b.s };
}

export function hexScale(hex: CubeCoord, factor: number): CubeCoord {
  return { q: hex.q * factor, r: hex.r * factor, s: hex.s * factor };
}

export function hexRotateLeft(hex: CubeCoord): CubeCoord {
  return { q: -hex.s, r: -hex.q, s: -hex.r };
}

export function hexRotateRight(hex: CubeCoord): CubeCoord {
  return { q: -hex.r, r: -hex.s, s: -hex.q };
}

export function hexReflectQ(hex: CubeCoord): CubeCoord {
  return { q: hex.q, r: hex.s, s: hex.r };
}

export function hexReflectR(hex: CubeCoord): CubeCoord {
  return { q: hex.s, r: hex.r, s: hex.q };
}

export function hexReflectS(hex: CubeCoord): CubeCoord {
  return { q: hex.r, r: hex.q, s: hex.s };
}

// ============================================================
// DISTANCE & LONGUEUR
// ============================================================

export function hexLength(hex: CubeCoord): number {
  return Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(hex.s));
}

export function hexDistance(a: CubeCoord, b: CubeCoord): number {
  return hexLength(hexSubtract(a, b));
}

export function hexManhattenLength(hex: CubeCoord): number {
  return (Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(hex.s)) / 2;
}

// ============================================================
// VOISINS & DIRECTIONS
// ============================================================

export function hexDirection(direction: HexDirection): CubeCoord {
  return HEX_DIRECTIONS[direction];
}

export function hexNeighbor(hex: CubeCoord, direction: HexDirection): CubeCoord {
  return hexAdd(hex, hexDirection(direction));
}

export function hexAllNeighbors(hex: CubeCoord): CubeCoord[] {
  return HEX_DIRECTIONS.map((dir) => hexAdd(hex, dir));
}

export function hexDiagonal(hex: CubeCoord, direction: HexDirection): CubeCoord {
  return hexAdd(hex, HEX_DIAGONALS[direction]);
}

export function hexAllDiagonals(hex: CubeCoord): CubeCoord[] {
  return HEX_DIAGONALS.map((diag) => hexAdd(hex, diag));
}

// ============================================================
// LIGNES & RINGS
// ============================================================

/**
 * Lerp flottant pour interpolation hexagonale
 */
function hexLerp(a: CubeCoord, b: CubeCoord, t: number): { q: number; r: number; s: number } {
  return {
    q: a.q + (b.q - a.q) * t,
    r: a.r + (b.r - a.r) * t,
    s: a.s + (b.s - a.s) * t,
  };
}

/**
 * Arrondi d'une coordonnée flottante vers la tuile la plus proche
 */
export function hexRound(frac: { q: number; r: number; s: number }): CubeCoord {
  let q = Math.round(frac.q);
  let r = Math.round(frac.r);
  let s = Math.round(frac.s);

  const dq = Math.abs(q - frac.q);
  const dr = Math.abs(r - frac.r);
  const ds = Math.abs(s - frac.s);

  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  } else {
    s = -q - r;
  }

  return { q, r, s };
}

/**
 * Ligne droite entre deux hexagones
 */
export function hexLine(a: CubeCoord, b: CubeCoord): CubeCoord[] {
  const n = hexDistance(a, b);
  const results: CubeCoord[] = [];
  for (let i = 0; i <= n; i++) {
    results.push(hexRound(hexLerp(a, b, (1.0 / n) * i)));
  }
  return results;
}

/**
 * Ring (anneau) à distance N d'un hexagone central
 */
export function hexRing(center: CubeCoord, radius: number): CubeCoord[] {
  if (radius === 0) return [center];
  const results: CubeCoord[] = [];
  let hex = hexAdd(center, hexScale(hexDirection(4), radius));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push({ ...hex });
      hex = hexNeighbor(hex, i as HexDirection);
    }
  }
  return results;
}

/**
 * Spiral — tous les hexagones dans un rayon N (du centre vers l'extérieur)
 */
export function hexSpiral(center: CubeCoord, radius: number): CubeCoord[] {
  const results: CubeCoord[] = [center];
  for (let r = 1; r <= radius; r++) {
    results.push(...hexRing(center, r));
  }
  return results;
}

/**
 * Disque — tous les hexagones dans un rayon exact
 */
export function hexDisk(center: CubeCoord, radius: number): CubeCoord[] {
  const results: CubeCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const s = -q - r;
      results.push(hexAdd(center, { q, r, s }));
    }
  }
  return results;
}

// ============================================================
// CONVERSIONS PIXEL ↔ HEX (Layout Pointy-Top)
// ============================================================

export interface HexLayout {
  size: number; // rayon d'un hexagone en pixels
  origin: PixelCoord; // centre de la carte en pixels
  flat: boolean; // true = flat-top, false = pointy-top
}

// Matrices de transformation Pointy-Top
const POINTY_F0 = Math.sqrt(3);
const POINTY_F1 = Math.sqrt(3) / 2;
const POINTY_F2 = 0;
const POINTY_F3 = 3 / 2;

// Matrices de transformation Flat-Top
const FLAT_F0 = 3 / 2;
const FLAT_F1 = 0;
const FLAT_F2 = Math.sqrt(3) / 2;
const FLAT_F3 = Math.sqrt(3);

/**
 * Convertit coordonnées cube → pixel
 */
export function hexToPixel(hex: CubeCoord, layout: HexLayout): PixelCoord {
  const { size, origin, flat } = layout;
  let x: number, y: number;
  if (flat) {
    x = (FLAT_F0 * hex.q + FLAT_F1 * hex.r) * size;
    y = (FLAT_F2 * hex.q + FLAT_F3 * hex.r) * size;
  } else {
    x = (POINTY_F0 * hex.q + POINTY_F1 * hex.r) * size;
    y = (POINTY_F2 * hex.q + POINTY_F3 * hex.r) * size;
  }
  return { x: x + origin.x, y: y + origin.y };
}

/**
 * Convertit pixel → coordonnées cube (puis arrondi)
 */
export function pixelToHex(point: PixelCoord, layout: HexLayout): CubeCoord {
  const { size, origin, flat } = layout;
  const pt = {
    x: (point.x - origin.x) / size,
    y: (point.y - origin.y) / size,
  };
  let q: number, r: number;
  if (flat) {
    q = (2 / 3) * pt.x;
    r = (-1 / 3) * pt.x + (Math.sqrt(3) / 3) * pt.y;
  } else {
    q = (Math.sqrt(3) / 3) * pt.x + (-1 / 3) * pt.y;
    r = (2 / 3) * pt.y;
  }
  return hexRound({ q, r, s: -q - r });
}

/**
 * Coins d'un hexagone (pour le rendu)
 */
export function hexCorners(center: PixelCoord, size: number, flat: boolean): PixelCoord[] {
  const corners: PixelCoord[] = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = flat ? 60 * i : 60 * i - 30;
    const angle_rad = (Math.PI / 180) * angle_deg;
    corners.push({
      x: center.x + size * Math.cos(angle_rad),
      y: center.y + size * Math.sin(angle_rad),
    });
  }
  return corners;
}

// ============================================================
// CONVERSION OFFSET ↔ CUBE
// ============================================================

export function cubeToOddR(cube: CubeCoord): OffsetCoord {
  const col = cube.q + (cube.r - (cube.r & 1)) / 2;
  const row = cube.r;
  return { col, row };
}

export function oddRToCube(offset: OffsetCoord): CubeCoord {
  const q = offset.col - (offset.row - (offset.row & 1)) / 2;
  const r = offset.row;
  const s = -q - r;
  return { q, r, s };
}

export function cubeToEvenR(cube: CubeCoord): OffsetCoord {
  const col = cube.q + (cube.r + (cube.r & 1)) / 2;
  const row = cube.r;
  return { col, row };
}

export function evenRToCube(offset: OffsetCoord): CubeCoord {
  const q = offset.col - (offset.row + (offset.row & 1)) / 2;
  const r = offset.row;
  const s = -q - r;
  return { q, r, s };
}

// ============================================================
// ID HELPERS
// ============================================================

export function hexToId(hex: CubeCoord): string {
  return `${hex.q},${hex.r},${hex.s}`;
}

// Cache LRU simple pour éviter split/map(Number) répétés
const idToHexCache = new Map<string, CubeCoord>();

export function idToHex(id: string): CubeCoord {
  const cached = idToHexCache.get(id);
  if (cached) return cached;
  const parts = id.split(',');
  const result: CubeCoord = { q: +parts[0], r: +parts[1], s: +parts[2] };
  // Taille limitée pour éviter une fuite mémoire
  if (idToHexCache.size < 4096) idToHexCache.set(id, result);
  return result;
}

export function hexEquals(a: CubeCoord, b: CubeCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

// ============================================================
// PRIORITY QUEUE (min-heap binaire) — pour A* et BFS
// ============================================================

class MinHeap<T> {
  private data: Array<{ priority: number; item: T }> = [];

  push(item: T, priority: number): void {
    this.data.push({ priority, item });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0].item;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): number {
    return this.data[0]?.priority ?? Infinity;
  }

  get size(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].priority <= this.data[i].priority) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = (i << 1) + 1;
      const right = left + 1;
      if (left < n && this.data[left].priority < this.data[smallest].priority) smallest = left;
      if (right < n && this.data[right].priority < this.data[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ============================================================
// PATHFINDING — A* sur grille hexagonale
// ============================================================

export interface PathfindingOptions {
  passable: (tileId: string) => boolean;
  movementCost: (fromId: string, toId: string) => number;
  maxDistance?: number;
}

export interface PathResult {
  path: CubeCoord[];
  cost: number;
  reachable: boolean;
}

function heuristic(a: CubeCoord, b: CubeCoord): number {
  return hexDistance(a, b);
}

/**
 * A* — Chemin optimal entre deux hexagones
 */
export function findPath(
  start: CubeCoord,
  goal: CubeCoord,
  options: PathfindingOptions,
): PathResult {
  const startId = hexToId(start);
  const goalId = hexToId(goal);

  if (startId === goalId) return { path: [start], cost: 0, reachable: true };

  // Min-heap : remplace le Set + scan O(n) par O(log n)
  const openHeap = new MinHeap<string>();
  const inOpen = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();

  gScore.set(startId, 0);
  openHeap.push(startId, heuristic(start, goal));
  inOpen.add(startId);

  while (openHeap.size > 0) {
    const current = openHeap.pop()!;
    inOpen.delete(current);

    if (current === goalId) {
      const path: CubeCoord[] = [];
      let c = current;
      while (c !== startId) {
        path.unshift(idToHex(c));
        c = cameFrom.get(c)!;
      }
      path.unshift(start);
      return { path, cost: gScore.get(goalId) ?? 0, reachable: true };
    }

    const currentHex = idToHex(current);
    const currentG = gScore.get(current) ?? Infinity;

    for (const neighbor of hexAllNeighbors(currentHex)) {
      const neighborId = hexToId(neighbor);
      if (!options.passable(neighborId)) continue;

      const moveCost = options.movementCost(current, neighborId);
      const tentativeG = currentG + moveCost;

      if (options.maxDistance !== undefined && tentativeG > options.maxDistance) continue;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        const f = tentativeG + heuristic(neighbor, goal);
        openHeap.push(neighborId, f);
        inOpen.add(neighborId);
      }
    }
  }

  return { path: [], cost: Infinity, reachable: false };
}

/**
 * BFS — Toutes les tuiles atteignables depuis un point avec un budget de mouvement
 */
export function reachableTiles(
  start: CubeCoord,
  movementPoints: number,
  options: Omit<PathfindingOptions, 'maxDistance'>,
): Map<string, number> {
  const visited = new Map<string, number>();
  // Min-heap : remplace frontier.sort() O(n log n) à chaque itération
  const heap = new MinHeap<CubeCoord>();
  const startId = hexToId(start);

  visited.set(startId, 0);
  heap.push(start, 0);

  while (heap.size > 0) {
    const hex = heap.pop()!;
    const hexId = hexToId(hex);
    const cost = visited.get(hexId) ?? 0;

    for (const neighbor of hexAllNeighbors(hex)) {
      const neighborId = hexToId(neighbor);
      if (!options.passable(neighborId)) continue;

      const moveCost = options.movementCost(hexId, neighborId);
      const newCost = cost + moveCost;

      if (newCost <= movementPoints && newCost < (visited.get(neighborId) ?? Infinity)) {
        visited.set(neighborId, newCost);
        heap.push(neighbor, newCost);
      }
    }
  }

  return visited;
}

/**
 * Visibilité — Field of View depuis un point (ray casting)
 */
export function fieldOfView(
  origin: CubeCoord,
  radius: number,
  isBlocking: (tileId: string) => boolean,
): Set<string> {
  const visible = new Set<string>();
  visible.add(hexToId(origin));

  // BUG FIX: lancer des rayons vers chaque ring (pas seulement le ring extérieur)
  // pour garantir une couverture complète sans tuiles manquées entre anneaux
  for (let r = 1; r <= radius; r++) {
    for (const target of hexRing(origin, r)) {
      const line = hexLine(origin, target);
      for (const hex of line) {
        const id = hexToId(hex);
        visible.add(id);
        if (isBlocking(id) && !hexEquals(hex, origin)) {
          break; // bloqué par un obstacle
        }
      }
    }
  }

  return visible;
}

/**
 * Calcule tous les hexagones dans une zone de tir (arc)
 */
export function rangeAttackZone(
  origin: CubeCoord,
  minRange: number,
  maxRange: number,
): Set<string> {
  const zone = new Set<string>();
  for (let r = minRange; r <= maxRange; r++) {
    hexRing(origin, r).forEach((h) => zone.add(hexToId(h)));
  }
  return zone;
}

/**
 * Plus courte connexion entre deux ensembles de tuiles (pour routes)
 */
export function shortestConnection(
  setA: CubeCoord[],
  setB: CubeCoord[],
): { from: CubeCoord; to: CubeCoord; distance: number } | null {
  let best: { from: CubeCoord; to: CubeCoord; distance: number } | null = null;
  for (const a of setA) {
    for (const b of setB) {
      const d = hexDistance(a, b);
      if (!best || d < best.distance) {
        best = { from: a, to: b, distance: d };
      }
    }
  }
  return best;
}

/**
 * Flood fill — retourne toutes les tuiles connexes depuis un point (BFS simple)
 * Usage : détecter les continents, territoires d'un joueur, zones fermées
 */
export function hexFloodFill(start: CubeCoord, passable: (tileId: string) => boolean): Set<string> {
  const result = new Set<string>();
  const startId = hexToId(start);
  if (!passable(startId)) return result;

  const queue = [start];
  result.add(startId);

  while (queue.length > 0) {
    const hex = queue.shift()!;
    for (const neighbor of hexAllNeighbors(hex)) {
      const nId = hexToId(neighbor);
      if (!result.has(nId) && passable(nId)) {
        result.add(nId);
        queue.push(neighbor);
      }
    }
  }
  return result;
}

/**
 * BFS multi-sources — retourne la distance minimale de chaque tuile aux sources les plus proches
 * Usage : IA (distance à la ville la plus proche), détection d'isolement
 */
export function multiSourceBFS(
  sources: CubeCoord[],
  passable: (tileId: string) => boolean,
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: Array<{ hex: CubeCoord; d: number }> = [];

  for (const src of sources) {
    const id = hexToId(src);
    if (!dist.has(id)) {
      dist.set(id, 0);
      queue.push({ hex: src, d: 0 });
    }
  }

  let head = 0;
  while (head < queue.length) {
    const { hex, d } = queue[head++];
    for (const neighbor of hexAllNeighbors(hex)) {
      const nId = hexToId(neighbor);
      if (!dist.has(nId) && passable(nId)) {
        dist.set(nId, d + 1);
        queue.push({ hex: neighbor, d: d + 1 });
      }
    }
  }
  return dist;
}

/**
 * Ligne de mire — vérifie que le tir n'est pas bloqué entre deux hexagones
 * Usage : tir à distance, espionnage, FOW avancé
 */
export function hasLineOfSight(
  from: CubeCoord,
  to: CubeCoord,
  isOpaque: (tileId: string) => boolean,
): boolean {
  const line = hexLine(from, to);
  for (let i = 1; i < line.length - 1; i++) {
    if (isOpaque(hexToId(line[i]))) return false;
  }
  return true;
}

/**
 * Vérifie si deux ensembles de tuiles sont connectés (pour la route la plus longue)
 */
export function areConnected(tiles: Set<string>, start: string, end: string): boolean {
  if (!tiles.has(start) || !tiles.has(end)) return false;
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === end) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const hex = idToHex(current);
    for (const neighbor of hexAllNeighbors(hex)) {
      const nId = hexToId(neighbor);
      if (tiles.has(nId) && !visited.has(nId)) {
        queue.push(nId);
      }
    }
  }
  return false;
}

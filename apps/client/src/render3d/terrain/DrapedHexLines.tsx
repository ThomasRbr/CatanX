import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hexNeighbor, hexToId, type HexTile } from '@catanx/engine';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import type { SurfaceHeightSampler } from './BoardHeightfield';
import { useSurfaceHeight } from './SurfaceHeightContext';

/**
 * Hex lines that lie *on* the relief board.
 *
 * The legacy grid and seam paths sit at the flat slab height, which the
 * perspective heightfield now buries under every hill and floats above every
 * valley. These ribbons are sampled from the same heightfield as the terrain,
 * so tile borders stay readable on slopes, in fields and across summits.
 */

type Point = { x: number; z: number };
type Segment = readonly [Point, Point];

/** Corners of a pointy-top hex, matching `cubeToWorld`. */
function hexCorners(center: Point, radius = HEX_WORLD_RADIUS): Point[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return { x: center.x + radius * Math.cos(angle), z: center.z + radius * Math.sin(angle) };
  });
}

/** Edges shared by two land tiles, each listed once. */
export function sharedLandEdges(tiles: readonly HexTile[]): Segment[] {
  const land = tiles.filter((tile) => !isWaterTerrain(tile.terrain));
  const centers = land.map((tile) => {
    const world = cubeToWorld(tile.coord);
    return { x: world.x, z: world.z };
  });
  const out: Segment[] = [];
  const neighbourDistSq = 3 * HEX_WORLD_RADIUS * HEX_WORLD_RADIUS;
  for (let i = 0; i < land.length; i++) {
    for (let j = i + 1; j < land.length; j++) {
      const a = centers[i]!;
      const b = centers[j]!;
      const d2 = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
      if (Math.abs(d2 - neighbourDistSq) > 0.05) continue;
      // The shared edge is made of the two corners of A that also lie one
      // radius from B — independent of the engine's direction ordering.
      const shared = hexCorners(a).filter(
        (corner) => Math.abs(Math.hypot(corner.x - b.x, corner.z - b.z) - HEX_WORLD_RADIUS) < 0.02,
      );
      if (shared.length === 2) out.push([shared[0]!, shared[1]!]);
    }
  }
  return out;
}

/** Closed outline of one tile, inset so neighbouring rings never overlap. */
export function tileOutline(tile: HexTile, inset = 0.93): Segment[] {
  const world = cubeToWorld(tile.coord);
  const corners = hexCorners({ x: world.x, z: world.z }, HEX_WORLD_RADIUS * inset);
  return corners.map((corner, i) => [corner, corners[(i + 1) % 6]!] as const);
}

/**
 * One indexed ribbon for many segments. `uv.x` runs across the ribbon (0→1)
 * so an alpha profile softens both edges; each cross-section is sampled from
 * the heightfield on both sides so the strip hugs slopes instead of slicing
 * through them.
 */
export function buildDrapedRibbon(
  segments: readonly Segment[],
  sampler: SurfaceHeightSampler,
  halfWidth: number,
  lift: number,
  step = 0.05,
  /** Lowest surface height — keeps strips over open water above the swell. */
  floor = -Infinity,
): THREE.BufferGeometry {
  const height = (x: number, z: number) => Math.max(floor, sampler.sampleHeight(x, z)) + lift;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const [a, b] of segments) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.max(1e-4, Math.hypot(dx, dz));
    const nx = (-dz / length) * halfWidth;
    const nz = (dx / length) * halfWidth;
    // Run a hair past both ends so ribbons meet cleanly at hex corners.
    const ext = halfWidth / length;
    const steps = Math.max(2, Math.ceil(length / step));
    const base = positions.length / 3;
    for (let s = 0; s <= steps; s++) {
      const t = -ext + (s / steps) * (1 + 2 * ext);
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      const lx = cx + nx;
      const lz = cz + nz;
      const rx = cx - nx;
      const rz = cz - nz;
      positions.push(lx, height(lx, lz), lz);
      positions.push(rx, height(rx, rz), rz);
      uvs.push(0, t, 1, t);
      if (s > 0) {
        const i0 = base + (s - 1) * 2;
        indices.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

let profileTexture: THREE.DataTexture | null = null;

/** Soft-edged cross profile shared by every ribbon (alphaMap reads green). */
function ribbonProfile(): THREE.DataTexture {
  if (profileTexture) return profileTexture;
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const u = i / (width - 1);
    const edge = Math.min(u, 1 - u) * 2;
    const v = Math.round(255 * THREE.MathUtils.smoothstep(edge, 0, 0.7));
    data.set([v, v, v, 255], i * 4);
  }
  profileTexture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  profileTexture.magFilter = THREE.LinearFilter;
  profileTexture.minFilter = THREE.LinearFilter;
  profileTexture.wrapS = THREE.ClampToEdgeWrapping;
  profileTexture.needsUpdate = true;
  return profileTexture;
}

function ribbonMaterial(color: string, opacity: number, glow: boolean): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    alphaMap: ribbonProfile(),
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    toneMapped: !glow,
    fog: true,
  });
}

function noopRaycast() {
  /* purely visual */
}

/** Permanent, quiet tile borders: pale trodden paths like the art reference. */
export function HexBorderNetwork({ tiles }: { tiles: readonly HexTile[] }) {
  const sampler = useSurfaceHeight();
  const geometry = useMemo(
    () => buildDrapedRibbon(sharedLandEdges(tiles), sampler, 0.024, 0.016),
    [sampler, tiles],
  );
  const material = useMemo(() => ribbonMaterial('#f1e6c8', 0.62, false), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry.getIndex()?.count) return null;
  return <mesh geometry={geometry} material={material} renderOrder={3} raycast={noopRaycast} />;
}

interface TileEmphasisProps {
  tiles: readonly HexTile[];
  /** Tiles the player can act on right now (robber targets…): pulsing. */
  targetTileIds: ReadonlySet<string>;
  hoveredTileId: string | null;
  selectedTileId: string | null;
  animate?: boolean;
}

/**
 * Draped outlines for interactive tiles. Targets pulse in gold so the legal
 * choices stand out at a glance; hover and selection get a crisp bright ring.
 */
export function TileEmphasis3D({
  tiles,
  targetTileIds,
  hoveredTileId,
  selectedTileId,
  animate = true,
}: TileEmphasisProps) {
  const sampler = useSurfaceHeight();
  const byId = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);

  const targetGeometry = useMemo(() => {
    const segments = [...targetTileIds]
      .map((id) => byId.get(id))
      .filter((tile): tile is HexTile => Boolean(tile))
      .flatMap((tile) => tileOutline(tile, 0.9));
    return segments.length ? buildDrapedRibbon(segments, sampler, 0.05, 0.03) : null;
  }, [byId, sampler, targetTileIds]);

  const focusGeometry = useMemo(() => {
    const segments: Segment[] = [];
    for (const id of new Set([hoveredTileId, selectedTileId])) {
      const tile = id ? byId.get(id) : undefined;
      if (tile) segments.push(...tileOutline(tile, 0.94));
    }
    return segments.length ? buildDrapedRibbon(segments, sampler, 0.034, 0.034) : null;
  }, [byId, hoveredTileId, sampler, selectedTileId]);

  const targetMaterial = useMemo(() => ribbonMaterial('#ffcd4a', 0.9, true), []);
  const focusMaterial = useMemo(() => ribbonMaterial('#ffffff', 0.95, true), []);
  useEffect(() => () => targetGeometry?.dispose(), [targetGeometry]);
  useEffect(() => () => focusGeometry?.dispose(), [focusGeometry]);
  useEffect(
    () => () => {
      targetMaterial.dispose();
      focusMaterial.dispose();
    },
    [focusMaterial, targetMaterial],
  );

  const clock = useRef(0);
  const targetMesh = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    const material = targetMesh.current?.material;
    if (!(material instanceof THREE.MeshBasicMaterial)) return;
    clock.current += animate ? Math.min(delta, 0.1) : 0;
    material.opacity = animate ? 0.6 + 0.35 * (0.5 + 0.5 * Math.sin(clock.current * 3.2)) : 0.9;
  });

  return (
    <group>
      {targetGeometry && (
        <mesh
          ref={targetMesh}
          geometry={targetGeometry}
          material={targetMaterial}
          renderOrder={4}
          raycast={noopRaycast}
        />
      )}
      {focusGeometry && (
        <mesh geometry={focusGeometry} material={focusMaterial} renderOrder={5} raycast={noopRaycast} />
      )}
    </group>
  );
}

/** Above the ocean plane (-0.065) and its climate swing. */
const LAGOON_FLOOR = -0.02;

/**
 * Productive water on the shoreline (a lake or river tile that touches the
 * sea) has no bank of its own: the ocean covers it and its chit seemed to float
 * at sea. A sand-bar rim and lighter shallows make it read as a lagoon — a
 * real game space — without reintroducing a floating slab.
 */
export function LagoonMarkers({ tiles }: { tiles: readonly HexTile[] }) {
  const sampler = useSurfaceHeight();
  const lagoons = useMemo(() => {
    const byId = new Map(tiles.map((tile) => [tile.id, tile]));
    return tiles.filter((tile) => {
      if (tile.terrain !== 'lake' && tile.terrain !== 'river') return false;
      if (typeof tile.diceValue !== 'number' || tile.diceValue <= 0) return false;
      // Enclosed lakes already have banks (InlandWater); only the shoreline ones vanish.
      return ([0, 1, 2, 3, 4, 5] as const).some((direction) => {
        const neighbour = byId.get(hexToId(hexNeighbor(tile.coord, direction)));
        return !neighbour || neighbour.terrain === 'ocean' || neighbour.terrain === 'coast';
      });
    });
  }, [tiles]);
  const rim = useMemo(
    () =>
      lagoons.length
        ? buildDrapedRibbon(lagoons.flatMap((tile) => tileOutline(tile, 0.96)), sampler, 0.04, 0.012, 0.05, LAGOON_FLOOR)
        : null,
    [lagoons, sampler],
  );
  const shallows = useMemo(
    () =>
      lagoons.length
        ? buildDrapedRibbon(lagoons.flatMap((tile) => tileOutline(tile, 0.82)), sampler, 0.14, 0.004, 0.05, LAGOON_FLOOR)
        : null,
    [lagoons, sampler],
  );
  const rimMaterial = useMemo(() => {
    // A reef, not a frame: soft-edged, sandy and slightly translucent.
    return ribbonMaterial('#d8c290', 0.78, false);
  }, []);
  const shallowMaterial = useMemo(() => ribbonMaterial('#8fe3d4', 0.3, false), []);
  useEffect(() => () => rim?.dispose(), [rim]);
  useEffect(() => () => shallows?.dispose(), [shallows]);
  useEffect(
    () => () => {
      rimMaterial.dispose();
      shallowMaterial.dispose();
    },
    [rimMaterial, shallowMaterial],
  );
  if (!rim || !shallows) return null;
  return (
    <group>
      <mesh geometry={shallows} material={shallowMaterial} renderOrder={2} raycast={noopRaycast} />
      <mesh geometry={rim} material={rimMaterial} renderOrder={3} raycast={noopRaycast} receiveShadow />
    </group>
  );
}

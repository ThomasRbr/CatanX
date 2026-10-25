import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { HexTile, TerrainType } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useMapLod } from '../camera/MapLodContext';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { visualRngFor } from '../utils/seededVisualRandom';

interface TerrainMicroScatterProps {
  tiles: readonly HexTile[];
  mapSeed: number;
  season: string;
  /**
   * BladeField draws the grass: skip the photographed lawn and tuft cards,
   * keep only ferns, leaf litter and flowers.
   */
  bladeGrass?: boolean;
  /** Promo-reference hamlet clearings. Never on for a real game board. */
  promoClears?: boolean;
}

interface GroundDetailTransform {
  x: number;
  z: number;
  rotation: number;
  scale: number;
}

interface GroundTuft extends GroundDetailTransform {
  dry: boolean;
}

interface ForestFloorDetail extends GroundDetailTransform {
  kind: 'fern' | 'litter';
}

interface MeadowFlower extends GroundDetailTransform {
  palette: 0 | 1 | 2;
}

const COVER_TERRAINS = new Set<TerrainType>(['forest', 'pasture', 'jungle', 'tundra']);
const SANDY_TERRAINS = new Set<TerrainType>(['desert', 'coast', 'plains']);

/** Match BiomeDecorations diorama hamlet footprints — soft grass falloff into dirt apron. */
const DIORAMA_SETTLEMENT_GRASS_CLEARS: ReadonlyArray<{ x: number; z: number; hardR: number; softR: number }> = [
  { x: 0.35, z: 0.18, hardR: 0.22, softR: 0.48 },
  { x: -1.18, z: -0.34, hardR: 0.16, softR: 0.36 },
  { x: 1.56, z: -0.72, hardR: 0.16, softR: 0.36 },
];

/** Promo dirt roads (H7) — grass must yield so ruts read in close village shots. */
const DIORAMA_ROAD_CORRIDORS: ReadonlyArray<{
  points: ReadonlyArray<readonly [number, number]>;
  hardHalf: number;
  softHalf: number;
}> = [
  { points: [[0.35, 0.18], [0.05, 0.05], [-0.45, -0.2], [-1.18, -0.34]], hardHalf: 0.09, softHalf: 0.18 },
  { points: [[0.35, 0.18], [0.67, 0.02], [1.14, -0.38], [1.56, -0.72]], hardHalf: 0.09, softHalf: 0.18 },
  { points: [[0.35, 0.18], [0.4, 0.62], [0.2, 1.1], [-0.02, 1.48]], hardHalf: 0.08, softHalf: 0.16 },
];

function distToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-8) return Math.hypot(x - ax, z - az);
  const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lenSq, 0, 1);
  return Math.hypot(x - (ax + abx * t), z - (az + abz * t));
}

function distToPolyline(x: number, z: number, points: ReadonlyArray<readonly [number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    best = Math.min(best, distToSegment(x, z, a[0], a[1], b[0], b[1]));
  }
  return best;
}

/** 0 = fully clear (no grass), 1 = keep — feathers apron↔prairie. */
function settlementGrassKeepChance(x: number, z: number): number {
  let keep = 1;
  for (const clear of DIORAMA_SETTLEMENT_GRASS_CLEARS) {
    const dist = Math.hypot(x - clear.x, z - clear.z);
    if (dist <= clear.hardR) return 0;
    if (dist < clear.softR) {
      const t = (dist - clear.hardR) / Math.max(1e-4, clear.softR - clear.hardR);
      // Ease-in so grass densifies toward the soft rim.
      keep = Math.min(keep, t * t);
    }
  }
  return keep;
}

/** Soft corridor so muddy tracks aren't buried under Ultra lawn cards. */
function roadGrassKeepChance(x: number, z: number): number {
  let keep = 1;
  for (const road of DIORAMA_ROAD_CORRIDORS) {
    const dist = distToPolyline(x, z, road.points);
    if (dist <= road.hardHalf) return 0;
    if (dist < road.softHalf) {
      const t = (dist - road.hardHalf) / Math.max(1e-4, road.softHalf - road.hardHalf);
      keep = Math.min(keep, t * t);
    }
  }
  return keep;
}

function dioramaGroundKeepChance(x: number, z: number): number {
  return Math.min(settlementGrassKeepChance(x, z), roadGrassKeepChance(x, z));
}

function desertNeighborDirs(
  tile: HexTile,
  tilesById: Map<string, HexTile>,
): number[] {
  const dirs: number[] = [];
  for (let direction = 0; direction < 6; direction++) {
    const neighbor = tilesById.get(hexToId(hexNeighbor(tile.coord, direction as 0 | 1 | 2 | 3 | 4 | 5)));
    if (neighbor && SANDY_TERRAINS.has(neighbor.terrain)) dirs.push(direction);
  }
  return dirs;
}

/** 0 at sandy frontier, 1 deep inside green biome — softens carpet paint strokes. */
function coverKeepChance(localX: number, localZ: number, sandyDirs: readonly number[]): number {
  if (sandyDirs.length === 0) return 1;
  let towardSand = 0;
  for (const direction of sandyDirs) {
    const angle = THREE.MathUtils.degToRad(60 * direction);
    const outwardX = Math.cos(angle);
    const outwardZ = Math.sin(angle);
    towardSand = Math.max(towardSand, localX * outwardX + localZ * outwardZ);
  }
  // Soften toward sand — keep enough carpet so the frontier doesn't read as bare dirt.
  return THREE.MathUtils.clamp(1.15 - towardSand * 1.15, 0.22, 1);
}

function insideGroundCoverArea(x: number, z: number): boolean {
  const edge = Math.max(Math.abs(x) * 0.8660254 + Math.abs(z) * 0.5, Math.abs(z));
  // Full-face carpet — no center hole (that read as bare rings from aerial).
  return edge < 0.9;
}

export function buildGroundScatter(
  tiles: readonly HexTile[],
  mapSeed: number,
  density: number,
): GroundTuft[] {
  const tilesById = new Map(tiles.map((tile) => [tile.id, tile]));
  const result: GroundTuft[] = [];
  for (const tile of tiles) {
    if (!COVER_TERRAINS.has(tile.terrain)) continue;
    const rng = visualRngFor(mapSeed, tile.id, 'ground-cover-v3');
    const sandyDirs = desertNeighborDirs(tile, tilesById);
    const baseCount =
      tile.terrain === 'pasture'
        ? 320
        : tile.terrain === 'forest' || tile.terrain === 'jungle'
          ? 200
          : 120;
    const target = Math.max(0, Math.round(baseCount * density));
    const origin = cubeToWorld(tile.coord);
    const hasChit = typeof tile.diceValue === 'number';
    let accepted = 0;
    for (let attempt = 0; attempt < target * 5 && accepted < target; attempt++) {
      const localX = (rng() * 2 - 1) * 0.92;
      const localZ = (rng() * 2 - 1) * 0.92;
      if (!insideGroundCoverArea(localX, localZ)) continue;
      if (hasChit && localX * localX + localZ * localZ < 0.2 * 0.2) continue;
      if (rng() > coverKeepChance(localX, localZ, sandyDirs)) continue;
      const worldX = origin.x + localX;
      const worldZ = origin.z + localZ;
      if (rng() > dioramaGroundKeepChance(worldX, worldZ)) continue;
      result.push({
        x: worldX,
        z: worldZ,
        rotation: rng() * Math.PI,
        // Slightly smaller cards × more instances = finer prairie carpet.
        scale: 0.75 + rng() * 0.65,
        dry:
          tile.terrain === 'tundra' ||
          sandyDirs.length > 0 && rng() < 0.35 ||
          rng() < (tile.terrain === 'pasture' ? 0.18 : 0.14),
      });
      accepted++;
    }
  }
  return result;
}

export function buildMeadowFlowerScatter(
  tiles: readonly HexTile[],
  mapSeed: number,
  density: number,
): MeadowFlower[] {
  const result: MeadowFlower[] = [];
  for (const tile of tiles) {
    if (tile.terrain !== 'pasture' && tile.terrain !== 'forest') continue;
    const rng = visualRngFor(mapSeed, tile.id, 'meadow-flowers-v2');
    // Sparse quiet blooms — never a pink sparkle field.
    const target = Math.max(0, Math.round((tile.terrain === 'pasture' ? 12 : 3) * density));
    const origin = cubeToWorld(tile.coord);
    let accepted = 0;
    for (let attempt = 0; attempt < target * 6 && accepted < target; attempt++) {
      const localX = (rng() * 2 - 1) * 0.82;
      const localZ = (rng() * 2 - 1) * 0.82;
      if (!insideGroundCoverArea(localX, localZ)) continue;
      result.push({
        x: origin.x + localX,
        z: origin.z + localZ,
        rotation: rng() * Math.PI * 2,
        scale: 0.45 + rng() * 0.4,
        palette: Math.floor(rng() * 3) as 0 | 1 | 2,
      });
      accepted++;
    }
  }
  return result;
}

export function buildForestFloorScatter(
  tiles: readonly HexTile[],
  mapSeed: number,
  density: number,
  promoClears = true,
): ForestFloorDetail[] {
  const result: ForestFloorDetail[] = [];
  for (const tile of tiles) {
    if (tile.terrain !== 'forest' && tile.terrain !== 'jungle') continue;
    const rng = visualRngFor(mapSeed, tile.id, 'forest-floor-v2');
    const target = Math.max(0, Math.round((tile.terrain === 'jungle' ? 54 : 42) * density));
    const origin = cubeToWorld(tile.coord);
    const hasChit = typeof tile.diceValue === 'number';
    let accepted = 0;
    for (let attempt = 0; attempt < target * 5 && accepted < target; attempt++) {
      const localX = (rng() * 2 - 1) * 0.8;
      const localZ = (rng() * 2 - 1) * 0.8;
      if (!insideGroundCoverArea(localX, localZ)) continue;
      const worldX = origin.x + localX;
      const worldZ = origin.z + localZ;
      if (promoClears && rng() > dioramaGroundKeepChance(worldX, worldZ)) continue;
      if (hasChit && localX * localX + localZ * localZ < 0.2 * 0.2) continue;
      result.push({
        x: worldX,
        z: worldZ,
        rotation: rng() * Math.PI * 2,
        scale: 0.72 + rng() * 0.78,
        kind: rng() < (tile.terrain === 'jungle' ? 0.42 : 0.27) ? 'fern' : 'litter',
      });
      accepted++;
    }
  }
  return result;
}

function createTuftGeometry(): THREE.BufferGeometry {
  // 3 lean blades — enough micro-volume without ~2× tris of a 5-card tuft.
  const parts: THREE.BufferGeometry[] = [];
  const leans = [-0.22, -0.38, -0.5];
  const heights = [0.05, 0.07, 0.085];
  for (let index = 0; index < 3; index++) {
    const height = heights[index]!;
    const plane = new THREE.PlaneGeometry(0.022 + (index % 3) * 0.003, height, 1, 1);
    plane.translate(0, height * 0.48, 0);
    plane.rotateX(leans[index]!);
    plane.rotateY((index * Math.PI) / 3 + 0.08);
    parts.push(plane);
  }
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Unable to merge photo grass tuft');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Feather a ground card towards its own edges.
 *
 * `grass_lawn_topdown_v1.png` is fully opaque — its alpha channel is 1
 * everywhere — so `alphaTest` discarded nothing and every patch rendered as a
 * hard-edged rectangle lying on the terrain. From the game camera those read as
 * scattered dark quads, which is what made the ground look like it was covered
 * in badly drawn shadows.
 */
function attachLawnEdgeFade(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aCard;
        varying vec2 vCard;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCard = aCard;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vCard;`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `vec2 catanxCardOffset = abs(vCard - 0.5) * 2.0;
        float catanxEdge = max(catanxCardOffset.x, catanxCardOffset.y);
        diffuseColor.a *= 1.0 - smoothstep(0.42, 0.98, catanxEdge);
        #include <alphatest_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'catanx-lawn-edge-fade-v1';
  material.needsUpdate = true;
}

function createLawnPatchGeometry(): THREE.BufferGeometry {
  // Two layered cards — third plane was mostly overdraw.
  const parts: THREE.BufferGeometry[] = [];
  const lifts = [0.003, 0.01];
  const sizes: Array<[number, number]> = [[0.1, 0.088], [0.09, 0.1]];
  for (let index = 0; index < 2; index++) {
    const [w, h] = sizes[index]!;
    const lawn = new THREE.PlaneGeometry(w, h, 1, 1);
    const uv = lawn.getAttribute('uv');
    const uOff = (index * 0.37) % 1;
    const vOff = (index * 0.53) % 1;
    const uScale = 0.75 + index * 0.12;
    const vScale = 0.8 + ((index + 1) % 3) * 0.1;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * uScale + uOff, uv.getY(i) * vScale + vOff);
    }
    uv.needsUpdate = true;
    // The sampling UV above is offset and scaled per card, so it cannot be used
    // to find the card's own edge. Keep the untouched 0..1 corner coordinate.
    const card = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      const corner = i % 4;
      card[i * 2] = corner === 0 || corner === 2 ? 0 : 1;
      card[i * 2 + 1] = corner < 2 ? 1 : 0;
    }
    lawn.setAttribute('aCard', new THREE.BufferAttribute(card, 2));
    lawn.translate(0, lifts[index]!, 0);
    lawn.rotateX(-Math.PI / 2 + 0.055 * (index === 1 ? -1 : 1));
    lawn.rotateY(index * 1.37 + 0.55);
    parts.push(lawn);
  }
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Unable to merge lawn patch');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildLawnScatter(
  tiles: readonly HexTile[],
  mapSeed: number,
  density: number,
): GroundTuft[] {
  const tilesById = new Map(tiles.map((tile) => [tile.id, tile]));
  const result: GroundTuft[] = [];
  for (const tile of tiles) {
    if (tile.terrain !== 'pasture' && tile.terrain !== 'forest') continue;
    const rng = visualRngFor(mapSeed, tile.id, 'lawn-cover-v2');
    const sandyDirs = desertNeighborDirs(tile, tilesById);
    const base =
      tile.terrain === 'pasture' ? 280
          : 140;
    const target = Math.max(0, Math.round(base * density));
    const origin = cubeToWorld(tile.coord);
    let accepted = 0;
    for (let attempt = 0; attempt < target * 4 && accepted < target; attempt++) {
      const localX = (rng() * 2 - 1) * 0.93;
      const localZ = (rng() * 2 - 1) * 0.93;
      if (!insideGroundCoverArea(localX, localZ)) continue;
      if (rng() > coverKeepChance(localX, localZ, sandyDirs)) continue;
      const worldX = origin.x + localX;
      const worldZ = origin.z + localZ;
      if (rng() > dioramaGroundKeepChance(worldX, worldZ)) continue;
      result.push({
        x: worldX,
        z: worldZ,
        rotation: rng() * Math.PI * 2,
        scale: 0.5 + rng() * 0.95,
        dry: sandyDirs.length > 0 && rng() < 0.45,
      });
      accepted++;
    }
  }
  return result;
}

function createFernGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const push = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z);
    normals.push(0, 0.72, 0.28);
    uvs.push(u, v);
  };
  for (let frond = 0; frond < 7; frond++) {
    const angle = (frond / 7) * Math.PI * 2;
    const length = 0.052 + (frond % 3) * 0.008;
    const width = 0.009 + (frond % 2) * 0.002;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const px = -dz;
    const pz = dx;
    const rootX = dx * 0.006;
    const rootZ = dz * 0.006;
    const midX = dx * length * 0.58;
    const midZ = dz * length * 0.58;
    const tipX = dx * length;
    const tipZ = dz * length;
    push(rootX, 0.003, rootZ, 0.5, 0);
    push(midX + px * width, 0.019, midZ + pz * width, 0, 0.55);
    push(tipX, 0.036, tipZ, 0.5, 1);
    push(rootX, 0.003, rootZ, 0.5, 0);
    push(tipX, 0.036, tipZ, 0.5, 1);
    push(midX - px * width, 0.019, midZ - pz * width, 1, 0.55);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLeafLitterGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let leaf = 0; leaf < 6; leaf++) {
    const angle = leaf * 2.399963 + 0.37;
    const radius = 0.009 + (leaf % 3) * 0.007;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const dx = Math.cos(angle + 0.8) * 0.012;
    const dz = Math.sin(angle + 0.8) * 0.012;
    const px = -dz * 0.42;
    const pz = dx * 0.42;
    positions.push(
      cx - dx, 0, cz - dz,
      cx + px, 0.0015, cz + pz,
      cx + dx, 0.0005, cz + dz,
      cx - dx, 0, cz - dz,
      cx + dx, 0.0005, cz + dz,
      cx - px, 0.001, cz - pz,
    );
    for (let vertex = 0; vertex < 6; vertex++) normals.push(0, 1, 0);
    uvs.push(0, 0.5, 0.5, 1, 1, 0.5, 0, 0.5, 1, 0.5, 0.5, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createFlowerClusterGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let flower = 0; flower < 2; flower++) {
    const angle = flower * 2.399963 + 0.4;
    const radius = 0.004 + flower * 0.004;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const y = 0.014 + (flower % 2) * 0.004;
    const size = 0.0038 + flower * 0.0005;
    positions.push(
      cx - size, y, cz,
      cx, y + 0.001, cz + size,
      cx + size, y, cz,
      cx - size, y, cz,
      cx + size, y, cz,
      cx, y + 0.001, cz - size,
    );
    for (let vertex = 0; vertex < 6; vertex++) normals.push(0, 1, 0);
    uvs.push(0, 0.5, 0.5, 1, 1, 0.5, 0, 0.5, 1, 0.5, 0.5, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function GroundCoverLayer({
  tufts,
  material,
  geometry,
}: {
  tufts: readonly GroundTuft[];
  material: THREE.MeshStandardMaterial;
  geometry: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const surface = useSurfaceHeight();
  const tint = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < tufts.length; index++) {
      const tuft = tufts[index]!;
      dummy.position.set(tuft.x, surface.sampleHeight(tuft.x, tuft.z) + 0.004, tuft.z);
      // Stronger lean/yaw so cards don't stamp as a parallel grid.
      dummy.rotation.set(
        (index % 7 - 3) * 0.04,
        tuft.rotation + (index % 5) * 0.31,
        (index % 5 - 2) * 0.05,
      );
      const stretch = 0.85 + (index % 4) * 0.08;
      dummy.scale.set(tuft.scale * stretch, tuft.scale, tuft.scale * (2 - stretch));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const shade = 0.82 + (index % 9) * 0.025 + (tuft.dry ? 0.08 : 0);
      tint.setRGB(shade * 1.02, shade, shade * 0.9);
      mesh.setColorAt(index, tint);
    }
    mesh.count = tufts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [surface, tint, tufts]);

  if (tufts.length === 0) return null;
  return <instancedMesh
    ref={ref}
    args={[geometry, undefined, tufts.length]}
        material={material}
    castShadow={false}
    receiveShadow={false}
    frustumCulled
    raycast={() => undefined}
  />;
}

function ForestFloorLayer({
  items,
  geometry,
  material,
}: {
  items: readonly GroundDetailTransform[];
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      dummy.position.set(item.x, surface.sampleHeight(item.x, item.z) + 0.005, item.z);
      dummy.rotation.set(0, item.rotation, 0);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, surface]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, items.length]}
        material={material}
      castShadow={false}
      receiveShadow={false}
      frustumCulled
      raycast={() => undefined}
    />
  );
}

export function TerrainMicroScatter({
  tiles,
  mapSeed,
  season,
  bladeGrass = false,
  promoClears = true,
}: TerrainMicroScatterProps) {
  const lod = useMapLod();
  const quality = useRenderQuality();
  const grassMap = useTexture('/assets/textures/vegetation/grass_blade_impostor_v4.png?v=grass-r7');
  const lawnMap = useTexture('/assets/textures/vegetation/grass_lawn_topdown_v1.png?v=lawn-r2');
  const density = quality.vegetationDensity * (lod === 0 ? 1 : 0.72);
  // Reference prairie: wall-to-wall thin photo cards on close Ultra shots.
  const groundDensity = density * (
    quality.id === 'ultra' ? (lod === 0 ? 1.55 : 1.15)
      : quality.id === 'high' ? (lod === 0 ? 2.0 : 1.1)
        : (lod === 0 ? 1.2 : 0.7)
  );
  const tufts = useMemo(
    () => (bladeGrass ? [] : buildGroundScatter(tiles, mapSeed, groundDensity)),
    [bladeGrass, groundDensity, mapSeed, tiles],
  );
  const lawnDensity = density * (
    quality.id === 'ultra' ? (lod === 0 ? 1.2 : 0.85)
      : quality.id === 'high' ? (lod === 0 ? 1.3 : 0.85)
        : (lod === 0 ? 0.95 : 0.55)
  );
  const lawns = useMemo(
    () => (bladeGrass ? [] : buildLawnScatter(tiles, mapSeed, lawnDensity)),
    [bladeGrass, lawnDensity, mapSeed, tiles],
  );
  const forestFloor = useMemo(
    () => buildForestFloorScatter(tiles, mapSeed, density * 0.75, promoClears),
    [density, mapSeed, promoClears, tiles],
  );
  const flowers = useMemo(
    () => season === 'winter' ? [] : buildMeadowFlowerScatter(tiles, mapSeed, density * (season === 'spring' ? 0.85 : 0.45)),
    [density, mapSeed, season, tiles],
  );
  const green = useMemo(() => tufts.filter((tuft) => !tuft.dry), [tufts]);
  const dry = useMemo(() => tufts.filter((tuft) => tuft.dry), [tufts]);
  const lawnGreen = useMemo(() => lawns.filter((tuft) => !tuft.dry), [lawns]);
  const lawnDry = useMemo(() => lawns.filter((tuft) => tuft.dry), [lawns]);
  const ferns = useMemo(() => forestFloor.filter((item) => item.kind === 'fern'), [forestFloor]);
  const litter = useMemo(() => forestFloor.filter((item) => item.kind === 'litter'), [forestFloor]);
  const flowerPalettes = useMemo(
    () => ([0, 1, 2] as const).map((palette) => flowers.filter((item) => item.palette === palette)),
    [flowers],
  );
  const geometry = useMemo(createTuftGeometry, []);
  const lawnGeometry = useMemo(createLawnPatchGeometry, []);
  const fernGeometry = useMemo(createFernGeometry, []);
  const litterGeometry = useMemo(createLeafLitterGeometry, []);
  const flowerGeometry = useMemo(createFlowerClusterGeometry, []);
  // Lift, do not dust down. #9a9a72 is a 0.6 multiplier over an already dark
  // grass photo, which is a large part of why pasture read as murky scrub.
  const greenMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: grassMap,
    // Frosted, not buried: winter tufts keep a green cast so pasture stays pasture.
    color: season === 'winter' ? '#cad5c0' : season === 'autumn' ? '#d2d49a' : '#dbe6ab',
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    transparent: false,
    depthWrite: true,
  }), [grassMap, season]);
  const dryMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: grassMap,
    color: season === 'winter' ? '#dde1de' : '#b8a878',
    roughness: 0.97,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.52,
    depthWrite: true,
  }), [grassMap, season]);
  const lawnMaterial = useMemo(() => {
    const result = new THREE.MeshStandardMaterial({
      map: lawnMap,
      color: season === 'winter' ? '#e2e8e2' : season === 'autumn' ? '#c8b788' : '#b7bd86',
      roughness: 0.98,
      metalness: 0,
      // Top-down lawn cards are viewed from above — FrontSide cuts fill-rate in half.
      side: THREE.FrontSide,
      alphaTest: 0.36,
      depthWrite: true,
    });
    attachLawnEdgeFade(result);
    return result;
  }, [lawnMap, season]);
  const lawnDryMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: lawnMap,
    color: season === 'winter' ? '#e6eae6' : '#d0bd90',
    roughness: 0.98,
    metalness: 0,
    side: THREE.FrontSide,
    alphaTest: 0.38,
    depthWrite: true,
  }), [lawnMap, season]);
  const fernMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: season === 'winter' ? '#9ca89a' : season === 'autumn' ? '#657044' : '#3a5536',
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
  }), [season]);
  const litterMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: season === 'winter' ? '#b7b6ae' : season === 'autumn' ? '#7d4f2d' : '#4a3928',
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  }), [season]);
  // Quiet meadow flecks — cream / soft butter / pale sage, never magenta pink.
  const flowerMaterials = useMemo(() => [
    new THREE.MeshStandardMaterial({ color: season === 'autumn' ? '#c9b67a' : '#f2ebd0', roughness: 0.9, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: season === 'autumn' ? '#b8a878' : '#e8e2c8', roughness: 0.9, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: season === 'autumn' ? '#d0c8a8' : '#eef3e6', roughness: 0.9, side: THREE.DoubleSide }),
  ], [season]);

  useEffect(() => {
    grassMap.colorSpace = THREE.SRGBColorSpace;
    grassMap.anisotropy = 8;
    grassMap.needsUpdate = true;
    lawnMap.colorSpace = THREE.SRGBColorSpace;
    lawnMap.anisotropy = 8;
    lawnMap.wrapS = THREE.RepeatWrapping;
    lawnMap.wrapT = THREE.RepeatWrapping;
    lawnMap.needsUpdate = true;
  }, [grassMap, lawnMap]);

  useEffect(() => () => {
    geometry.dispose();
    lawnGeometry.dispose();
    fernGeometry.dispose();
    litterGeometry.dispose();
    flowerGeometry.dispose();
    greenMaterial.dispose();
    dryMaterial.dispose();
    lawnMaterial.dispose();
    lawnDryMaterial.dispose();
    fernMaterial.dispose();
    litterMaterial.dispose();
    flowerMaterials.forEach((material) => material.dispose());
  }, [dryMaterial, fernGeometry, fernMaterial, flowerGeometry, flowerMaterials, geometry, greenMaterial, lawnDryMaterial, lawnGeometry, lawnMaterial, litterGeometry, litterMaterial]);

  if (lod >= 2 || quality.vegetationDensity <= 0.05) return null;
  return <group>
    <GroundCoverLayer tufts={lawnGreen} geometry={lawnGeometry} material={lawnMaterial} />
    <GroundCoverLayer tufts={lawnDry} geometry={lawnGeometry} material={lawnDryMaterial} />
    <GroundCoverLayer tufts={green} geometry={geometry} material={greenMaterial} />
    <GroundCoverLayer tufts={dry} geometry={geometry} material={dryMaterial} />
    <ForestFloorLayer items={ferns} geometry={fernGeometry} material={fernMaterial} />
    <ForestFloorLayer items={litter} geometry={litterGeometry} material={litterMaterial} />
    {flowerPalettes.map((items, palette) => (
      <ForestFloorLayer
        key={`meadow-flowers-${palette}`}
        items={items}
        geometry={flowerGeometry}
        material={flowerMaterials[palette]!}
      />
    ))}
  </group>;
}

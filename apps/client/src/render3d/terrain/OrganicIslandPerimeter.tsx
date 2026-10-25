import { useEffect, useMemo, useRef } from 'react';
import type { HexTile } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { getAuthoredBiomeTextures } from './authoredPbrTextures';
import { attachWorldProjectedPbr } from './worldProjectedPbr';
import { useSurfaceHeight } from './SurfaceHeightContext';
import { TERRAIN_BASE_COLORS } from './TerrainCatalog';

interface OrganicIslandPerimeterProps {
  tiles: readonly HexTile[];
  mapSeed: number;
}

interface BoundaryEdge {
  id: string;
  start: THREE.Vector2;
  end: THREE.Vector2;
  outward: THREE.Vector2;
}

function vertex(index: number): THREE.Vector2 {
  const angle = THREE.MathUtils.degToRad(60 * (index % 6) - 30);
  return new THREE.Vector2(
    Math.cos(angle) * HEX_WORLD_RADIUS,
    Math.sin(angle) * HEX_WORLD_RADIUS,
  );
}

function pointKey(point: THREE.Vector2): string {
  return `${point.x.toFixed(4)}:${point.y.toFixed(4)}`;
}

function boundaryEdges(tiles: readonly HexTile[]): BoundaryEdge[] {
  const tileMap = new Map(tiles.map((tile) => [tile.id, tile]));
  const edges: BoundaryEdge[] = [];
  for (const tile of tiles) {
    if (isWaterTerrain(tile.terrain)) continue;
    const origin = cubeToWorld(tile.coord);
    for (let direction = 0; direction < 6; direction++) {
      const neighbor = tileMap.get(hexToId(hexNeighbor(tile.coord, direction as 0 | 1 | 2 | 3 | 4 | 5)));
      if (neighbor && neighbor.terrain !== 'ocean' && neighbor.terrain !== 'coast') continue;
      // Engine directions run E, NE, NW, W, SW, SE while pointy-top corner
      // indices run counter-clockwise from the lower-right corner.
      const corner = (6 - direction) % 6;
      const localStart = vertex(corner);
      const localEnd = vertex(corner + 1);
      const start = new THREE.Vector2(origin.x + localStart.x, origin.z + localStart.y);
      const end = new THREE.Vector2(origin.x + localEnd.x, origin.z + localEnd.y);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const outward = midpoint.sub(new THREE.Vector2(origin.x, origin.z)).normalize();
      edges.push({ id: `${tile.id}:${direction}`, start, end, outward });
    }
  }
  return edges;
}

function edgeLoops(edges: readonly BoundaryEdge[], mapSeed: number): THREE.Vector2[][] {
  const byStart = new Map<string, BoundaryEdge[]>();
  for (const edge of edges) {
    const bucket = byStart.get(pointKey(edge.start)) ?? [];
    bucket.push(edge);
    byStart.set(pointKey(edge.start), bucket);
  }
  const unused = new Set(edges.map((edge) => edge.id));
  const loops: THREE.Vector2[][] = [];

  while (unused.size > 0) {
    const first = edges.find((edge) => unused.has(edge.id));
    if (!first) break;
    const loop: THREE.Vector2[] = [];
    let current: BoundaryEdge | undefined = first;
    let guard = 0;
    while (current && unused.has(current.id) && guard++ < edges.length + 2) {
      unused.delete(current.id);
      const phase = ((hashString(`${mapSeed}:${current.id}`) % 1000) / 1000) * Math.PI * 2;
      const segments = 8;
      for (let segment = 0; segment < segments; segment++) {
        const t = segment / segments;
        const point = current.start.clone().lerp(current.end, t);
        const detail = ((hashString(`${mapSeed}:${current.id}:${segment}`) % 2001) / 1000 - 1);
        // A broad bay/cape signal sits underneath the small erosion noise.
        // The former values only rounded the six logical corners and still
        // left a recognisable board-game silhouette at island scale.
        const drift =
          Math.sin(Math.PI * t) * (0.072 + Math.sin(phase) * 0.046) +
          Math.sin(t * Math.PI * 2 + phase * 0.7) * 0.052 +
          Math.sin(t * Math.PI * 5 - phase) * 0.018 +
          detail * 0.032;
        point.addScaledVector(current.outward, drift);
        loop.push(point);
      }
      const candidates: BoundaryEdge[] = byStart.get(pointKey(current.end)) ?? [];
      current = candidates.find((candidate: BoundaryEdge) => unused.has(candidate.id));
    }
    if (loop.length >= 8) loops.push(loop);
  }
  return loops;
}

function smoothClosed(points: readonly THREE.Vector2[]): THREE.Vector2[] {
  let output = points.map((point) => point.clone());
  for (let iteration = 0; iteration < 3; iteration++) {
    const next: THREE.Vector2[] = [];
    for (let index = 0; index < output.length; index++) {
      const a = output[index]!;
      const b = output[(index + 1) % output.length]!;
      next.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    }
    output = next;
  }
  return output;
}

function signedArea(points: readonly THREE.Vector2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

interface LandCenter {
  point: THREE.Vector2;
  terrain: HexTile['terrain'];
}

function nearestLand(
  point: THREE.Vector2,
  landCenters: readonly LandCenter[],
): LandCenter {
  let nearest = landCenters[0] ?? { point: new THREE.Vector2(), terrain: 'pasture' };
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const center of landCenters) {
    const distance = center.point.distanceToSquared(point);
    if (distance < nearestDistance) {
      nearest = center;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function buildOrganicPerimeterGeometry(
  tiles: readonly HexTile[],
  mapSeed: number,
  sampleHeight?: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const loops = edgeLoops(boundaryEdges(tiles), mapSeed).map(smoothClosed);
  const landCenters = tiles
    .filter((tile) => !isWaterTerrain(tile.terrain))
    .map((tile) => {
      const center = cubeToWorld(tile.coord);
      return { point: new THREE.Vector2(center.x, center.z), terrain: tile.terrain };
    });
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const soil = new THREE.Color('#6e6c5e');
  const drySand = new THREE.Color('#d4c4a4');
  const rock = new THREE.Color('#6e716c');
  const wetSand = new THREE.Color('#6a8078');
  const submerged = new THREE.Color('#3d5a60');

  for (const loop of loops) {
    const ccw = signedArea(loop) > 0;
    const base = positions.length / 3;
    for (let index = 0; index < loop.length; index++) {
      const previous = loop[(index + loop.length - 1) % loop.length]!;
      const current = loop[index]!;
      const next = loop[(index + 1) % loop.length]!;
      const tangent = next.clone().sub(previous).normalize();
      const tangentNormal = ccw
        ? new THREE.Vector2(tangent.y, -tangent.x)
        : new THREE.Vector2(-tangent.y, tangent.x);
      const land = nearestLand(current, landCenters);
      // Offset the already-smoothed closed curve along its continuous normal.
      // Nearest-tile radial vectors jump at Voronoi borders and create spikes
      // once the shore becomes wider than a narrow cosmetic skirt.
      const outward = tangentNormal;
      const jitter = ((hashString(`${mapSeed}:perimeter:${index}`) % 1001) / 1000 - 0.5) * 0.04;
      const bay = Math.sin(index * 0.31 + mapSeed * 0.013) * 0.025
        + Math.sin(index * 0.83 - mapSeed * 0.007) * 0.009;
      const gentle = land.terrain === 'plains' || land.terrain === 'pasture'
        || land.terrain === 'desert' || land.terrain === 'hill';
      // Chaikin smoothing rounds the logical corners. The first ring reaches
      // back under the visual terrain so the organic skirt never exposes a
      // triangular gap or the original hex silhouette.
      const inner = current.clone().addScaledVector(outward, -0.16);
      const shoulder = current.clone().addScaledVector(outward, 0.005 + jitter * 0.12);
      // Gentle coasts get a wider sandy shelf; rocky coasts stay steeper.
      const beachScale = gentle ? 1.72 : 1.08;
      const upperBeach = current.clone().addScaledVector(outward, (0.1 + bay * 0.5 + jitter * 0.25) * beachScale);
      const lowerBeach = current.clone().addScaledVector(outward, (0.2 + bay * 0.65 + jitter * 0.35) * beachScale);
      const wetLine = current.clone().addScaledVector(outward, (0.3 + bay * 0.85 + jitter * 0.48) * beachScale);
      const outer = current.clone().addScaledVector(outward, (0.44 + bay * 1.05 + jitter * 0.58) * beachScale);
      const innerHeight = sampleHeight?.(inner.x, inner.y) ?? HEX_SLAB_THICKNESS;
      const sampledShoulderHeight = sampleHeight?.(shoulder.x, shoulder.y) ?? HEX_SLAB_THICKNESS;
      const shoulderHeight = THREE.MathUtils.lerp(
        innerHeight,
        Math.min(sampledShoulderHeight, gentle ? 0.038 : 0.09),
        gentle ? 0.42 : 0.62,
      );
      const upperHeight = gentle ? 0.008 : 0.028;
      const lowerHeight = gentle ? -0.018 : -0.008;
      const biome = new THREE.Color(TERRAIN_BASE_COLORS[land.terrain]);
      const innerColor = biome.clone().lerp(soil, 0.4).offsetHSL(0, -0.06, -0.01).multiplyScalar(0.82);
      const shoulderColor = biome.clone().lerp(gentle ? drySand : rock, gentle ? 0.72 : 0.7)
        .offsetHSL(0, -0.05, 0.01)
        .multiplyScalar(gentle ? 0.92 : 0.8);
      const upperColor = biome.clone().lerp(gentle ? drySand : rock, gentle ? 0.88 : 0.84)
        .offsetHSL(0, -0.04, 0.02)
        .multiplyScalar(gentle ? 0.98 : 0.78);
      const lowerColor = upperColor.clone().lerp(wetSand, gentle ? 0.35 : 0.48);
      positions.push(
        inner.x, innerHeight + 0.012, inner.y,
        shoulder.x, shoulderHeight + 0.004, shoulder.y,
        upperBeach.x, upperHeight + jitter * 0.035, upperBeach.y,
        lowerBeach.x, lowerHeight + jitter * 0.024, lowerBeach.y,
        wetLine.x, -0.059 + jitter * 0.006, wetLine.y,
        outer.x, -0.086, outer.y,
      );
      colors.push(
        innerColor.r, innerColor.g, innerColor.b,
        shoulderColor.r, shoulderColor.g, shoulderColor.b,
        upperColor.r, upperColor.g, upperColor.b,
        lowerColor.r, lowerColor.g, lowerColor.b,
        wetSand.r * 0.88, wetSand.g * 0.92, wetSand.b * 0.94,
        submerged.r, submerged.g, submerged.b,
      );
    }
    for (let index = 0; index < loop.length; index++) {
      const next = (index + 1) % loop.length;
      const a = base + index * 6;
      const b = base + next * 6;
      for (let ring = 0; ring < 5; ring++) {
        indices.push(a + ring, b + ring, b + ring + 1, a + ring, b + ring + 1, a + ring + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Shared closed shoreline, independent from the logical hex hitboxes. */
export function OrganicIslandPerimeter({ tiles, mapSeed }: OrganicIslandPerimeterProps) {
  const surface = useSurfaceHeight();
  const quality = useRenderQuality();
  const geometry = useMemo(
    () => buildOrganicPerimeterGeometry(tiles, mapSeed, (x, z) => surface.sampleHeight(x, z)),
    [mapSeed, surface, tiles],
  );
  const material = useMemo(() => {
    // Dedicated dune sand PBR on the beach skirt — cliff maps washed grain out of gentle coasts.
    const sand = getAuthoredBiomeTextures('desert', quality.textureTier);
    const rock = getAuthoredBiomeTextures('mountain', quality.textureTier);
    const result = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: sand.albedo ?? rock.albedo,
      normalMap: sand.normal ?? rock.normal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughnessMap: sand.roughness ?? rock.roughness,
      aoMap: sand.ao ?? rock.ao,
      aoMapIntensity: 0.52,
      roughness: 0.9,
      metalness: 0.004,
      envMapIntensity: 0.4,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      polygonOffsetUnits: -0.5,
    });
    attachWorldProjectedPbr(result, 0.55);
    return result;
  }, [quality.textureTier]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (geometry.getAttribute('position').count === 0) return null;
  // Surf is drawn by the ocean shader from the shore distance field. The old
  // ribbon of un-tone-mapped white triangles laid over the water read as torn
  // paper wherever its breaker gating left a gap.
  return <mesh geometry={geometry} material={material} receiveShadow raycast={() => undefined} />;
}

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

/**
 * Integer keys: `toFixed` printed a corner at -1e-17 as "-0.0000" and its
 * twin from the neighbouring tile as "0.0000", so the edges never chained and
 * the coast broke into open fragments.
 */
function pointKey(point: THREE.Vector2): string {
  return `${Math.round(point.x * 1000) + 0}:${Math.round(point.y * 1000) + 0}`;
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

interface CoastLoop {
  points: THREE.Vector2[];
  /** False when tracing ran out of edges before returning to its start. */
  closed: boolean;
}

function cross2(a: THREE.Vector2, b: THREE.Vector2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Where two land masses touch at a single corner, two boundary edges leave
 * the same vertex. Taking the first one could jump to the other mass, leave a
 * loop open (its closing quad then spanned the island as a streak) or flip the
 * outward normals of a whole stretch (rings folded into standing "boxes").
 * Always take the turn that hugs the land the tightest instead.
 */
function nextEdge(current: BoundaryEdge, candidates: readonly BoundaryEdge[]): BoundaryEdge | undefined {
  if (candidates.length <= 1) return candidates[0];
  const incoming = current.end.clone().sub(current.start);
  // Land lies opposite the outward normal.
  const landSide = Math.sign(cross2(incoming, current.outward.clone().negate())) || 1;
  let best: BoundaryEdge | undefined;
  let bestTurn = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const outgoing = candidate.end.clone().sub(candidate.start);
    const turn = Math.atan2(cross2(incoming, outgoing), incoming.dot(outgoing)) * landSide;
    if (turn > bestTurn) {
      bestTurn = turn;
      best = candidate;
    }
  }
  return best;
}

function edgeLoops(edges: readonly BoundaryEdge[], mapSeed: number): CoastLoop[] {
  const byStart = new Map<string, BoundaryEdge[]>();
  for (const edge of edges) {
    const bucket = byStart.get(pointKey(edge.start)) ?? [];
    bucket.push(edge);
    byStart.set(pointKey(edge.start), bucket);
  }
  const unused = new Set(edges.map((edge) => edge.id));
  const loops: CoastLoop[] = [];

  while (unused.size > 0) {
    const first = edges.find((edge) => unused.has(edge.id));
    if (!first) break;
    const loop: THREE.Vector2[] = [];
    let current: BoundaryEdge | undefined = first;
    let last: BoundaryEdge = first;
    let guard = 0;
    while (current && unused.has(current.id) && guard++ < edges.length + 2) {
      unused.delete(current.id);
      last = current;
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
      const candidates: BoundaryEdge[] = (byStart.get(pointKey(current.end)) ?? []).filter(
        (candidate) => unused.has(candidate.id),
      );
      current = nextEdge(current, candidates);
    }
    const closed = pointKey(last.end) === pointKey(first.start);
    if (loop.length >= 8) loops.push({ points: loop, closed });
  }
  return loops;
}

function smoothLoop({ points, closed }: CoastLoop): CoastLoop {
  let output = points.map((point) => point.clone());
  for (let iteration = 0; iteration < 3; iteration++) {
    const next: THREE.Vector2[] = [];
    const segments = closed ? output.length : output.length - 1;
    if (!closed) next.push(output[0]!.clone());
    for (let index = 0; index < segments; index++) {
      const a = output[index]!;
      const b = output[(index + 1) % output.length]!;
      next.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    }
    if (!closed) next.push(output[output.length - 1]!.clone());
    output = next;
  }
  return { points: output, closed };
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

/** Vertices per loop sample: inner, shoulder, upper beach, lower beach, wet line, outer. */
const RING_COUNT = 6;

/**
 * The shoulder height follows the terrain sampled just inside the coast, so
 * every bump of a relief tile became a step in the skirt — a stair of facets
 * that was most visible on bright snow. Three circular [¼ ½ ¼] passes keep the
 * shelf continuous; it never rises above its own inner ring.
 */
function smoothRing(heights: number[], passes: number): number[] {
  const count = heights.length;
  let out = heights;
  for (let pass = 0; pass < passes; pass++) {
    const current = out;
    out = current.map(
      (height, index) =>
        current[(index + count - 1) % count]! * 0.25 + height * 0.5 + current[(index + 1) % count]! * 0.25,
    );
  }
  return out;
}

/**
 * Offsetting a zig-zag coastline outward folds the far rings over themselves
 * at every concave hex corner — stepped flaps, most visible on wide snow
 * shelves. Relaxing each ring's XZ along the loop (harder for farther rings)
 * unfolds them into a continuous, rounded shore.
 */
function smoothOuterRings(
  positions: number[],
  snowWeights: readonly number[],
  base: number,
  count: number,
): void {
  if (count < 3) return;
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const vertex = (index: number) => base + index * RING_COUNT + ring;
    // The shoulder (ring 1) must stay just outside the hex edge, where the
    // terrain's vertical skirt stands, or that wall pokes through the shore.
    // The inner ring may relax on snow, where it is the field's own white.
    // Same strength for every outer ring keeps them parallel: different
    // strengths made neighbouring rings cross at concave corners.
    const passes = 8;
    const xs0 = Array.from({ length: count }, (_, index) => positions[vertex(index) * 3]!);
    const zs0 = Array.from({ length: count }, (_, index) => positions[vertex(index) * 3 + 2]!);
    const xs = smoothRing(xs0, passes);
    const zs = smoothRing(zs0, passes);
    for (let index = 0; index < count; index++) {
      const amount = ring === 1 ? 0.35 : ring === 0 ? (snowWeights[vertex(index)] ?? 0) : 1;
      positions[vertex(index) * 3] = THREE.MathUtils.lerp(xs0[index]!, xs[index]!, amount);
      positions[vertex(index) * 3 + 2] = THREE.MathUtils.lerp(zs0[index]!, zs[index]!, amount);
    }
  }
}

function smoothShoulderHeights(
  positions: number[],
  snowWeights: readonly number[],
  base: number,
  count: number,
): void {
  if (count < 3) return;
  const vertex = (index: number, ring: number) => base + index * RING_COUNT + ring;
  const y = (index: number, ring: number) => positions[vertex(index, ring) * 3 + 1]!;
  // On snow, smoothing only fills the valleys between ice-cap bumps: lowering
  // a ring would let the terrain's hexagonal skirt wall show above the shelf.
  const inner = Array.from({ length: count }, (_, index) => y(index, 0));
  const innerSmooth = smoothRing(inner, 6);
  for (let index = 0; index < count; index++) {
    const snow = snowWeights[vertex(index, 0)] ?? 0;
    const filled = Math.max(inner[index]!, innerSmooth[index]!);
    positions[vertex(index, 0) * 3 + 1] = THREE.MathUtils.lerp(inner[index]!, filled, snow);
  }
  const original = Array.from({ length: count }, (_, index) => y(index, 1));
  const shoulder = smoothRing(original, 3);
  for (let index = 0; index < count; index++) {
    const snow = snowWeights[vertex(index, 1)] ?? 0;
    const target = snow > 0.5 ? Math.max(shoulder[index]!, original[index]!) : shoulder[index]!;
    positions[vertex(index, 1) * 3 + 1] = Math.min(target, y(index, 0));
  }
}

export function buildOrganicPerimeterGeometry(
  tiles: readonly HexTile[],
  mapSeed: number,
  sampleHeight?: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const loops = edgeLoops(boundaryEdges(tiles), mapSeed).map(smoothLoop);
  const landCenters = tiles
    .filter((tile) => !isWaterTerrain(tile.terrain))
    .map((tile) => {
      const center = cubeToWorld(tile.coord);
      return { point: new THREE.Vector2(center.x, center.z), terrain: tile.terrain };
    });
  const positions: number[] = [];
  const colors: number[] = [];
  const snowWeights: number[] = [];
  const indices: number[] = [];
  const soil = new THREE.Color('#6e6c5e');
  const drySand = new THREE.Color('#d4c4a4');
  const rock = new THREE.Color('#6e716c');
  const wetSand = new THREE.Color('#6a8078');
  const submerged = new THREE.Color('#3d5a60');
  // Snow coast palette: powder on the rim, compacted snow, blue ice at the
  // waterline. Tuned against the snow the terrain shader actually renders.
  const snowRim = new THREE.Color('#f3f7f9');
  const snowShoulder = new THREE.Color('#e3ebef');
  const packedSnow = new THREE.Color('#c3d3db');
  const wetIce = new THREE.Color('#cfdde3');
  const iceShallows = new THREE.Color('#a3bfca');

  for (const { points: loop, closed } of loops) {
    const ccw = signedArea(loop) > 0;
    const base = positions.length / 3;
    for (let index = 0; index < loop.length; index++) {
      const last = loop.length - 1;
      const previous = loop[!closed && index === 0 ? 0 : (index + loop.length - 1) % loop.length]!;
      const current = loop[index]!;
      const next = loop[!closed && index === last ? last : (index + 1) % loop.length]!;
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
      // Snowfields end in a rounded ice shelf, not a rock cliff: a brown
      // vertical face against white ice read as cardboard cut-outs.
      const snowy = land.terrain === 'glacier' || land.terrain === 'tundra';
      const beachScale = snowy ? 1.5 : gentle ? 1.72 : 1.08;
      const upperBeach = current.clone().addScaledVector(outward, (0.1 + bay * 0.5 + jitter * 0.25) * beachScale);
      const lowerBeach = current.clone().addScaledVector(outward, (0.2 + bay * 0.65 + jitter * 0.35) * beachScale);
      const wetLine = current.clone().addScaledVector(outward, (0.3 + bay * 0.85 + jitter * 0.48) * beachScale);
      const outer = current.clone().addScaledVector(outward, (0.44 + bay * 1.05 + jitter * 0.58) * beachScale);
      const innerHeight = sampleHeight?.(inner.x, inner.y) ?? HEX_SLAB_THICKNESS;
      const sampledShoulderHeight = sampleHeight?.(shoulder.x, shoulder.y) ?? HEX_SLAB_THICKNESS;
      const shoulderHeight = snowy
        ? // Level with the terrain edge so its skirt wall stays covered; the
          // widened beach does the descent instead.
          Math.min(innerHeight, sampledShoulderHeight + 0.012)
        : THREE.MathUtils.lerp(
            innerHeight,
            Math.min(sampledShoulderHeight, gentle ? 0.038 : 0.09),
            gentle ? 0.42 : 0.62,
          );
      const upperHeight = snowy ? 0.04 : gentle ? 0.008 : 0.028;
      const lowerHeight = snowy ? -0.004 : gentle ? -0.018 : -0.008;
      const biome = new THREE.Color(TERRAIN_BASE_COLORS[land.terrain]);
      const innerColor = snowy
        ? snowRim.clone()
        : biome.clone().lerp(soil, 0.4).offsetHSL(0, -0.06, -0.01).multiplyScalar(0.82);
      const shoulderColor = snowy
        ? snowShoulder.clone()
        : biome.clone().lerp(gentle ? drySand : rock, gentle ? 0.72 : 0.7)
            .offsetHSL(0, -0.05, 0.01)
            .multiplyScalar(gentle ? 0.92 : 0.8);
      const upperColor = snowy
        ? packedSnow.clone()
        : biome.clone().lerp(gentle ? drySand : rock, gentle ? 0.88 : 0.84)
            .offsetHSL(0, -0.04, 0.02)
            .multiplyScalar(gentle ? 0.98 : 0.78);
      const lowerColor = snowy ? wetIce.clone() : upperColor.clone().lerp(wetSand, gentle ? 0.35 : 0.48);
      const wetColor = snowy
        ? iceShallows.clone()
        : new THREE.Color(wetSand.r * 0.88, wetSand.g * 0.92, wetSand.b * 0.94);
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
        wetColor.r, wetColor.g, wetColor.b,
        submerged.r, submerged.g, submerged.b,
      );
      const snow = snowy ? 1 : 0;
      snowWeights.push(snow, snow, snow, snow * 0.9, snow * 0.55, 0);
    }
    smoothOuterRings(positions, snowWeights, base, loop.length);
    smoothShoulderHeights(positions, snowWeights, base, loop.length);
    // An open chain must not be closed: its wrap quad spanned the island.
    const quads = closed ? loop.length : loop.length - 1;
    for (let index = 0; index < quads; index++) {
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
  geometry.setAttribute('aSnow', new THREE.Float32BufferAttribute(snowWeights, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The skirt samples a sand albedo; on snow coasts that tinted the ice beige.
 * `aSnow` swaps the texel for its luminance (keeping the grain), so the
 * vertex palette alone decides the colour, and makes the ice a little glossier.
 */
function attachSnowShelfShading(material: THREE.MeshStandardMaterial): void {
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSnow;\nvarying float vSnow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vSnow = aSnow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSnow;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  float catanxSnowGrain = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9 + 0.22 * (catanxSnowGrain - 0.5)), vSnow);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.42, vSnow * 0.7);',
      );
  };
  const baseKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${baseKey()}:snow-shelf-v1`;
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
    attachSnowShelfShading(result);
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

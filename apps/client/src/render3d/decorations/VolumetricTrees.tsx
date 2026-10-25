import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { normalizeSeason } from '../utils/seasonVisuals';
import type { DecorInstance } from './deterministicDecoration';
import { attachFoliageTranslucency } from './foliageTranslucency';
import { treeSpeciesForTerrain } from './InstancedTrees';
import type { GroundClearings } from './BladeField';
import { treeBlocksView } from './treeClearings';

/**
 * Volumetric trees.
 *
 * The previous trees were photographs on crossed vertical cards. From the
 * game camera, which looks down at 40–60°, a crossed card is a thin X: forests
 * read as a field of dark slivers and nothing cast a believable shadow (a cone
 * proxy did that job). They were also ten times the height of a house.
 *
 * These are built like real-time foliage in production engines: a bark trunk
 * plus many alpha-cut cards cut from the same photographs
 * (`tools/build_foliage_atlas.py`). Conifers are stacked tiers of drooping
 * branch sprays; broadleaves are a crown of leaf clusters on an ellipsoid.
 * Normals are bent outwards from the crown so the whole tree shades as one
 * volume, the cards cast cut-out shadows, and the crown sways with the wind.
 */

type Archetype = 'spruce' | 'pine' | 'oak' | 'beech';

const ATLAS_URL = '/assets/textures/vegetation/foliage_atlas_v1.png';
const INSET = 0.012;

/** Atlas rectangles: [u0, v0, u1, v1] with v up (texture is flipped). */
const BRANCH_CELLS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0.5, 0.5, 1],
  [0.5, 0.5, 1, 1],
];
const CLUSTER_CELLS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0.25, 0.5],
  [0.25, 0, 0.5, 0.5],
  [0.5, 0, 0.75, 0.5],
  [0.75, 0, 1, 0.5],
];

class CardBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly heights: number[] = [];
  /** One random value per card: drives seasonal colour and leaf fall. */
  readonly cards: number[] = [];
  private cardIndex = 0;

  quad(
    corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
    uvs: readonly [
      readonly [number, number],
      readonly [number, number],
      readonly [number, number],
      readonly [number, number],
    ],
    normalFor: (p: THREE.Vector3) => THREE.Vector3,
  ) {
    const order = [0, 1, 2, 0, 2, 3];
    const card = (Math.sin(++this.cardIndex * 91.345 + 7.13) * 43758.5453) % 1;
    for (const i of order) {
      this.cards.push(Math.abs(card));
      const p = corners[i]!;
      const n = normalFor(p);
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      this.uvs.push(uvs[i]![0], uvs[i]![1]);
      this.heights.push(p.y);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(this.heights, 1));
    geometry.setAttribute('aCard', new THREE.Float32BufferAttribute(this.cards, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

function inset(cell: readonly [number, number, number, number]) {
  return [cell[0] + INSET, cell[1] + INSET, cell[2] - INSET, cell[3] - INSET] as const;
}

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822519);
    s = Math.imul(s ^ (s >>> 13), 3266489917);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

/** Normal bent away from the trunk axis: the crown shades as one volume. */
function crownNormal(center: THREE.Vector3, lift: number) {
  return (p: THREE.Vector3) =>
    new THREE.Vector3(p.x - center.x, p.y - center.y + lift, p.z - center.z).normalize();
}

/**
 * Conifer: tiers of branch sprays radiating from the trunk, drooping at the
 * tips, widest near the bottom. Unit height; the crown starts at `crownBase`.
 */
function buildConifer(
  seed: number,
  crownBase: number,
  maxRadius: number,
  tiers: number,
): THREE.BufferGeometry {
  const r = rand(seed);
  const builder = new CardBuilder();
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const y = crownBase + t * (0.97 - crownBase);
    const radius = maxRadius * Math.pow(1 - t, 0.85) + 0.035;
    const cards = Math.max(3, Math.round(6 - t * 3));
    const offset = tier * 0.9 + r() * 0.6;
    for (let k = 0; k < cards; k++) {
      const angle = offset + (k / cards) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const across = new THREE.Vector3(-dir.z, 0, dir.x);
      const roll = (k % 2 === 0 ? 1 : -1) * (0.35 + r() * 0.25);
      const side = across
        .clone()
        .multiplyScalar(Math.cos(roll))
        .add(new THREE.Vector3(0, Math.sin(roll), 0));
      const length = radius * (1.05 + r() * 0.25);
      const width = Math.max(0.06, length * 0.62);
      const droop = length * (0.28 + r() * 0.12);
      const base = new THREE.Vector3(dir.x * 0.012, y + droop * 0.15, dir.z * 0.012);
      const tip = new THREE.Vector3(dir.x * length, y - droop, dir.z * length);
      const half = side.clone().multiplyScalar(width / 2);
      const cell = inset(BRANCH_CELLS[(tier + k) % BRANCH_CELLS.length]!);
      builder.quad(
        [
          base.clone().sub(half),
          tip.clone().sub(half),
          tip.clone().add(half),
          base.clone().add(half),
        ],
        [
          [cell[0], cell[1]],
          [cell[2], cell[1]],
          [cell[2], cell[3]],
          [cell[0], cell[3]],
        ],
        crownNormal(new THREE.Vector3(0, y + 0.05, 0), 0.35),
      );
    }
  }
  // Leader: two crossed sprays standing up at the apex.
  for (let k = 0; k < 2; k++) {
    const angle = k * Math.PI * 0.5 + 0.3;
    const across = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(0.045);
    const base = new THREE.Vector3(0, 0.86, 0);
    const top = new THREE.Vector3(0, 1.02, 0);
    const cell = inset(BRANCH_CELLS[k]!);
    builder.quad(
      [
        base.clone().sub(across),
        top.clone().sub(across),
        top.clone().add(across),
        base.clone().add(across),
      ],
      [
        [cell[0], cell[1]],
        [cell[2], cell[1]],
        [cell[2], cell[3]],
        [cell[0], cell[3]],
      ],
      () => new THREE.Vector3(0, 1, 0),
    );
  }
  return builder.build();
}

/** Broadleaf: leaf clusters scattered over an ellipsoidal crown. */
function buildBroadleaf(
  seed: number,
  center: number,
  radii: THREE.Vector3,
  clusters: number,
  size: number,
): THREE.BufferGeometry {
  const r = rand(seed);
  const builder = new CardBuilder();
  const crownCenter = new THREE.Vector3(0, center, 0);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < clusters; i++) {
    // Fibonacci sphere, skipping the very bottom where nothing is seen.
    const yUnit = 1 - (i / (clusters - 1)) * 1.7;
    const ring = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
    const theta = i * golden + r() * 0.5;
    const dir = new THREE.Vector3(
      Math.cos(theta) * ring,
      yUnit,
      Math.sin(theta) * ring,
    ).normalize();
    const depth = 0.72 + r() * 0.3;
    const centerPoint = new THREE.Vector3(
      dir.x * radii.x * depth,
      center + dir.y * radii.y * depth,
      dir.z * radii.z * depth,
    );
    // Card faces outward, rolled randomly about its own normal.
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(up, dir).normalize();
    const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();
    const roll = r() * Math.PI * 2;
    const a = tangent
      .clone()
      .multiplyScalar(Math.cos(roll))
      .add(bitangent.clone().multiplyScalar(Math.sin(roll)));
    const b = new THREE.Vector3().crossVectors(dir, a).normalize();
    const s = size * (0.8 + r() * 0.45);
    const ha = a.multiplyScalar(s / 2);
    const hb = b.multiplyScalar(s / 2);
    const cell = inset(CLUSTER_CELLS[Math.floor(r() * CLUSTER_CELLS.length)]!);
    builder.quad(
      [
        centerPoint.clone().sub(ha).sub(hb),
        centerPoint.clone().add(ha).sub(hb),
        centerPoint.clone().add(ha).add(hb),
        centerPoint.clone().sub(ha).add(hb),
      ],
      [
        [cell[0], cell[1]],
        [cell[2], cell[1]],
        [cell[2], cell[3]],
        [cell[0], cell[3]],
      ],
      crownNormal(crownCenter, 0.25),
    );
  }
  return builder.build();
}

function buildTrunk(height: number, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius * 0.55, radius, height, 7, 1, true);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

interface ArchetypeShape {
  foliage: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
}

function buildArchetypes(): Record<Archetype, ArchetypeShape> {
  return {
    spruce: { foliage: buildConifer(11, 0.16, 0.3, 8), trunk: buildTrunk(0.7, 0.032) },
    pine: { foliage: buildConifer(23, 0.5, 0.24, 6), trunk: buildTrunk(0.86, 0.028) },
    oak: {
      foliage: buildBroadleaf(37, 0.62, new THREE.Vector3(0.4, 0.3, 0.4), 30, 0.34),
      trunk: buildTrunk(0.6, 0.045),
    },
    beech: {
      foliage: buildBroadleaf(53, 0.66, new THREE.Vector3(0.3, 0.36, 0.3), 28, 0.3),
      trunk: buildTrunk(0.62, 0.038),
    },
  };
}

const SPECIES_TO_ARCHETYPE = {
  spruce: 'spruce',
  pine: 'pine',
  deciduous: 'oak',
  beech: 'beech',
} as const satisfies Record<string, Archetype>;

interface TreePlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  height: number;
  tint: THREE.Color;
}

/** World height of a tree before per-item scale. Houses stand ~0.09. */
const TREE_HEIGHT: Record<Archetype, number> = {
  spruce: 0.46,
  pine: 0.44,
  oak: 0.36,
  beech: 0.42,
};

/** Broadleaf colour now comes from the per-card seasonal shader. */
const SEASON_TINT: Record<string, { conifer: string; broadleaf: string }> = {
  spring: { conifer: '#e6f0d8', broadleaf: '#ffffff' },
  summer: { conifer: '#ffffff', broadleaf: '#f4ffe8' },
  autumn: { conifer: '#e8e2c4', broadleaf: '#ffffff' },
  winter: { conifer: '#c9d0c6', broadleaf: '#ffffff' },
};

function buildPlacements(
  items: readonly DecorInstance[],
  tilesById: Map<string, HexTile>,
  sampleHeight: (x: number, z: number) => number,
  clearings: GroundClearings | null = null,
): Record<Archetype, TreePlacement[]> {
  const out: Record<Archetype, TreePlacement[]> = { spruce: [], pine: [], oak: [], beech: [] };
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const tile = tilesById.get(item.tileId);
    if (!tile) continue;
    const archetype = SPECIES_TO_ARCHETYPE[treeSpeciesForTerrain(tile.terrain, item.variant)];
    const origin = cubeToWorld(tile.coord);
    const forest = tile.terrain === 'forest' || tile.terrain === 'jungle';
    const r = rand(index * 7919 + item.variant * 104729 + 17);
    // Smaller trees need a denser stand to keep the canopy closed.
    const copies = forest ? 3 : 1;
    for (let copy = 0; copy < copies; copy++) {
      const angle = r() * Math.PI * 2;
      const distance = copy === 0 ? 0 : 0.07 + r() * 0.12;
      const x = origin.x + item.x + Math.cos(angle) * distance;
      const z = origin.z + item.z + Math.sin(angle) * distance;
      const shade = 0.82 + r() * 0.32;
      const yaw = r() * Math.PI * 2;
      const height = TREE_HEIGHT[archetype] * item.scale * (0.72 + r() * 0.5);
      const tint = new THREE.Color(shade * (0.96 + r() * 0.08), shade, shade * (0.9 + r() * 0.12));
      // Random draws come first so a clearing never reshuffles the rest of the forest.
      if (treeBlocksView(x, z, clearings)) continue;
      out[archetype].push({ x, z, y: sampleHeight(x, z) - 0.01, yaw, height, tint });
    }
  }
  return out;
}

const FOLIAGE_VERTEX_HEAD = /* glsl */ `
attribute float aHeight;
attribute float aCard;
uniform float uTreeTime;
uniform float uTreeWind;
varying float vCard;
varying float vTreeHash;
varying float vUp;
`;

/**
 * Seasonal foliage. A single global tint made every season the same forest in
 * a different filter; here each leaf card and each tree gets its own fate:
 * blossom or fresh leaves in spring, a gold/orange/red/rust mosaic and the first
 * gaps in autumn, bare crowns and snow resting on upward-facing sprays in
 * winter. Shared by the colour pass and the shadow pass so bare trees also
 * cast bare shadows.
 */
type FoliageKind = 'conifer' | 'broadleaf';

const SEASON_FRAGMENT_HEAD = /* glsl */ `
varying float vCard;
varying float vTreeHash;
varying float vUp;
float catanxHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
`;

/** Fraction of leaf cards that have fallen, by season and foliage kind. */
function leafFall(kind: FoliageKind, season: string): number {
  if (kind === 'conifer') return 0;
  if (season === 'winter') return 0.8;
  if (season === 'autumn') return 0.16;
  return 0;
}

function seasonDiscard(kind: FoliageKind, season: string): string {
  const fall = leafFall(kind, season);
  if (fall <= 0) return '';
  // Per tree variation: some trees hold their leaves a little longer.
  return `
  float catanxFall = ${fall.toFixed(3)} + (vTreeHash - 0.5) * 0.18;
  if (catanxHash(vCard * 61.7 + vTreeHash * 13.1) < catanxFall) discard;`;
}

function seasonColour(kind: FoliageKind, season: string): string {
  // Leaf photographs are green; luminance keeps their structure under recolouring.
  const lum = `float catanxLeaf = clamp(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) * 2.4, 0.25, 1.35);`;
  if (kind === 'broadleaf' && season === 'autumn') {
    return `${lum}
  float catanxPick = catanxHash(vCard * 17.3 + vTreeHash * 5.7);
  vec3 catanxAutumn = catanxPick < 0.24 ? vec3(0.86, 0.55, 0.12)
    : catanxPick < 0.48 ? vec3(0.83, 0.33, 0.09)
    : catanxPick < 0.66 ? vec3(0.66, 0.14, 0.08)
    : catanxPick < 0.84 ? vec3(0.52, 0.26, 0.1)
    : vec3(0.58, 0.58, 0.18);
  diffuseColor.rgb = catanxAutumn * catanxLeaf;`;
  }
  if (kind === 'broadleaf' && season === 'spring') {
    return `${lum}
  if (vTreeHash < 0.34) {
    // Blossoming orchard trees: pink and white petals over a few young leaves.
    float catanxPetal = catanxHash(vCard * 23.9 + vTreeHash);
    vec3 catanxBloom = catanxPetal < 0.45 ? vec3(0.98, 0.72, 0.8)
      : catanxPetal < 0.82 ? vec3(0.99, 0.93, 0.93)
      : vec3(0.62, 0.8, 0.38);
    diffuseColor.rgb = catanxBloom * clamp(catanxLeaf * 0.9 + 0.25, 0.5, 1.25);
  } else {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.82, 0.3) * catanxLeaf, 0.55);
  }`;
  }
  if (season === 'winter') {
    const snowBase =
      kind === 'broadleaf'
        ? // Bare twigs: what is left of the crown reads as brown branches.
          `diffuseColor.rgb = vec3(0.36, 0.29, 0.22) * clamp(dot(diffuseColor.rgb, vec3(0.333)) * 2.6, 0.4, 1.2);`
        : `diffuseColor.rgb *= vec3(0.86, 0.94, 0.9);`;
    return `${snowBase}
  float catanxSnow = smoothstep(${kind === 'broadleaf' ? '0.05, 0.45' : '0.0, 0.5'}, vUp + (catanxHash(vCard * 7.7) - 0.5) * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), catanxSnow * ${kind === 'broadleaf' ? '0.8' : '0.72'});`;
  }
  if (kind === 'conifer' && season === 'spring') {
    // Fresh light-green shoots on the outer sprays.
    return `diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.3, 0.85), smoothstep(0.2, 0.8, vUp) * 0.5);`;
  }
  return '';
}

const FOLIAGE_VERTEX_BODY = /* glsl */ `
#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 catanxTreeRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 catanxTreeRoot = vec3(0.0);
#endif
float catanxSway = sin(uTreeTime * 0.9 + catanxTreeRoot.x * 1.7 + catanxTreeRoot.z * 1.3)
  + 0.35 * sin(uTreeTime * 2.3 + catanxTreeRoot.x * 4.1);
float catanxReach = aHeight * aHeight * uTreeWind;
transformed.x += catanxSway * catanxReach;
transformed.z += catanxSway * catanxReach * 0.5;
vCard = aCard;
vTreeHash = fract(sin(dot(catanxTreeRoot.xz, vec2(12.9898, 78.233))) * 43758.5453);
#ifdef USE_INSTANCING
  vUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
#else
  vUp = normalize(mat3(modelMatrix) * objectNormal).y;
#endif
`;

function createFoliageMaterial(
  map: THREE.Texture,
  cacheKey: string,
  color: THREE.Color,
  kind: FoliageKind,
  season: string,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    color,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: season === 'winter' ? 0.78 : 0.86,
    metalness: 0,
  });
  const uniforms = { uTreeTime: { value: 0 }, uTreeWind: { value: 0.03 } };
  material.userData.treeUniforms = uniforms;
  attachFoliageTranslucency(material, { transmission: season === 'winter' ? 0.35 : 0.75 });
  const previous = material.onBeforeCompile;
  const colour = seasonColour(kind, season);
  const discard = seasonDiscard(kind, season);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOLIAGE_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', FOLIAGE_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEASON_FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${discard}\n  ${colour}`)
      // Cards are double-sided: keep the crown normal on the back face.
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n  normal = normalize( vNormal );',
      );
  };
  const previousKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${previousKey}|${cacheKey}|season-v1:${kind}:${season}`;
  return material;
}

/** Shadow caster that drops the same fallen cards as the colour pass. */
function createFoliageDepthMaterial(
  map: THREE.Texture,
  kind: FoliageKind,
  season: string,
): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
  });
  const discard = seasonDiscard(kind, season);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeTime = { value: 0 };
    shader.uniforms.uTreeWind = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOLIAGE_VERTEX_HEAD}`)
      .replace(
        '#include <begin_vertex>',
        `vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n${FOLIAGE_VERTEX_BODY}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEASON_FRAGMENT_HEAD}`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n${discard}`);
  };
  material.customProgramCacheKey = () => `catanx-foliage-depth-v1:${kind}:${season}`;
  return material;
}

function TreeLayer({
  shape,
  placements,
  foliage,
  depth,
  bark,
}: {
  shape: ArchetypeShape;
  placements: readonly TreePlacement[];
  foliage: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  bark: THREE.MeshStandardMaterial;
}) {
  const foliageRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const crown = foliageRef.current;
    const trunk = trunkRef.current;
    if (!crown || !trunk) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.setScalar(p.height);
      dummy.updateMatrix();
      crown.setMatrixAt(i, dummy.matrix);
      trunk.setMatrixAt(i, dummy.matrix);
      crown.setColorAt(i, p.tint);
    }
    for (const mesh of [crown, trunk]) {
      mesh.count = placements.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  }, [placements]);

  if (placements.length === 0) return null;
  return (
    <group>
      <instancedMesh
        key={`trunk:${placements.length}`}
        ref={trunkRef}
        args={[shape.trunk, undefined, placements.length]}
        material={bark}
        castShadow
        receiveShadow
        raycast={() => undefined}
      />
      <instancedMesh
        key={`crown:${placements.length}`}
        ref={foliageRef}
        args={[shape.foliage, undefined, placements.length]}
        material={foliage}
        customDepthMaterial={depth}
        castShadow
        receiveShadow
        raycast={() => undefined}
      />
    </group>
  );
}

interface VolumetricTreesProps {
  items: readonly DecorInstance[];
  tilesById: Map<string, HexTile>;
  season?: string;
  /** Building plots and roads that trees must leave visible. */
  clearings?: GroundClearings | null;
}

export function VolumetricTrees({ items, tilesById, season = 'summer', clearings = null }: VolumetricTreesProps) {
  const surface = useSurfaceHeight();
  const ambient = useAmbientAnimation();
  const atlas = useTexture(ATLAS_URL);
  const seasonKey = normalizeSeason(season);

  useEffect(() => {
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 8;
    atlas.needsUpdate = true;
  }, [atlas]);

  const shapes = useMemo(buildArchetypes, []);
  useEffect(
    () => () => {
      for (const shape of Object.values(shapes)) {
        shape.foliage.dispose();
        shape.trunk.dispose();
      }
    },
    [shapes],
  );

  // The clearings object is rebuilt on every game action; only a real change
  // (a new building or road) should re-place the forest.
  const clearingsKey = clearings
    ? clearings.points.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)},${p.r}`).join(';') +
      '|' +
      clearings.segments.map((s) => `${s.ax.toFixed(3)},${s.az.toFixed(3)},${s.bx.toFixed(3)},${s.bz.toFixed(3)}`).join(';')
    : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableClearings = useMemo(() => clearings, [clearingsKey]);
  const placements = useMemo(
    () => buildPlacements(items, tilesById, (x, z) => surface.sampleHeight(x, z), stableClearings),
    [items, stableClearings, surface, tilesById],
  );

  const materials = useMemo(() => {
    const tint = SEASON_TINT[seasonKey] ?? SEASON_TINT.summer!;
    // Photographic foliage is dark; lift it so the canopy is green, not black.
    const conifer = new THREE.Color(tint.conifer).multiplyScalar(1.35);
    const broadleaf = new THREE.Color(tint.broadleaf).multiplyScalar(1.12);
    return {
      conifer: createFoliageMaterial(
        atlas,
        'catanx-volumetric-conifer-v1',
        conifer,
        'conifer',
        seasonKey,
      ),
      broadleaf: createFoliageMaterial(
        atlas,
        'catanx-volumetric-broadleaf-v1',
        broadleaf,
        'broadleaf',
        seasonKey,
      ),
      coniferDepth: createFoliageDepthMaterial(atlas, 'conifer', seasonKey),
      broadleafDepth: createFoliageDepthMaterial(atlas, 'broadleaf', seasonKey),
      bark: new THREE.MeshStandardMaterial({
        color: seasonKey === 'winter' ? '#5a4a3e' : '#6a5341',
        roughness: 0.95,
        metalness: 0,
      }),
    };
  }, [atlas, seasonKey]);
  useEffect(
    () => () => {
      materials.conifer.dispose();
      materials.broadleaf.dispose();
      materials.coniferDepth.dispose();
      materials.broadleafDepth.dispose();
      materials.bark.dispose();
    },
    [materials],
  );

  useFrame(() => {
    const time = ambient.enabled ? ambient.time : 0;
    const wind = 0.02 + ambient.windStrength * 0.025;
    for (const material of [materials.conifer, materials.broadleaf]) {
      const uniforms = material.userData.treeUniforms as {
        uTreeTime: { value: number };
        uTreeWind: { value: number };
      };
      uniforms.uTreeTime.value = time;
      uniforms.uTreeWind.value = wind;
    }
  });

  return (
    <group>
      <TreeLayer
        shape={shapes.spruce}
        placements={placements.spruce}
        foliage={materials.conifer}
        depth={materials.coniferDepth}
        bark={materials.bark}
      />
      <TreeLayer
        shape={shapes.pine}
        placements={placements.pine}
        foliage={materials.conifer}
        depth={materials.coniferDepth}
        bark={materials.bark}
      />
      <TreeLayer
        shape={shapes.oak}
        placements={placements.oak}
        foliage={materials.broadleaf}
        depth={materials.broadleafDepth}
        bark={materials.bark}
      />
      <TreeLayer
        shape={shapes.beech}
        placements={placements.beech}
        foliage={materials.broadleaf}
        depth={materials.broadleafDepth}
        bark={materials.bark}
      />
    </group>
  );
}

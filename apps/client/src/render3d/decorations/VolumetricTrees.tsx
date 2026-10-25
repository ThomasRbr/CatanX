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

  quad(
    corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
    uvs: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]],
    normalFor: (p: THREE.Vector3) => THREE.Vector3,
  ) {
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) {
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
    new THREE.Vector3(p.x - center.x, (p.y - center.y) + lift, p.z - center.z).normalize();
}

/**
 * Conifer: tiers of branch sprays radiating from the trunk, drooping at the
 * tips, widest near the bottom. Unit height; the crown starts at `crownBase`.
 */
function buildConifer(seed: number, crownBase: number, maxRadius: number, tiers: number): THREE.BufferGeometry {
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
      const side = across.clone().multiplyScalar(Math.cos(roll)).add(new THREE.Vector3(0, Math.sin(roll), 0));
      const length = radius * (1.05 + r() * 0.25);
      const width = Math.max(0.06, length * 0.62);
      const droop = length * (0.28 + r() * 0.12);
      const base = new THREE.Vector3(dir.x * 0.012, y + droop * 0.15, dir.z * 0.012);
      const tip = new THREE.Vector3(dir.x * length, y - droop, dir.z * length);
      const half = side.clone().multiplyScalar(width / 2);
      const cell = inset(BRANCH_CELLS[(tier + k) % BRANCH_CELLS.length]!);
      builder.quad(
        [base.clone().sub(half), tip.clone().sub(half), tip.clone().add(half), base.clone().add(half)],
        [[cell[0], cell[1]], [cell[2], cell[1]], [cell[2], cell[3]], [cell[0], cell[3]]],
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
      [base.clone().sub(across), top.clone().sub(across), top.clone().add(across), base.clone().add(across)],
      [[cell[0], cell[1]], [cell[2], cell[1]], [cell[2], cell[3]], [cell[0], cell[3]]],
      () => new THREE.Vector3(0, 1, 0),
    );
  }
  return builder.build();
}

/** Broadleaf: leaf clusters scattered over an ellipsoidal crown. */
function buildBroadleaf(seed: number, center: number, radii: THREE.Vector3, clusters: number, size: number): THREE.BufferGeometry {
  const r = rand(seed);
  const builder = new CardBuilder();
  const crownCenter = new THREE.Vector3(0, center, 0);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < clusters; i++) {
    // Fibonacci sphere, skipping the very bottom where nothing is seen.
    const yUnit = 1 - (i / (clusters - 1)) * 1.7;
    const ring = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
    const theta = i * golden + r() * 0.5;
    const dir = new THREE.Vector3(Math.cos(theta) * ring, yUnit, Math.sin(theta) * ring).normalize();
    const depth = 0.72 + r() * 0.3;
    const centerPoint = new THREE.Vector3(dir.x * radii.x * depth, center + dir.y * radii.y * depth, dir.z * radii.z * depth);
    // Card faces outward, rolled randomly about its own normal.
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(up, dir).normalize();
    const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();
    const roll = r() * Math.PI * 2;
    const a = tangent.clone().multiplyScalar(Math.cos(roll)).add(bitangent.clone().multiplyScalar(Math.sin(roll)));
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
      [[cell[0], cell[1]], [cell[2], cell[1]], [cell[2], cell[3]], [cell[0], cell[3]]],
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

const SEASON_TINT: Record<string, { conifer: string; broadleaf: string }> = {
  spring: { conifer: '#e6f0d8', broadleaf: '#f2ffd6' },
  summer: { conifer: '#ffffff', broadleaf: '#ffffff' },
  autumn: { conifer: '#e8e2c4', broadleaf: '#ffb45c' },
  winter: { conifer: '#c9d0c6', broadleaf: '#bdb4a2' },
};

function buildPlacements(
  items: readonly DecorInstance[],
  tilesById: Map<string, HexTile>,
  sampleHeight: (x: number, z: number) => number,
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
      out[archetype].push({
        x,
        z,
        y: sampleHeight(x, z) - 0.01,
        yaw: r() * Math.PI * 2,
        height: TREE_HEIGHT[archetype] * item.scale * (0.72 + r() * 0.5),
        tint: new THREE.Color(shade * (0.96 + r() * 0.08), shade, shade * (0.9 + r() * 0.12)),
      });
    }
  }
  return out;
}

const FOLIAGE_VERTEX_HEAD = /* glsl */ `
attribute float aHeight;
uniform float uTreeTime;
uniform float uTreeWind;
`;

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
`;

function createFoliageMaterial(map: THREE.Texture, cacheKey: string, color: THREE.Color): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    color,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.86,
    metalness: 0,
  });
  const uniforms = { uTreeTime: { value: 0 }, uTreeWind: { value: 0.03 } };
  material.userData.treeUniforms = uniforms;
  attachFoliageTranslucency(material, { transmission: 0.75 });
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOLIAGE_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', FOLIAGE_VERTEX_BODY);
    // Cards are double-sided: keep the crown normal on the back face.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n  normal = normalize( vNormal );',
    );
  };
  const previousKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${previousKey}|${cacheKey}`;
  return material;
}

function TreeLayer({
  shape,
  placements,
  foliage,
  bark,
}: {
  shape: ArchetypeShape;
  placements: readonly TreePlacement[];
  foliage: THREE.MeshStandardMaterial;
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
        args={[shape.trunk, bark, placements.length]}
        castShadow
        receiveShadow
        raycast={() => undefined}
      />
      <instancedMesh
        key={`crown:${placements.length}`}
        ref={foliageRef}
        args={[shape.foliage, foliage, placements.length]}
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
}

export function VolumetricTrees({ items, tilesById, season = 'summer' }: VolumetricTreesProps) {
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

  const placements = useMemo(
    () => buildPlacements(items, tilesById, (x, z) => surface.sampleHeight(x, z)),
    [items, surface, tilesById],
  );

  const materials = useMemo(() => {
    const tint = SEASON_TINT[seasonKey] ?? SEASON_TINT.summer!;
    // Photographic foliage is dark; lift it so the canopy is green, not black.
    const conifer = new THREE.Color(tint.conifer).multiplyScalar(1.35);
    const broadleaf = new THREE.Color(tint.broadleaf).multiplyScalar(1.12);
    return {
      conifer: createFoliageMaterial(atlas, 'catanx-volumetric-conifer-v1', conifer),
      broadleaf: createFoliageMaterial(atlas, 'catanx-volumetric-broadleaf-v1', broadleaf),
      bark: new THREE.MeshStandardMaterial({ color: '#6a5341', roughness: 0.95, metalness: 0 }),
    };
  }, [atlas, seasonKey]);
  useEffect(
    () => () => {
      materials.conifer.dispose();
      materials.broadleaf.dispose();
      materials.bark.dispose();
    },
    [materials],
  );

  useFrame(() => {
    const time = ambient.enabled ? ambient.time : 0;
    const wind = 0.02 + ambient.windStrength * 0.025;
    for (const material of [materials.conifer, materials.broadleaf]) {
      const uniforms = material.userData.treeUniforms as { uTreeTime: { value: number }; uTreeWind: { value: number } };
      uniforms.uTreeTime.value = time;
      uniforms.uTreeWind.value = wind;
    }
  });

  return (
    <group>
      <TreeLayer shape={shapes.spruce} placements={placements.spruce} foliage={materials.conifer} bark={materials.bark} />
      <TreeLayer shape={shapes.pine} placements={placements.pine} foliage={materials.conifer} bark={materials.bark} />
      <TreeLayer shape={shapes.oak} placements={placements.oak} foliage={materials.broadleaf} bark={materials.bark} />
      <TreeLayer shape={shapes.beech} placements={placements.beech} foliage={materials.broadleaf} bark={materials.bark} />
    </group>
  );
}

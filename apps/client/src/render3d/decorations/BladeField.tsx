import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { HexTile, TerrainType } from '@catanx/engine';
import * as THREE from 'three';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { normalizeSeason } from '../utils/seasonVisuals';
import { visualRngFor } from '../utils/seededVisualRandom';

/**
 * Real geometry for grass and cereal.
 *
 * The ground used to be dressed with photographed cards: top-down lawn quads
 * lying flat and alpha-cut tufts standing up. From the game camera the flat
 * ones read as a camouflage pattern of dark blotches and the standing ones as
 * paper cut-outs. This replaces both with thousands of instanced clumps of
 * thin tapered blades — no texture, no alpha test — coloured from a dark root
 * to a sunlit tip and swayed by the shared wind. At board scale the result is
 * a soft, directional carpet that catches the key light like a real meadow,
 * and close up it resolves into individual blades.
 *
 * Wheat uses the same machinery with stalks topped by an ear, planted in
 * furrows so a field reads as a crop from across the island.
 */

type FieldKind = 'meadow' | 'wheat';

/**
 * Ground that must stay bare: house plots and road beds. Rasterised into a
 * small world-space mask the blade shader reads, so placing a village only
 * rewrites a texture — the tens of thousands of instances never rebuild.
 */
export interface GroundClearings {
  points: ReadonlyArray<{ x: number; z: number; r: number }>;
  segments: ReadonlyArray<{ ax: number; az: number; bx: number; bz: number; r: number }>;
}

const CLEAR_TEXELS_PER_UNIT = 16;

interface ClearMask {
  texture: THREE.DataTexture;
  origin: THREE.Vector2;
  invSize: THREE.Vector2;
  minX: number;
  minZ: number;
  width: number;
  height: number;
}

function createClearMask(tiles: readonly HexTile[]): ClearMask {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const tile of tiles) {
    const o = cubeToWorld(tile.coord);
    minX = Math.min(minX, o.x);
    maxX = Math.max(maxX, o.x);
    minZ = Math.min(minZ, o.z);
    maxZ = Math.max(maxZ, o.z);
  }
  if (!Number.isFinite(minX)) minX = maxX = minZ = maxZ = 0;
  minX -= 1.2;
  minZ -= 1.2;
  maxX += 1.2;
  maxZ += 1.2;
  const width = Math.min(512, Math.ceil((maxX - minX) * CLEAR_TEXELS_PER_UNIT));
  const height = Math.min(512, Math.ceil((maxZ - minZ) * CLEAR_TEXELS_PER_UNIT));
  const texture = new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return {
    texture,
    origin: new THREE.Vector2(minX, minZ),
    invSize: new THREE.Vector2(1 / (maxX - minX), 1 / (maxZ - minZ)),
    minX,
    minZ,
    width,
    height,
  };
}

function rasteriseClearings(mask: ClearMask, clearings: GroundClearings | null): void {
  const data = mask.texture.image.data as Uint8Array;
  data.fill(0);
  if (clearings) {
    const texel = 1 / CLEAR_TEXELS_PER_UNIT;
    const stamp = (x0: number, z0: number, x1: number, z1: number, coverage: (x: number, z: number) => number) => {
      const ix0 = Math.max(0, Math.floor((x0 - mask.minX) / texel));
      const ix1 = Math.min(mask.width - 1, Math.ceil((x1 - mask.minX) / texel));
      const iz0 = Math.max(0, Math.floor((z0 - mask.minZ) / texel));
      const iz1 = Math.min(mask.height - 1, Math.ceil((z1 - mask.minZ) / texel));
      for (let iz = iz0; iz <= iz1; iz++) {
        const z = mask.minZ + (iz + 0.5) * texel;
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = mask.minX + (ix + 0.5) * texel;
          const value = Math.round(coverage(x, z) * 255);
          const index = iz * mask.width + ix;
          if (value > data[index]!) data[index] = value;
        }
      }
    };
    for (const p of clearings.points) {
      const outer = p.r * 1.35;
      stamp(p.x - outer, p.z - outer, p.x + outer, p.z + outer, (x, z) => {
        const d = Math.hypot(x - p.x, z - p.z);
        return 1 - THREE.MathUtils.smoothstep(d, p.r, outer);
      });
    }
    for (const seg of clearings.segments) {
      const outer = seg.r * 1.5;
      const abx = seg.bx - seg.ax;
      const abz = seg.bz - seg.az;
      const lengthSq = Math.max(1e-8, abx * abx + abz * abz);
      stamp(
        Math.min(seg.ax, seg.bx) - outer,
        Math.min(seg.az, seg.bz) - outer,
        Math.max(seg.ax, seg.bx) + outer,
        Math.max(seg.az, seg.bz) + outer,
        (x, z) => {
          const t = THREE.MathUtils.clamp(((x - seg.ax) * abx + (z - seg.az) * abz) / lengthSq, 0, 1);
          const d = Math.hypot(x - (seg.ax + abx * t), z - (seg.az + abz * t));
          return 1 - THREE.MathUtils.smoothstep(d, seg.r, outer);
        },
      );
    }
  }
  mask.texture.needsUpdate = true;
}

interface BiomeBladeSpec {
  /** Clumps per tile at vegetationDensity 1. */
  clumps: number;
  height: [number, number];
  /** Root and tip colours, linear-ish sRGB hex. */
  root: string;
  tip: string;
  /** Share of clumps drawn from the dry palette. */
  dryShare: number;
}

const MEADOW_SPECS: Partial<Record<TerrainType, BiomeBladeSpec>> = {
  pasture: { clumps: 2400, height: [0.034, 0.062], root: '#3d6420', tip: '#b5d062', dryShare: 0.12 },
  forest: { clumps: 650, height: [0.028, 0.05], root: '#2d4a1a', tip: '#86a446', dryShare: 0.18 },
  jungle: { clumps: 1100, height: [0.034, 0.064], root: '#2b5418', tip: '#8dbb48', dryShare: 0.06 },
  tundra: { clumps: 900, height: [0.022, 0.04], root: '#5a5a38', tip: '#c4bb88', dryShare: 0.6 },
  hill: { clumps: 420, height: [0.024, 0.044], root: '#5b5a2a', tip: '#c2b464', dryShare: 0.55 },
  swamp: { clumps: 900, height: [0.04, 0.075], root: '#36481e', tip: '#93a050', dryShare: 0.25 },
};

const WHEAT_SPEC: BiomeBladeSpec = {
  clumps: 2500,
  height: [0.075, 0.1],
  root: '#6a4812',
  tip: '#eec259',
  dryShare: 0.08,
};

const DRY_ROOT = '#6e6232';
const DRY_TIP = '#d7c68a';

const SEASON_TIP_SHIFT: Record<string, { meadow: string; wheat: string; scale: number }> = {
  spring: { meadow: '#c2dc6c', wheat: '#d9c463', scale: 1 },
  summer: { meadow: '#b5d062', wheat: '#eec259', scale: 1 },
  // Meadow and wheat must stay distinct in every season: olive pasture next
  // to amber grain in autumn, frosted green next to golden stubble in winter.
  autumn: { meadow: '#a7b558', wheat: '#e3a03c', scale: 0.92 },
  winter: { meadow: '#a8b88e', wheat: '#c9a25c', scale: 0.62 },
};

interface Clump {
  x: number;
  y: number;
  z: number;
  yaw: number;
  height: number;
  root: THREE.Color;
  tip: THREE.Color;
}

function hexEdge(x: number, z: number): number {
  return Math.max(Math.abs(x) * 0.8660254 + Math.abs(z) * 0.5, Math.abs(z));
}

/** One clump: five blades fanned out, each a single tapered triangle. */
function createMeadowClumpGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const along: number[] = [];
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + (b % 2) * 0.4;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    // Authored in height-relative units: the clump is scaled uniformly by its
    // world height, so a 5 cm tuft has 4 mm blades leaning ~1.5 cm.
    const ox = dx * 0.14;
    const oz = dz * 0.14;
    const lean = 0.22 + (b % 3) * 0.14;
    const width = 0.075 + (b % 2) * 0.02;
    const h = 0.72 + (b % 3) * 0.14;
    // Base edge perpendicular to the lean direction.
    const px = -dz * width;
    const pz = dx * width;
    positions.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + dx * lean * h, h, oz + dz * lean * h);
    // Normals lean upwards: grass lit like a surface, not like paper cards.
    for (let v = 0; v < 3; v++) normals.push(dx * 0.35, 0.92, dz * 0.35);
    along.push(0, 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** One wheat clump: four stalks, each a thin stem with a two-triangle ear. */
function createWheatClumpGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const along: number[] = [];
  const stalks = 4;
  for (let s = 0; s < stalks; s++) {
    const angle = (s / stalks) * Math.PI * 2 + 0.5;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const ox = dx * 0.1;
    const oz = dz * 0.1;
    const lean = 0.06 + (s % 2) * 0.06;
    const h = 0.82 + (s % 3) * 0.09;
    const stemW = 0.028;
    const px = -dz;
    const pz = dx;
    const earBase = h * 0.62;
    const tx = ox + dx * lean * h;
    const tz = oz + dz * lean * h;
    const ex = ox + dx * lean * earBase;
    const ez = oz + dz * lean * earBase;
    const push = (x: number, y: number, z: number, t: number) => {
      positions.push(x, y, z);
      normals.push(dx * 0.3, 0.94, dz * 0.3);
      along.push(t);
    };
    // Stem.
    push(ox - px * stemW, 0, oz - pz * stemW, 0);
    push(ox + px * stemW, 0, oz + pz * stemW, 0);
    push(ex, earBase, ez, 0.7);
    // Ear: a slim diamond, widest a third of the way up.
    const earW = 0.042;
    const mid = earBase + (h - earBase) * 0.38;
    const mx = ox + dx * lean * mid;
    const mz = oz + dz * lean * mid;
    push(ex, earBase, ez, 0.86);
    push(mx + px * earW, mid, mz + pz * earW, 0.95);
    push(tx, h, tz, 1);
    push(ex, earBase, ez, 0.86);
    push(tx, h, tz, 1);
    push(mx - px * earW, mid, mz - pz * earW, 0.95);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function buildClumps(
  kind: FieldKind,
  tiles: readonly HexTile[],
  mapSeed: number,
  density: number,
  season: string,
  sampleHeight: (x: number, z: number) => number,
): Clump[] {
  const out: Clump[] = [];
  const shift = SEASON_TIP_SHIFT[season] ?? SEASON_TIP_SHIFT.summer!;
  const dryRoot = new THREE.Color(DRY_ROOT);
  const dryTip = new THREE.Color(DRY_TIP);
  for (const tile of tiles) {
    const spec = kind === 'wheat' ? (tile.terrain === 'plains' ? WHEAT_SPEC : null) : MEADOW_SPECS[tile.terrain];
    if (!spec) continue;
    const rng = visualRngFor(mapSeed, tile.id, `blades-${kind}-v1`);
    const origin = cubeToWorld(tile.coord);
    const hasChit = typeof tile.diceValue === 'number';
    const root = new THREE.Color(spec.root);
    const tip = new THREE.Color(kind === 'wheat' ? shift.wheat : spec === MEADOW_SPECS.pasture ? shift.meadow : spec.tip);
    if (kind === 'meadow' && spec !== MEADOW_SPECS.pasture) tip.lerp(new THREE.Color(shift.meadow), 0.25);
    const target = Math.round(spec.clumps * density);
    // Furrows: each field gets its own row direction.
    const rowAngle = rng() * Math.PI;
    const rowCos = Math.cos(rowAngle);
    const rowSin = Math.sin(rowAngle);
    const rowSpacing = 0.075;
    let accepted = 0;
    for (let attempt = 0; attempt < target * 3 && accepted < target; attempt++) {
      let lx = (rng() * 2 - 1) * 1.0;
      let lz = (rng() * 2 - 1) * 1.0;
      if (kind === 'wheat') {
        // Snap across-row coordinate to the furrow, keep a little scatter.
        const acrossRaw = -lx * rowSin + lz * rowCos;
        const alongRaw = lx * rowCos + lz * rowSin;
        const across = Math.round(acrossRaw / rowSpacing) * rowSpacing + (rng() - 0.5) * rowSpacing * 0.55;
        lx = alongRaw * rowCos - across * rowSin;
        lz = alongRaw * rowSin + across * rowCos;
      }
      const edge = hexEdge(lx, lz);
      if (edge > 1.0) continue;
      // Feather the outer rim so neighbouring biomes interleave.
      if (edge > 0.86 && rng() < (edge - 0.86) / 0.14) continue;
      const r2 = lx * lx + lz * lz;
      if (hasChit && r2 < (kind === 'wheat' ? 0.3 * 0.3 : 0.22 * 0.22)) continue;
      const x = origin.x + lx;
      const z = origin.z + lz;
      const dry = rng() < spec.dryShare;
      const shade = 0.86 + rng() * 0.28;
      const clumpRoot = (dry ? dryRoot : root).clone().multiplyScalar(shade);
      const clumpTip = (dry ? dryTip : tip).clone().multiplyScalar(0.9 + rng() * 0.2);
      out.push({
        x,
        y: sampleHeight(x, z) - 0.002,
        z,
        yaw: rng() * Math.PI * 2,
        // Winter fields keep a short stubble so plains still read as plains.
        height: (spec.height[0] + rng() * (spec.height[1] - spec.height[0])) * shift.scale * (kind === 'wheat' && season === 'winter' ? 0.6 : 1),
        root: clumpRoot,
        tip: clumpTip,
      });
      accepted++;
    }
  }
  return out;
}

const BLADE_VERTEX_HEAD = /* glsl */ `
attribute float aAlong;
attribute vec3 aTip;
uniform float uTime;
uniform float uWind;
uniform sampler2D uClearMask;
uniform vec2 uClearOrigin;
uniform vec2 uClearInvSize;
varying float vAlong;
varying vec3 vTipColor;
`;

const BLADE_VERTEX_BODY = /* glsl */ `
#include <begin_vertex>
vAlong = aAlong;
vTipColor = aTip;
#ifdef USE_INSTANCING
  vec3 catanxRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 catanxRoot = vec3(0.0);
#endif
// Gusts travel across the island; the tip moves, the root stays put.
float catanxGust = sin(uTime * 1.6 + catanxRoot.x * 2.3 + catanxRoot.z * 1.7)
  + 0.5 * sin(uTime * 2.9 + catanxRoot.x * 5.1 - catanxRoot.z * 3.7);
float catanxBend = aAlong * aAlong * uWind * (0.6 + 0.4 * catanxGust);
// Bare ground under houses and roads: the clump collapses to nothing.
float catanxClear = texture2D(uClearMask, (catanxRoot.xz - uClearOrigin) * uClearInvSize).r;
transformed *= 1.0 - catanxClear;
transformed.x += catanxBend * 0.9;
transformed.z += catanxBend * 0.45;
transformed.y -= catanxBend * 0.25;
`;

const BLADE_FRAGMENT_HEAD = /* glsl */ `
varying float vAlong;
varying vec3 vTipColor;
`;

const BLADE_FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
// instanceColor holds the root colour; the tip colour rides on aTip.
float catanxT = smoothstep(0.0, 1.0, vAlong);
diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, vTipColor, catanxT);
`;

function createBladeMaterial(cacheKey: string, clear: ClearMask): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.2 },
    uClearMask: { value: clear.texture },
    uClearOrigin: { value: clear.origin },
    uClearInvSize: { value: clear.invSize },
  };
  material.userData.bladeUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${BLADE_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', BLADE_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BLADE_FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', BLADE_FRAGMENT_COLOR)
      // Double-sided blades must not flip their up-leaning normal on the back
      // face, or half the meadow renders in shadow.
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n  normal = normalize( vNormal );`);
  };
  material.customProgramCacheKey = () => cacheKey;
  return material;
}

interface BladeFieldProps {
  kind: FieldKind;
  tiles: readonly HexTile[];
  mapSeed: number;
  season?: string;
  clearings?: GroundClearings | null;
}

export function BladeField({ kind, tiles, mapSeed, season = 'summer', clearings = null }: BladeFieldProps) {
  const quality = useRenderQuality();
  const surface = useSurfaceHeight();
  const ambient = useAmbientAnimation();
  const seasonKey = normalizeSeason(season);
  const density = quality.vegetationDensity * (quality.id === 'low' ? 0.6 : 1);

  const clumps = useMemo(
    () =>
      buildClumps(kind, tiles, mapSeed, density, seasonKey, (x, z) => surface.sampleHeight(x, z)),
    [density, kind, mapSeed, seasonKey, surface, tiles],
  );

  const geometry = useMemo(() => {
    const base = kind === 'wheat' ? createWheatClumpGeometry() : createMeadowClumpGeometry();
    const tips = new Float32Array(Math.max(1, clumps.length) * 3);
    clumps.forEach((clump, i) => {
      tips[i * 3] = clump.tip.r;
      tips[i * 3 + 1] = clump.tip.g;
      tips[i * 3 + 2] = clump.tip.b;
    });
    base.setAttribute('aTip', new THREE.InstancedBufferAttribute(tips, 3));
    return base;
  }, [clumps, kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const clearMask = useMemo(() => createClearMask(tiles), [tiles]);
  useEffect(() => () => clearMask.texture.dispose(), [clearMask]);
  useEffect(() => rasteriseClearings(clearMask, clearings), [clearMask, clearings]);

  const material = useMemo(() => createBladeMaterial(`catanx-blades-${kind}-v1`, clearMask), [clearMask, kind]);
  useEffect(() => () => material.dispose(), [material]);

  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < clumps.length; i++) {
      const clump = clumps[i]!;
      dummy.position.set(clump.x, clump.y, clump.z);
      dummy.rotation.set(0, clump.yaw, 0);
      dummy.scale.set(clump.height * 1.15, clump.height, clump.height * 1.15);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, clump.root);
    }
    mesh.count = clumps.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [clumps, geometry]);

  useFrame(() => {
    const uniforms = material.userData.bladeUniforms as { uTime: { value: number }; uWind: { value: number } };
    uniforms.uTime.value = ambient.enabled ? ambient.time : 0;
    // Local units: the bend is a fraction of the blade's own height.
    uniforms.uWind.value = (kind === 'wheat' ? 0.2 : 0.26) * (0.6 + ambient.windStrength);
  });

  if (clumps.length === 0) return null;
  return (
    <instancedMesh
      key={`${kind}:${clumps.length}`}
      ref={ref}
      args={[geometry, undefined, clumps.length]}
        material={material}
      castShadow={false}
      receiveShadow
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}

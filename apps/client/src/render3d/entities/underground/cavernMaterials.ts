/**
 * Shared materials and generated textures of the underground layer.
 *
 * One small set of materials for the whole layer: every rock, beam and crystal
 * shares a program, so the layer costs a handful of shader variants no matter
 * how many chambers are revealed.
 */
import * as THREE from 'three';
import { CavernGlowField, patchCavernMaterial } from './cavernGlow';
import { createCavernNoise } from './cavernNoise';
import type { KitSlot } from './chamberKits';

export interface CavernTextures {
  albedo: THREE.Texture | null;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
}

export interface CavernMaterials {
  /** Cave terrain: world-projected rock scan + vertex colour + glow + seams. */
  rock: THREE.MeshStandardMaterial;
  /** Rock props (stalagmites, columns, rubble). */
  stone: THREE.MeshStandardMaterial;
  /** Timber, clay, bone, cloth: anything matte. */
  prop: THREE.MeshStandardMaterial;
  /** Rails, drills, ore: shiny. */
  metal: THREE.MeshStandardMaterial;
  /** Self-lit parts; emissive = vertex × instance colour (HDR, blooms). */
  glow: THREE.MeshStandardMaterial;
  /** Same as `glow`, pulsed by the layer clock (danger). */
  hazard: THREE.MeshStandardMaterial;
  /** Soft additive sprites (dots, motes, pools), instance-coloured. */
  additive: THREE.MeshBasicMaterial;
  /** Light shafts. */
  beam: THREE.MeshBasicMaterial;
  /** Far magma glow under the cave block. */
  abyss: THREE.MeshBasicMaterial;
  /** Unlit HDR vertex colour (lava seams). */
  emissiveBasic: THREE.MeshBasicMaterial;
  /** Soft additive strip along a path (tunnel glow), instance-coloured. */
  ribbon: THREE.MeshBasicMaterial;
  dispose(): void;
}

function makeDataTexture(
  width: number,
  height: number,
  fill: (u: number, v: number) => [number, number, number, number],
  srgb = false,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill((x + 0.5) / width, (y + 0.5) / height);
      const o = (y * width + x) * 4;
      data[o] = Math.round(THREE.MathUtils.clamp(r, 0, 1) * 255);
      data[o + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 1) * 255);
      data[o + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 1) * 255);
      data[o + 3] = Math.round(THREE.MathUtils.clamp(a, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

let radialTexture: THREE.DataTexture | null = null;
export function getRadialTexture(): THREE.DataTexture {
  radialTexture ??= makeDataTexture(64, 64, (u, v) => {
    const d = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    const a = Math.pow(1 - d, 2.2);
    return [1, 1, 1, a];
  });
  return radialTexture;
}

let beamTexture: THREE.DataTexture | null = null;
function getBeamTexture(): THREE.DataTexture {
  beamTexture ??= makeDataTexture(32, 128, (u, v) => {
    const edge = Math.pow(Math.sin(u * Math.PI), 2.4);
    // v = 0 at the floor, 1 at the ceiling crack.
    const along = Math.pow(v, 0.8) * (1 - Math.pow(Math.max(0, v - 0.9) / 0.1, 2)) * Math.min(1, v * 6 + 0.25);
    return [1, 1, 1, edge * along];
  });
  return beamTexture;
}

let stripTexture: THREE.DataTexture | null = null;
function getStripTexture(): THREE.DataTexture {
  // Soft across the strip (v), constant along it (u).
  stripTexture ??= makeDataTexture(8, 64, (_u, v) => [1, 1, 1, Math.pow(Math.sin(v * Math.PI), 2.2)]);
  return stripTexture;
}

let abyssTexture: THREE.DataTexture | null = null;
function getAbyssTexture(): THREE.DataTexture {
  if (abyssTexture) return abyssTexture;
  const noise = createCavernNoise(0xab155);
  const cells: Array<[number, number]> = [];
  const rand = (i: number) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < 120; i++) cells.push([rand(i), rand(i + 100)]);
  abyssTexture = makeDataTexture(
    256,
    256,
    (u, v) => {
      // Voronoi crack network: distance between the two nearest seeds.
      const wu = u + 0.03 * noise.n2(u * 9, v * 9);
      const wv = v + 0.03 * noise.n2(u * 9 + 5, v * 9);
      let d1 = 9;
      let d2 = 9;
      for (const [cx, cy] of cells) {
        const d = Math.hypot(wu - cx, wv - cy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const crack = Math.pow(Math.max(0, 1 - (d2 - d1) / 0.012), 2);
      const glow = Math.pow(Math.max(0, 1 - (d2 - d1) / 0.06), 2);
      const r = Math.hypot(u - 0.5, v - 0.5) * 2.4;
      const vignette = Math.pow(Math.max(0, 1 - r), 1.8);
      // Far below and mostly hidden: a faint ember network, never a light source.
      const k = (crack * 0.18 + glow * 0.12 + 0.05) * vignette;
      return [k, k * 0.32, k * 0.09, 1];
    },
    true,
  );
  return abyssTexture;
}

export function createCavernMaterials(
  field: CavernGlowField,
  textures: CavernTextures,
): CavernMaterials {
  const rock = patchCavernMaterial(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      map: textures.albedo,
      normalMap: textures.normal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: textures.roughness,
      roughness: 0.96,
      metalness: 0.02,
      envMapIntensity: 0.5,
    }),
    { glow: field, worldUvScale: 0.62, vertexEmissive: true },
  );
  rock.name = 'cavern-rock';

  const stone = patchCavernMaterial(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.55,
    }),
    { glow: field },
  );
  stone.name = 'cavern-stone';

  const prop = patchCavernMaterial(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.04,
      envMapIntensity: 0.6,
    }),
    { glow: field },
  );
  prop.name = 'cavern-prop';

  const metal = patchCavernMaterial(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.34,
      metalness: 0.72,
      envMapIntensity: 1.1,
    }),
    { glow: field },
  );
  metal.name = 'cavern-metal';

  const makeGlow = (name: string) => {
    const material = patchCavernMaterial(
      new THREE.MeshStandardMaterial({
        color: '#2a2a2a',
        vertexColors: true,
        emissive: '#ffffff',
        emissiveIntensity: 1,
        roughness: 0.22,
        metalness: 0.05,
        envMapIntensity: 0.8,
      }),
      { emissiveFromColor: true },
    );
    material.name = name;
    return material;
  };
  const glow = makeGlow('cavern-glow');
  const hazard = makeGlow('cavern-hazard');

  const additive = new THREE.MeshBasicMaterial({
    map: getRadialTexture(),
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  additive.name = 'cavern-additive';

  const beam = new THREE.MeshBasicMaterial({
    map: getBeamTexture(),
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  beam.name = 'cavern-beam';

  const abyss = new THREE.MeshBasicMaterial({
    map: getAbyssTexture(),
    color: '#ffffff',
    toneMapped: false,
  });
  abyss.name = 'cavern-abyss';

  const emissiveBasic = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false });
  emissiveBasic.name = 'cavern-emissive';

  const ribbon = new THREE.MeshBasicMaterial({
    map: getStripTexture(),
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  ribbon.name = 'cavern-ribbon';

  const all = [rock, stone, prop, metal, glow, hazard, additive, beam, abyss, emissiveBasic, ribbon];
  return {
    rock,
    stone,
    prop,
    metal,
    glow,
    hazard,
    additive,
    beam,
    abyss,
    emissiveBasic,
    ribbon,
    dispose() {
      // Shared generated textures stay cached; authored maps belong to the cache too.
      for (const material of all) material.dispose();
    },
  };
}

/** Material used by each kit slot. */
export function slotMaterial(slot: KitSlot, materials: CavernMaterials): THREE.Material {
  switch (slot) {
    case 'stone':
      return materials.stone;
    case 'metal':
      return materials.metal;
    case 'glow':
    case 'spin':
    case 'ownerGlow':
      return materials.glow;
    case 'hazard':
      return materials.hazard;
    case 'body':
    case 'owner':
    default:
      return materials.prop;
  }
}

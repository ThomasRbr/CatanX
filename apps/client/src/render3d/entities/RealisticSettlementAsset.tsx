import { useEffect, useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useMapLod } from '../camera/MapLodContext';
import { useRenderQuality } from '../quality/RenderQualityContext';

interface RealisticSettlementAssetProps {
  castShadow: boolean;
  urban?: boolean;
  scale?: number;
  season?: string;
  /**
   * Owner colour for the roofs. Catan pieces are read by colour first; a
   * pennant on a grey-roofed hamlet was not enough to tell players apart.
   */
  roofColor?: string | null;
}

/** Player colour → a believable roof: same hue, tamed saturation, mid value. */
export function roofTintFor(color: string): THREE.Color {
  const tint = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  tint.getHSL(hsl);
  tint.setHSL(hsl.h, Math.min(hsl.s, 0.85) * 0.92, THREE.MathUtils.clamp(hsl.l, 0.3, 0.6));
  return tint;
}

const URLS = {
  settlement: [
    '/assets/models/realistic/realistic_settlement_lod0.glb?v=surface-r21',
    '/assets/models/realistic/realistic_settlement_lod1.glb?v=surface-r21',
    '/assets/models/realistic/realistic_settlement_lod2.glb?v=surface-r21',
  ],
  city: [
    '/assets/models/realistic/realistic_city_lod0.glb?v=surface-r21',
    '/assets/models/realistic/realistic_city_lod1.glb?v=surface-r21',
    '/assets/models/realistic/realistic_city_lod2.glb?v=surface-r21',
  ],
} as const;

const AO_ATLAS_URLS = {
  settlement: [
    '/assets/models/realistic/realistic_settlement_lod0_ao.png?v=ao-r8',
    '/assets/models/realistic/realistic_settlement_lod1_ao.png?v=ao-r8',
    '/assets/models/realistic/realistic_settlement_lod1_ao.png?v=ao-r8',
  ],
  city: [
    '/assets/models/realistic/realistic_city_lod0_ao.png?v=ao-r8',
    '/assets/models/realistic/realistic_city_lod1_ao.png?v=ao-r8',
    '/assets/models/realistic/realistic_city_lod1_ao.png?v=ao-r8',
  ],
} as const;

/**
 * Downscaled by `tools/build_prop_textures.py`.
 *
 * A settlement covers 40-80 px at the gameplay camera, and its material repeats
 * 2.15 times across the model, so a 2048² map is sampled four mip levels deep —
 * every one of those texels is averaged away before it becomes a pixel. Loading
 * them lazily also meant twenty full-size maps uploaded in the single frame
 * that placed the first village: 2.1 s inside `texSubImage2D`.
 */
const BUILDING_TEXTURE_URLS = [
  '/assets/textures/buildings/photoreal/aged_plaster_albedo_v1_s512.webp',
  '/assets/textures/buildings/photoreal/weathered_timber_albedo_v1_s512.webp',
  '/assets/textures/buildings/photoreal/slate_roof_albedo_v1_s512.webp',
  '/assets/textures/buildings/photoreal/rubble_stone_albedo_v2_s512.webp',
  '/assets/textures/buildings/photoreal/aged_plaster_normal_v1_s512.webp',
  '/assets/textures/buildings/photoreal/weathered_timber_normal_v1_s512.webp',
  '/assets/textures/buildings/photoreal/weathered_roof_normal_v1_s512.webp',
  '/assets/textures/buildings/photoreal/rubble_stone_normal_v2_s512.webp',
  '/assets/textures/buildings/photoreal/aged_plaster_roughness_v1_s256.webp',
  '/assets/textures/buildings/photoreal/weathered_timber_roughness_v1_s256.webp',
  '/assets/textures/buildings/photoreal/weathered_roof_roughness_v1_s256.webp',
  '/assets/textures/buildings/photoreal/rubble_stone_roughness_v2_s256.webp',
  '/assets/textures/buildings/photoreal/aged_plaster_ao_v1_s256.webp',
  '/assets/textures/buildings/photoreal/weathered_timber_ao_v1_s256.webp',
  '/assets/textures/buildings/photoreal/weathered_roof_ao_v1_s256.webp',
  '/assets/textures/buildings/photoreal/rubble_stone_ao_v2_s256.webp',
  '/assets/textures/buildings/photoreal/aged_plaster_height_v1_s256.webp',
  '/assets/textures/buildings/photoreal/weathered_timber_height_v1_s256.webp',
  '/assets/textures/buildings/photoreal/weathered_roof_height_v1_s256.webp',
  '/assets/textures/buildings/photoreal/rubble_stone_height_v2_s256.webp',
] as const;

interface BuildingMaterialSet {
  plaster: THREE.MeshPhysicalMaterial;
  plasterWarm: THREE.MeshPhysicalMaterial;
  stone: THREE.MeshPhysicalMaterial;
  stoneLight: THREE.MeshPhysicalMaterial;
  timber: THREE.MeshPhysicalMaterial;
  timberLight: THREE.MeshPhysicalMaterial;
  roof: THREE.MeshPhysicalMaterial;
  roofAlt: THREE.MeshPhysicalMaterial;
  roofSnow: THREE.MeshPhysicalMaterial;
  earth: THREE.MeshPhysicalMaterial;
  window: THREE.MeshPhysicalMaterial;
  metal: THREE.MeshPhysicalMaterial;
}

interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
  bumpMap: THREE.Texture;
}

function physical(
  name: string,
  color: THREE.ColorRepresentation,
  roughness: number,
  envMapIntensity: number,
  maps: PbrMaps,
  normalStrength: number,
  bumpScale: number,
  aoIntensity: number,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    name,
    color,
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: maps.roughnessMap,
    aoMap: maps.aoMap,
    aoMapIntensity: aoIntensity,
    bumpMap: maps.bumpMap,
    bumpScale,
    roughness,
    metalness: 0,
    envMapIntensity,
    clearcoat: 0,
    clearcoatRoughness: 1,
  });
}

function configureAlbedo(texture: THREE.Texture, repeat: number): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 12;
  // Slightly darken bright source albedos so ACES sun doesn't bleach façades.
  texture.needsUpdate = true;
  return texture;
}

function configureLinear(texture: THREE.Texture, repeat: number): THREE.Texture {
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 12;
  texture.needsUpdate = true;
  return texture;
}

function createBuildingMaterials(
  plasterMap: THREE.Texture,
  timberMap: THREE.Texture,
  roofMap: THREE.Texture,
  stoneMap: THREE.Texture,
  plasterNormalMap: THREE.Texture,
  timberNormalMap: THREE.Texture,
  roofNormalMap: THREE.Texture,
  stoneNormalMap: THREE.Texture,
  plasterRoughnessMap: THREE.Texture,
  timberRoughnessMap: THREE.Texture,
  roofRoughnessMap: THREE.Texture,
  stoneRoughnessMap: THREE.Texture,
  plasterAoMap: THREE.Texture,
  timberAoMap: THREE.Texture,
  roofAoMap: THREE.Texture,
  stoneAoMap: THREE.Texture,
  plasterHeightMap: THREE.Texture,
  timberHeightMap: THREE.Texture,
  roofHeightMap: THREE.Texture,
  stoneHeightMap: THREE.Texture,
): BuildingMaterialSet {
  const plaster: PbrMaps = {
    map: configureAlbedo(plasterMap, 1.35),
    normalMap: configureLinear(plasterNormalMap, 1.35),
    roughnessMap: configureLinear(plasterRoughnessMap, 1.35),
    aoMap: configureLinear(plasterAoMap, 1.35),
    bumpMap: configureLinear(plasterHeightMap, 1.35),
  };
  const timber: PbrMaps = {
    map: configureAlbedo(timberMap, 1.6),
    normalMap: configureLinear(timberNormalMap, 1.6),
    roughnessMap: configureLinear(timberRoughnessMap, 1.6),
    aoMap: configureLinear(timberAoMap, 1.6),
    bumpMap: configureLinear(timberHeightMap, 1.6),
  };
  const roof: PbrMaps = {
    map: configureAlbedo(roofMap, 1.45),
    normalMap: configureLinear(roofNormalMap, 1.45),
    roughnessMap: configureLinear(roofRoughnessMap, 1.45),
    aoMap: configureLinear(roofAoMap, 1.45),
    bumpMap: configureLinear(roofHeightMap, 1.45),
  };
  const stone: PbrMaps = {
    map: configureAlbedo(stoneMap, 2.15),
    normalMap: configureLinear(stoneNormalMap, 2.15),
    roughnessMap: configureLinear(stoneRoughnessMap, 2.15),
    aoMap: configureLinear(stoneAoMap, 2.15),
    bumpMap: configureLinear(stoneHeightMap, 2.15),
  };

  // Settlements are the thing the player looks for on the board, so they have
  // to hold their own against the terrain rather than sink into it.
  //
  // Every colour here multiplies an already-dark photographic albedo. At
  // #3a4048 a slate roof linearises to about 0.04 — the product was effectively
  // black, and a settlement dropped into a forest simply disappeared. These are
  // mid tones now, with the environment intensity roughly tripled so the sky
  // actually reaches the walls.
  return {
    plaster: physical('cx_real_plaster_photographic', '#d9c49a', 0.95, 0.85, plaster, 0.32, 0.014, 0.38),
    plasterWarm: physical('cx_real_plaster_warm_photographic', '#cdb18a', 0.95, 0.82, plaster, 0.3, 0.014, 0.36),
    stone: physical('cx_real_stone_photographic', '#b3aca1', 0.95, 0.8, stone, 0.5, 0.024, 0.38),
    stoneLight: physical('cx_real_stone_light_photographic', '#c4bcb0', 0.94, 0.8, stone, 0.45, 0.022, 0.34),
    timber: physical('cx_real_timber_photographic', '#8d6a4e', 0.94, 0.72, timber, 0.36, 0.018, 0.38),
    timberLight: physical('cx_real_timber_light_photographic', '#a37e5c', 0.93, 0.74, timber, 0.32, 0.016, 0.36),
    // Weathered slate reads mid-grey in daylight, not near-black.
    roof: physical('cx_real_roof_photographic', '#7b8894', 0.95, 0.7, roof, 0.55, 0.02, 0.38),
    roofAlt: physical('cx_real_roof_alt_photographic', '#6f7c88', 0.95, 0.68, roof, 0.52, 0.018, 0.36),
    roofSnow: physical('cx_real_roof_snow', '#e6ecea', 0.88, 0.8, roof, 0.12, 0.008, 0.3),
    earth: physical('cx_real_earth_calibrated', '#8e7a5f', 0.97, 0.7, stone, 0.22, 0.012, 0.34),
    window: new THREE.MeshPhysicalMaterial({
      name: 'cx_real_window_warm',
      color: '#6a4730',
      emissive: '#e0893a',
      emissiveIntensity: 0.28,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.22,
    }),
    metal: new THREE.MeshPhysicalMaterial({
      name: 'cx_real_architectural_metal',
      color: '#3a3834',
      roughness: 0.72,
      metalness: 0.35,
      envMapIntensity: 0.4,
    }),
  };
}

function materialForName(material: THREE.Material, materials: BuildingMaterialSet): THREE.Material {
  const name = material.name.toLowerCase();
  if (name.includes('window') || name.includes('glass')) return materials.window;
  if (name.includes('metal')) return materials.metal;
  if (name.includes('roof_alt')) return materials.roofAlt;
  if (name.includes('roof')) return materials.roof;
  if (name.includes('timber_light')) return materials.timberLight;
  if (name.includes('timber') || name.includes('door')) return materials.timber;
  if (name.includes('plaster_warm')) return materials.plasterWarm;
  if (name.includes('stone_light')) return materials.stoneLight;
  if (name.includes('stone')) return materials.stone;
  if (name.includes('earth') || name.includes('moss')) return materials.earth;
  return materials.plaster;
}

function ensureAoUv(geometry: THREE.BufferGeometry): void {
  // TEXCOORD_0 = tiling (maps), TEXCOORD_1 = bake atlas (AO/cavity).
  const bakeUv = geometry.getAttribute('uv1') ?? geometry.getAttribute('uv');
  if (bakeUv) {
    geometry.setAttribute('uv2', bakeUv);
  }
  if (geometry.getAttribute('normal') && geometry.getAttribute('uv') && !geometry.getAttribute('tangent')) {
    try {
      geometry.computeTangents();
    } catch {
      // Non-indexed or degenerate meshes can fail; keep vertex normals only.
    }
  }
}

function selectLod(
  mapLod: number,
  quality: ReturnType<typeof useRenderQuality>['id'],
): 0 | 1 | 2 {
  if (quality === 'low') return 2;
  if (mapLod >= 2) return 2;
  if (quality === 'balanced' || mapLod === 1) return 1;
  return 0;
}

export function RealisticSettlementAsset({
  castShadow,
  urban = false,
  scale = 1,
  season = 'summer',
  roofColor = null,
}: RealisticSettlementAssetProps) {
  const mapLod = useMapLod();
  const quality = useRenderQuality();
  const lod = selectLod(mapLod, quality.id);
  const kind = urban ? 'city' : 'settlement';
  const { scene } = useGLTF(URLS[kind][lod]);
  const bakedAo = useTexture(AO_ATLAS_URLS[kind][lod]) as THREE.Texture;
  const [
    plasterMap,
    timberMap,
    roofMap,
    stoneMap,
    plasterNormalMap,
    timberNormalMap,
    roofNormalMap,
    stoneNormalMap,
    plasterRoughnessMap,
    timberRoughnessMap,
    roofRoughnessMap,
    stoneRoughnessMap,
    plasterAoMap,
    timberAoMap,
    roofAoMap,
    stoneAoMap,
    plasterHeightMap,
    timberHeightMap,
    roofHeightMap,
    stoneHeightMap,
  ] =
    useTexture([...BUILDING_TEXTURE_URLS]) as THREE.Texture[];
  const materials = useMemo(() => {
    const set = createBuildingMaterials(
      plasterMap,
      timberMap,
      roofMap,
      stoneMap,
      plasterNormalMap,
      timberNormalMap,
      roofNormalMap,
      stoneNormalMap,
      plasterRoughnessMap,
      timberRoughnessMap,
      roofRoughnessMap,
      stoneRoughnessMap,
      plasterAoMap,
      timberAoMap,
      roofAoMap,
      stoneAoMap,
      plasterHeightMap,
      timberHeightMap,
      roofHeightMap,
      stoneHeightMap,
    );

    const atlasMeanLuma = (texture: THREE.Texture, threshold: number): boolean => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx || !texture.image) return true;
        ctx.drawImage(texture.image as CanvasImageSource, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i]!;
        return sum / (data.length / 4) > threshold;
      } catch {
        return true;
      }
    };

    // UV0 = tiling photoreal maps (ochre plaster / slate). UV1/uv2 = AO cavity atlas.
    bakedAo.colorSpace = THREE.NoColorSpace;
    bakedAo.wrapS = THREE.ClampToEdgeWrapping;
    bakedAo.wrapT = THREE.ClampToEdgeWrapping;
    bakedAo.repeat.set(1, 1);
    bakedAo.anisotropy = 8;
    bakedAo.needsUpdate = true;
    if (lod <= 1 && atlasMeanLuma(bakedAo, 80)) {
      for (const material of Object.values(set)) {
        if (!(material instanceof THREE.MeshPhysicalMaterial)) continue;
        if (material.name.includes('window') || material.name.includes('metal')) continue;
        material.aoMap = bakedAo;
        material.aoMapIntensity = 0.55;
        material.needsUpdate = true;
      }
    }
    // The old "safety" here clamped plaster and stone to 0.32/0.26/0.2 linear
    // and the roofs' environment light to 0.15: every house came out the
    // colour of wet cardboard. The post chain's tone mapping handles bright
    // façades now; only the clear coat stays off.
    for (const material of Object.values(set)) {
      if (!(material instanceof THREE.MeshPhysicalMaterial)) continue;
      if (material.name.includes('window') || material.name.includes('metal') || material.name.includes('snow')) continue;
      material.clearcoat = 0;
      material.envMapIntensity = Math.min(material.envMapIntensity, 0.6);
      if (material.name.includes('roof')) {
        material.roughness = Math.max(material.roughness, 0.9);
        material.metalness = 0;
        if (roofColor) {
          // The slate albedo is dark grey; lift the tint so the owner colour
          // survives the multiply.
          const tint = roofTintFor(roofColor);
          if (material.name.includes('alt')) tint.multiplyScalar(0.86);
          material.color.copy(tint).multiplyScalar(1.6);
        }
      }
      material.needsUpdate = true;
    }
    return set;
  }, [
    bakedAo,
    lod,
    plasterAoMap, plasterHeightMap, plasterMap, plasterNormalMap, plasterRoughnessMap,
    roofAoMap, roofHeightMap, roofMap, roofNormalMap, roofRoughnessMap,
    stoneAoMap, stoneHeightMap, stoneMap, stoneNormalMap, stoneRoughnessMap,
    timberAoMap, timberHeightMap, timberMap, timberNormalMap, timberRoughnessMap,
    roofColor,
  ]);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    const snowRoofs: Array<{ parent: THREE.Object3D; roof: THREE.Mesh }> = [];
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      ensureAoUv(child.geometry);
      const sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      const sourceName = sourceMaterial?.name.toLowerCase() ?? '';
      child.castShadow = castShadow;
      child.receiveShadow = true;
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => materialForName(material, materials))
        : materialForName(child.material, materials);
      child.raycast = () => undefined;
      if (season === 'winter' && sourceName.includes('roof') && child.parent) {
        snowRoofs.push({ parent: child.parent, roof: child });
      }
    });
    for (const { parent, roof } of snowRoofs) {
      const overlay = roof.clone(false);
      overlay.name = `${roof.name}_snow_cap`;
      overlay.material = materials.roofSnow;
      overlay.position.y += 0.006;
      overlay.scale.multiplyScalar(1.012);
      overlay.castShadow = false;
      overlay.receiveShadow = true;
      overlay.raycast = () => undefined;
      parent.add(overlay);
    }
    return clone;
  }, [castShadow, materials, scene, season]);

  useEffect(() => {
    object.updateMatrixWorld(true);
  }, [object]);

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  const normalization = urban ? 0.78 : 0.82;
  return (
    <group scale={[scale * normalization, scale * normalization, scale * normalization]}>
      <primitive object={object} />
    </group>
  );
}

export const REALISTIC_SETTLEMENT_URLS = [...URLS.settlement, ...URLS.city];

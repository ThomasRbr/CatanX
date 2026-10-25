import { useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createBarrelGeometry,
  createBridgeGeometry,
  createCampfireGeometry,
  createCivAwningGeometry,
  createCivColumnGeometry,
  createCrateGeometry,
  createDarkPineGeometry,
  createDirtRoadGeometry,
  createFenceGeometry,
  createIceBlockGeometry,
  createLavaPoolGeometry,
  createLavaRockGeometry,
  createMarshPoolGeometry,
  createMeltPoolGeometry,
  createMineEntranceGeometry,
  createPalmAGeometry,
  createPalmBGeometry,
  createPavedRoadGeometry,
  createReedClumpGeometry,
  createRuinArchGeometry,
  createRuinWallGeometry,
  createSnowPatchGeometry,
  createTowerGeometry,
  createVolcanoConeGeometry,
  createWarehouseGeometry,
  createWellGeometry,
  getPremiumGeometry,
  PREMIUM_MODEL_IDS,
  type PremiumModelId,
} from './meshCatalog';
import {
  BOARD_PRELOAD_URLS,
  resolveFallbackModelId,
  resolveVisualAssetUrl,
} from './visualAssetManifest';

const geometryCache = new Map<string, THREE.BufferGeometry>();
const BAKE_VERSION = 'h3-v4-pine-green';

/** Remonte le feuillage des pins GLB vers un vert sapin (évite le noir sous ACES). */
function liftPineFoliageColor(color: THREE.Color): void {
  // Tronc / bois : laisser tel quel
  if (color.r >= color.g * 0.92) return;
  const target = new THREE.Color('#2f6e48');
  color.lerp(target, 0.42);
  color.g = Math.min(1, Math.max(color.g, 0.4));
  color.r = Math.min(color.r, color.g * 0.7);
  color.b = Math.min(color.b, color.g * 0.75);
}

function bakeMeshGeometry(mesh: THREE.Mesh, liftPine = false): THREE.BufferGeometry {
  // Preserve indexed topology and authored vertex normals. The former bake
  // expanded every triangle, which made even high-resolution GLBs read as
  // low-poly toys after normals were recomputed.
  const geo = mesh.geometry.clone();
  if (!geo.index) {
    const count = geo.getAttribute('position').count;
    geo.setIndex(Array.from({ length: count }, (_, index) => index));
  }
  mesh.updateWorldMatrix(true, false);
  geo.applyMatrix4(mesh.matrixWorld);

  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const writeColor = (start: number, count: number, materialIndex: number) => {
    const color = new THREE.Color('#ffffff');
    const sample = materials[materialIndex] ?? materials[0];
    if (sample && 'color' in sample && sample.color instanceof THREE.Color) {
      color.copy(sample.color);
    }
    if (liftPine) liftPineFoliageColor(color);
    const writeVertex = (vertexIndex: number) => {
      const n = 0.94 + ((vertexIndex * 17) % 11) * 0.005;
      colors[vertexIndex * 3] = Math.min(1, color.r * n);
      colors[vertexIndex * 3 + 1] = Math.min(1, color.g * n);
      colors[vertexIndex * 3 + 2] = Math.min(1, color.b * n);
    };
    if (geo.index) {
      const end = Math.min(geo.index.count, start + count);
      for (let i = start; i < end; i++) writeVertex(geo.index.getX(i));
    } else {
      const end = Math.min(pos.count, start + count);
      for (let i = start; i < end; i++) writeVertex(i);
    }
  };

  // Blender exports a single mesh with one primitive/group per material.
  // Preserve those original ceramic, metal and stone colors when merging GLBs.
  if (geo.groups.length > 0 && materials.length > 1) {
    for (const group of geo.groups) {
      writeColor(group.start, group.count, group.materialIndex ?? 0);
    }
  } else {
    writeColor(0, pos.count, 0);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  return geo;
}

/** Extract a single BufferGeometry (vertex colors baked) from a GLB URL. */
export function geometryFromGltfScene(
  scene: THREE.Object3D,
  options?: { liftPineFoliage?: boolean },
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const liftPine = Boolean(options?.liftPineFoliage);
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    parts.push(bakeMeshGeometry(mesh, liftPine));
  });
  if (parts.length === 0) {
    throw new Error('GLB scene contained no meshes');
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Failed to merge GLB geometries');
  merged.computeVertexNormals();
  return merged;
}

function isPremiumModelId(id: string): id is PremiumModelId {
  return (PREMIUM_MODEL_IDS as readonly string[]).includes(id);
}

const propProcCache = new Map<string, THREE.BufferGeometry>();
const PROP_MESH_REV = 'h6p6-pine-green';

/**
 * Procedural meshes that should win over tiny/missing GLBs.
 * Do NOT include `road_segment_a` — the H1 GLB is the classic dirt road.
 */
function forceProceduralProp(assetId: string): boolean {
  return (
    assetId.startsWith('fence') ||
    assetId.startsWith('well') ||
    assetId.startsWith('barrel') ||
    assetId.startsWith('camp_log') ||
    assetId.startsWith('campfire') ||
    assetId.startsWith('crate') ||
    assetId.startsWith('mine_') ||
    assetId.startsWith('tower') ||
    assetId.startsWith('civ_') ||
    assetId.startsWith('warehouse') ||
    assetId.startsWith('crane') ||
    assetId.startsWith('road_paved') ||
    assetId === 'road_paved_a' ||
    assetId.startsWith('bridge') ||
    assetId.startsWith('road_dirt') ||
    assetId.startsWith('ice_block') ||
    assetId.startsWith('reed_') ||
    assetId.startsWith('marsh_') ||
    assetId.startsWith('snow_') ||
    assetId.startsWith('melt_') ||
    assetId.startsWith('palm_') ||
    assetId.startsWith('tree_pine_dark') ||
    assetId.startsWith('lava_') ||
    assetId.startsWith('ruin_') ||
    assetId.startsWith('volcano_cone')
  );
}

function proceduralProp(assetId: string): THREE.BufferGeometry | null {
  let key: string | null = null;
  let build: (() => THREE.BufferGeometry) | null = null;
  if (assetId.startsWith('fence')) {
    key = 'fence';
    build = createFenceGeometry;
  } else if (assetId.startsWith('well')) {
    key = 'well';
    build = createWellGeometry;
  } else if (assetId.startsWith('barrel') || assetId.startsWith('camp_log')) {
    key = 'barrel';
    build = createBarrelGeometry;
  } else if (assetId.startsWith('campfire')) {
    key = 'campfire';
    build = createCampfireGeometry;
  } else if (assetId.startsWith('crate')) {
    key = 'crate';
    build = createCrateGeometry;
  } else if (assetId.startsWith('mine_')) {
    key = 'mine';
    build = createMineEntranceGeometry;
  } else if (assetId.startsWith('tower')) {
    key = 'tower';
    build = createTowerGeometry;
  } else if (assetId.startsWith('civ_column')) {
    key = 'civ_column';
    build = createCivColumnGeometry;
  } else if (assetId.startsWith('civ_awning')) {
    key = 'civ_awning';
    build = createCivAwningGeometry;
  } else if (assetId.startsWith('warehouse') || assetId.startsWith('crane')) {
    key = 'warehouse';
    build = createWarehouseGeometry;
  } else if (assetId.startsWith('road_paved') || assetId === 'road_paved_a') {
    key = 'road_paved';
    build = createPavedRoadGeometry;
  } else if (assetId.startsWith('road_dirt')) {
    key = 'road_dirt';
    build = createDirtRoadGeometry;
  } else if (assetId.startsWith('bridge')) {
    key = 'bridge';
    build = createBridgeGeometry;
  } else if (assetId.startsWith('ice_block')) {
    key = 'ice_block';
    build = createIceBlockGeometry;
  } else if (assetId.startsWith('reed_')) {
    key = 'reed';
    build = createReedClumpGeometry;
  } else if (assetId.startsWith('marsh_')) {
    key = 'marsh';
    build = createMarshPoolGeometry;
  } else if (assetId.startsWith('snow_')) {
    key = 'snow';
    build = createSnowPatchGeometry;
  } else if (assetId.startsWith('melt_')) {
    key = 'melt';
    build = createMeltPoolGeometry;
  } else if (assetId.startsWith('tree_pine_dark')) {
    key = 'pine_dark';
    build = createDarkPineGeometry;
  } else if (assetId === 'palm_a') {
    key = 'palm_a';
    build = createPalmAGeometry;
  } else if (assetId === 'palm_b' || assetId.startsWith('palm_')) {
    key = 'palm_b';
    build = createPalmBGeometry;
  } else if (assetId.startsWith('ruin_wall')) {
    key = 'ruin_wall';
    build = createRuinWallGeometry;
  } else if (assetId.startsWith('ruin_arch')) {
    key = 'ruin_arch';
    build = createRuinArchGeometry;
  } else if (assetId.startsWith('lava_pool')) {
    key = 'lava_pool';
    build = createLavaPoolGeometry;
  } else if (assetId.startsWith('lava_rock')) {
    key = 'lava_rock';
    build = createLavaRockGeometry;
  } else if (assetId.startsWith('volcano_cone')) {
    key = 'volcano_cone';
    build = createVolcanoConeGeometry;
  } else if (assetId === 'road_segment_a') {
    // Fallback only — prefer GLB when present.
    key = 'road_dirt';
    build = createDirtRoadGeometry;
  }
  if (!key || !build) return null;
  const cacheKey = `${PROP_MESH_REV}|${key}`;
  let geo = propProcCache.get(cacheKey);
  if (!geo) {
    geo = build();
    propProcCache.set(cacheKey, geo);
  }
  return geo;
}

function proceduralFallback(assetId: string): THREE.BufferGeometry {
  const prop = proceduralProp(assetId);
  if (prop) return prop;
  const legacy = resolveFallbackModelId(assetId);
  if (legacy && isPremiumModelId(legacy)) return getPremiumGeometry(legacy);
  if (isPremiumModelId(assetId)) return getPremiumGeometry(assetId);
  if (
    assetId === 'road_segment_a' ||
    assetId.startsWith('road_dirt') ||
    assetId.startsWith('road_')
  ) {
    if (assetId.includes('paved')) return createPavedRoadGeometry();
    return createDirtRoadGeometry();
  }
  return getPremiumGeometry('tree');
}

/**
 * Central H2 geometry API: Blender GLB via useGLTF when available,
 * otherwise procedural meshCatalog fallback (no Suspense).
 *
 * Note: callers that need Suspense GLB must only pass ids with a known URL
 * (validated by the asset pipeline). Missing URLs use procedural sync path.
 */
export function useVisualGeometry(assetId: string): THREE.BufferGeometry {
  const url = resolveVisualAssetUrl(assetId);

  // Hooks cannot be conditional — always call useGLTF with a stable URL.
  // When no premium URL exists, preload/use a tiny known GLB and discard it.
  const gltfUrl = url ?? '/assets/models/tree.glb';
  const gltf = useGLTF(gltfUrl);

  return useMemo(() => {
    // Force procedural only for H5 kits / enriched props — keep H1 road/house GLBs.
    if (forceProceduralProp(assetId)) {
      const forced = proceduralProp(assetId);
      if (forced) return forced;
    }

    if (!url) return proceduralFallback(assetId);

    const cacheKey = `${BAKE_VERSION}|${url}`;
    const cached = geometryCache.get(cacheKey);
    if (cached) return cached;

    try {
      const liftPineFoliage = assetId.startsWith('tree_pine') && !assetId.includes('pine_dark');
      const geo = geometryFromGltfScene(gltf.scene, { liftPineFoliage });
      geometryCache.set(cacheKey, geo);
      return geo;
    } catch {
      return proceduralFallback(assetId);
    }
  }, [assetId, gltf.scene, url]);
}

/** @deprecated Prefer useVisualGeometry — kept for H1 call sites during transition. */
export function usePremiumGlbGeometry(assetId: string): THREE.BufferGeometry {
  return useVisualGeometry(assetId);
}

/** Preload board-critical (and optional full catalog) GLB URLs. */
export function preloadPremiumAssets(urls: string[] = BOARD_PRELOAD_URLS) {
  for (const url of urls) {
    useGLTF.preload(url);
  }
}

/**
 * Textures that only appear once the player builds something.
 *
 * Left to `useTexture`, they are fetched and uploaded in the very frame that
 * places the first settlement — measured at 1.1 s of frozen frame, most of it
 * inside `texSubImage2D`. Warming them while the board is already loading moves
 * that cost to a moment the player expects to wait.
 */
const PROP_TEXTURE_URLS = [
  // Versions differ per stem — spelled out rather than generated, because a
  // preload that silently points at a missing file buys nothing.
  '/assets/textures/buildings/photoreal/aged_plaster_albedo_v1_s512.webp',
  '/assets/textures/buildings/photoreal/aged_plaster_normal_v1_s512.webp',
  '/assets/textures/buildings/photoreal/weathered_timber_albedo_v1_s512.webp',
  '/assets/textures/buildings/photoreal/weathered_timber_normal_v1_s512.webp',
  '/assets/textures/buildings/photoreal/rubble_stone_albedo_v2_s512.webp',
  '/assets/textures/buildings/photoreal/rubble_stone_normal_v2_s512.webp',
  '/assets/textures/buildings/photoreal/slate_roof_albedo_v1_s512.webp',
  '/assets/textures/buildings/photoreal/weathered_roof_normal_v1_s512.webp',
  '/assets/textures/roads/photoreal/rutted_dirt_road_albedo_v3_s512.webp',
  '/assets/textures/roads/photoreal/rutted_dirt_road_normal_v3_s512.webp',
];

/** Kick off H2 board preloads once (safe to call from module scope). */
export function preloadBoardAssets() {
  preloadPremiumAssets(BOARD_PRELOAD_URLS);
  for (const url of PROP_TEXTURE_URLS) useTexture.preload(url);
}

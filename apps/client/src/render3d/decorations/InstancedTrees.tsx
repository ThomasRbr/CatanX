import { VolumetricTrees } from './VolumetricTrees';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import {
  pickVariantId,
  SCRUB_VARIANT_IDS,
} from '../assets/visualAssetManifest';
import type { DecorInstance } from './deterministicDecoration';
import { useMapLod } from '../camera/MapLodContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { shouldShowScrub } from '../utils/mapLod';
import { shouldCastDecorShadows, selectShadowCasterDecor } from '../utils/perfBudgets';
import { attachFoliageTranslucency } from './foliageTranslucency';
import { getClimateVisualPreset, mixHex } from '../utils/seasonVisuals';
import {
  createCrossedConiferImpostorGeometry,
  createTreeCrownGeometry,
  createTreeSnowGeometry,
  createTreeTrunkGeometry,
  createUnderstoryGeometry,
  type TreeSpecies,
} from './photorealTreeGeometry';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';

interface InstancedTreesProps {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  animate?: boolean;
  season?: string;
  climateId?: string | null;
  naturalized?: boolean;
}

function scrubBucketsByBiome(
  items: DecorInstance[],
  tilesById: Map<string, HexTile>,
  season: string,
) {
  const buckets = SCRUB_VARIANT_IDS.map(() => [] as DecorInstance[]);
  for (const item of items) {
    const terrain = tilesById.get(item.tileId)?.terrain;
    const pool: readonly string[] = terrain === 'swamp'
      ? ['reed_clump_a', 'marsh_pool_a', 'bush_a']
      : terrain === 'glacier'
        ? season === 'winter'
          ? ['snow_patch_a']
          : ['snow_patch_a', 'melt_pool_a']
        : terrain === 'tundra'
          ? season === 'winter'
            ? ['snow_patch_a', 'grass_tuft_a']
            : ['grass_tuft_a', 'bush_a']
          : ['bush_a', 'bush_flower_a', 'bush_c', 'grass_tuft_a'];
    const selected = pool[((item.variant % pool.length) + pool.length) % pool.length]!;
    const idx = SCRUB_VARIANT_IDS.indexOf(selected as (typeof SCRUB_VARIANT_IDS)[number]);
    if (idx < 0) continue;
    buckets[idx]!.push(item);
  }
  return buckets;
}

const treeImpostorGeo = new THREE.PlaneGeometry(0.62, 1.04, 1, 1);
treeImpostorGeo.translate(0, 0.52, 0);

const TREE_SPECIES: readonly TreeSpecies[] = ['spruce', 'pine', 'deciduous', 'beech'];

export function treeSpeciesForTerrain(terrain: HexTile['terrain'], variant: number): TreeSpecies {
  if (terrain === 'glacier' || terrain === 'tundra') return variant % 4 === 0 ? 'pine' : 'spruce';
  if (terrain === 'jungle' || terrain === 'swamp' || terrain === 'pasture') {
    return variant % 5 === 0 ? 'pine' : variant % 2 === 0 ? 'beech' : 'deciduous';
  }
  if (terrain === 'forest') {
    const species = variant % 7;
    return species <= 1 ? 'spruce' : species === 2 ? 'pine' : species <= 4 ? 'beech' : 'deciduous';
  }
  return variant % 4 === 0 ? 'spruce' : variant % 4 === 1 ? 'pine' : variant % 4 === 2 ? 'beech' : 'deciduous';
}

function treeBucketsBySpecies(items: DecorInstance[], tilesById: Map<string, HexTile>) {
  const buckets: Record<TreeSpecies, DecorInstance[]> = {
    spruce: [],
    pine: [],
    deciduous: [],
    beech: [],
  };
  for (const item of items) {
    const terrain = tilesById.get(item.tileId)?.terrain;
    if (!terrain) continue;
    buckets[treeSpeciesForTerrain(terrain, item.variant)].push(item);
  }
  return buckets;
}

/**
 * Blend a crown gain towards the climate tint without losing the gain.
 *
 * `mixHex` cannot be used here: it parses hex, so it clamps at white and would
 * discard the above-1 lift the canopy depends on.
 */
function applyClimateTint(
  gain: THREE.Color,
  tint: string | undefined,
  strength: number,
): THREE.Color {
  if (!tint || strength <= 0) return gain;
  return gain.clone().lerp(gain.clone().multiply(new THREE.Color(tint)), strength);
}

/**
 * Seasonal crown grade, as a multiplier over the baked vertex colours.
 *
 * Those vertex colours run from #263e2f to #516a46 — deep forest greens that
 * linearise to about 0.04–0.13. Any multiplier below 1 crushes them to black,
 * and every season here used to do exactly that: spring sat at #a6b49a, a 0.65
 * factor, on the season the game opens in. The gain is applied on top so the
 * canopy can be lifted past white without touching the geometry palette.
 */
function seasonalCrownColor(species: TreeSpecies, season: string): THREE.Color {
  const conifer = species !== 'deciduous' && species !== 'beech';
  const hex = conifer
    ? season === 'winter' ? '#c6cec4'
      : season === 'autumn' ? '#c9c096'
        : season === 'spring' ? '#cfe0bd'
          : '#ffffff'
    : season === 'autumn' ? '#e8ac63'
      : season === 'winter' ? '#cfccc2'
        : season === 'spring' ? '#d8ecb4'
          : '#ffffff';
  const gain = conifer ? 1.55 : 1.4;
  return new THREE.Color(hex).multiplyScalar(gain);
}

function TreeMeshLayer({
  geometry,
  material,
  items,
  tilesById,
  castShadow,
  receiveShadow = false,
  layer,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  castShadow: boolean;
  receiveShadow?: boolean;
  /** Render layer — use 1 for shadow-only proxies invisible to the main camera. */
  layer?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    if (typeof layer === 'number') {
      mesh.layers.set(layer);
    }
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const origin = cubeToWorld(tile.coord);
      const x = origin.x + item.x;
      const z = origin.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z) + 0.006, z);
      dummy.rotation.set(0, item.rotation + (item.variant % 5) * 0.17, 0);
      // Photographic forests need real size hierarchy — saplings next to veterans.
      const width = 0.62 + (item.variant % 7) * 0.12;
      const height = 0.68 + ((item.variant * 5) % 11) * 0.075;
      const scale = item.scale * (0.7 + (item.variant % 5) * 0.095);
      dummy.scale.set(
        scale * width,
        scale * height,
        scale * (0.88 + (item.variant % 4) * 0.06),
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      // Hue + brightness variation — gray-only tint made aerial forests one chroma blob.
      const hueShift = ((item.variant * 17) % 11) / 11;
      const brightness = 0.9 + (item.variant % 6) * 0.028;
      tint.setHSL(
        0.24 + hueShift * 0.1,
        0.14 + (item.variant % 4) * 0.035,
        0.58 + (item.variant % 5) * 0.025,
      );
      tint.multiplyScalar(brightness);
      mesh.setColorAt(index, tint);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, geometry, items, layer, surface, tilesById, tint]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled
      raycast={() => undefined}
    />
  );
}

function PhotorealTreeCanopy({
  items,
  tilesById,
  season,
  climateId,
  castShadow,
}: {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  season: string;
  climateId: string | null;
  animate: boolean;
  castShadow: boolean;
}) {
  const climate = getClimateVisualPreset(climateId);
  const lod = useMapLod();
  const spruceTexture = useTexture('/assets/textures/vegetation/spruce_impostor_v3.png');
  const spruceMidDistanceTexture = useTexture('/assets/textures/vegetation/spruce_impostor_v2.png');
  const pineTexture = useTexture('/assets/textures/vegetation/pine_impostor_v2.png');
  const oakTexture = useTexture('/assets/textures/vegetation/oak_impostor_v2.png');
  const beechTexture = useTexture('/assets/textures/vegetation/beech_impostor_v3.png');
  const winterSpruceTexture = useTexture('/assets/textures/vegetation/spruce_winter_v1.png');
  const winterBeechTexture = useTexture('/assets/textures/vegetation/beech_winter_v1.png');
  const photoTextures = useMemo(() => ({
    spruce: season === 'winter' ? winterSpruceTexture : lod === 0 ? spruceTexture : spruceMidDistanceTexture,
    pine: season === 'winter' ? winterSpruceTexture : pineTexture,
    deciduous: season === 'winter' ? winterBeechTexture : oakTexture,
    beech: season === 'winter' ? winterBeechTexture : beechTexture,
  }), [beechTexture, lod, oakTexture, pineTexture, season, spruceMidDistanceTexture, spruceTexture, winterBeechTexture, winterSpruceTexture]);
  const buckets = useMemo(() => treeBucketsBySpecies(items, tilesById), [items, tilesById]);
  const shadowBuckets = useMemo(() => {
    if (!castShadow) {
      return Object.fromEntries(TREE_SPECIES.map((species) => [species, [] as DecorInstance[]])) as Record<TreeSpecies, DecorInstance[]>;
    }
    return Object.fromEntries(TREE_SPECIES.map((species) => [
      species,
      selectShadowCasterDecor(buckets[species], 0.38),
    ])) as Record<TreeSpecies, DecorInstance[]>;
  }, [buckets, castShadow]);
  const impostorGeometries = useMemo(() => Object.fromEntries(TREE_SPECIES.map((species) => [
    species,
    createCrossedConiferImpostorGeometry(species),
  ])) as Record<TreeSpecies, THREE.BufferGeometry>, []);
  const shadowProxyGeometry = useMemo(() => {
    const geometry = new THREE.ConeGeometry(0.24, 0.92, 6);
    geometry.translate(0, 0.46, 0);
    return geometry;
  }, []);
  const shadowProxyMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#1c2418',
  }), []);
  const photoMaterials = useMemo(() => Object.fromEntries(TREE_SPECIES.map((species) => {
    const material = new THREE.MeshStandardMaterial({
      map: photoTextures[species],
      color: applyClimateTint(
        season === 'winter' ? new THREE.Color(1.25, 1.25, 1.25) : seasonalCrownColor(species, season),
        climate?.terrainTint,
        Math.min(0.18, (climate?.terrainTintStrength ?? 0) * 0.4),
      ),
      // Fine bare twigs carry more partially transparent pixels than foliage.
      // A firmer winter cut removes chroma residue without thickening them.
      // Summer alphaTest raised slightly to cut impostor edge overdraw.
      alphaTest: season === 'winter' && (species === 'deciduous' || species === 'beech') ? 0.42 : 0.34,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0,
      depthWrite: true,
    });
    if (season === 'winter') {
      // Snow and fine twigs are the worst possible chroma-key subjects: their
      // antialiased edge pixels can retain red/blue spill even after despill.
      // Neutralise only magenta-dominant fragments in linear space, preserving
      // the photographed snow, bark and alpha silhouette.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float catanxMagentaSpill = max(0.0, min(diffuseColor.r, diffuseColor.b) - diffuseColor.g);
          diffuseColor.r -= catanxMagentaSpill;
          diffuseColor.b -= catanxMagentaSpill;`,
        );
      };
      material.customProgramCacheKey = () => 'catanx-winter-despill-v1';
    }
    return [species, material];
  })) as Record<TreeSpecies, THREE.MeshStandardMaterial>, [climate, photoTextures, season]);
  useEffect(() => {
    for (const texture of [
      ...Object.values(photoTextures),
      spruceTexture,
      spruceMidDistanceTexture,
      winterSpruceTexture,
      winterBeechTexture,
    ]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
  }, [photoTextures, spruceMidDistanceTexture, spruceTexture, winterBeechTexture, winterSpruceTexture]);

  useEffect(() => () => {
    for (const material of Object.values(photoMaterials)) material.dispose();
    shadowProxyMaterial.dispose();
  }, [photoMaterials, shadowProxyMaterial]);

  useEffect(() => () => {
    for (const geometry of Object.values(impostorGeometries)) geometry.dispose();
    shadowProxyGeometry.dispose();
  }, [impostorGeometries, shadowProxyGeometry]);

  return <group>
    {TREE_SPECIES.map((species) => <group key={species}>
      <TreeMeshLayer
        geometry={impostorGeometries[species]}
        material={photoMaterials[species]}
        items={buckets[species]}
        tilesById={tilesById}
        castShadow={false}
      />
      {castShadow && (
        <TreeMeshLayer
          geometry={shadowProxyGeometry}
          material={shadowProxyMaterial}
          items={shadowBuckets[species]}
          tilesById={tilesById}
          castShadow
          layer={1}
        />
      )}
    </group>)}
  </group>;
}

function VolumetricTreeCanopy({
  items,
  tilesById,
  season,
  climateId,
  castShadow,
}: {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  season: string;
  climateId: string | null;
  castShadow: boolean;
}) {
  const climate = getClimateVisualPreset(climateId);
  const buckets = useMemo(() => treeBucketsBySpecies(items, tilesById), [items, tilesById]);
  const geometries = useMemo(() => Object.fromEntries(TREE_SPECIES.map((species) => [
    species,
    {
      trunk: createTreeTrunkGeometry(species),
      crown: createTreeCrownGeometry(species),
      snow: createTreeSnowGeometry(species),
    },
  ])) as Record<TreeSpecies, {
    trunk: THREE.BufferGeometry;
    crown: THREE.BufferGeometry;
    snow: THREE.BufferGeometry;
  }>, []);
  const crownMaterial = useMemo(() => {
    const result = new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: applyClimateTint(
        seasonalCrownColor('spruce', season),
        climate?.terrainTint,
        Math.min(0.14, (climate?.terrainTintStrength ?? 0) * 0.32),
      ),
      roughness: 0.94,
      metalness: 0,
      flatShading: false,
    });
    // Needles are thin. Without a transmission term the whole canopy collapses
    // to a black silhouette wherever it faces away from the key light.
    attachFoliageTranslucency(result, {
      transmissionColor: season === 'autumn' ? '#c98a3f' : season === 'winter' ? '#6f8470' : '#8fc25a',
      transmission: season === 'winter' ? 0.45 : 0.85,
      wrap: 0.5,
    });
    return result;
  }, [climate, season]);
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    flatShading: false,
  }), []);
  const snowMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: '#dbe2e2',
    roughness: 0.82,
  }), []);

  useEffect(() => () => {
    for (const geometry of Object.values(geometries)) {
      geometry.trunk.dispose();
      geometry.crown.dispose();
      geometry.snow.dispose();
    }
    crownMaterial.dispose();
    trunkMaterial.dispose();
    snowMaterial.dispose();
  }, [crownMaterial, geometries, snowMaterial, trunkMaterial]);

  return (
    <group>
      {TREE_SPECIES.map((species) => (
        <group key={`volumetric-${species}`}>
          <TreeMeshLayer
            geometry={geometries[species].trunk}
            material={trunkMaterial}
            items={buckets[species]}
            tilesById={tilesById}
            castShadow={castShadow}
          />
          <TreeMeshLayer
            geometry={geometries[species].crown}
            material={crownMaterial}
            items={buckets[species]}
            tilesById={tilesById}
            castShadow={castShadow}
          />
          {season === 'winter' && (
            <TreeMeshLayer
              geometry={geometries[species].snow}
              material={snowMaterial}
              items={buckets[species]}
              tilesById={tilesById}
              castShadow={false}
            />
          )}
        </group>
      ))}
    </group>
  );
}

function RealisticTreeImpostors({
  items,
  tilesById,
  season,
}: {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  season: string;
}) {
  const texture = useTexture('/assets/textures/vegetation/spruce_impostor_v2.png');
  const camera = useThree((state) => state.camera);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const surface = useSurfaceHeight();
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        color: season === 'winter' ? '#c7d0c8' : season === 'autumn' ? '#d8bd96' : '#ffffff',
        alphaTest: 0.22,
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.92,
        metalness: 0,
        depthWrite: true,
      }),
    [season, texture],
  );

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return () => material.dispose();
  }, [material, texture]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const origin = cubeToWorld(tile.coord);
      const x = origin.x + item.x;
      const z = origin.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z) + 0.006, z);
      dummy.quaternion.copy(camera.quaternion);
      const variantScale = 1.04 + (item.variant % 5) * 0.065;
      const s = item.scale * variantScale * 0.86;
      dummy.scale.set(s, s * (0.92 + (item.variant % 3) * 0.05), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [camera.quaternion, dummy, items, surface, tilesById]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[treeImpostorGeo, material, items.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled
      raycast={() => undefined}
      renderOrder={2}
    />
  );
}

function ScrubVariantLayer({
  assetId,
  items,
  tilesById,
  material,
  castShadow,
}: {
  assetId: string;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  material: THREE.MeshStandardMaterial;
  castShadow: boolean;
}) {
  const geo = useVisualGeometry(assetId);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const origin = cubeToWorld(tile.coord);
      const x = origin.x + item.x;
      const z = origin.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z) + 0.004, z);
      dummy.rotation.set(0, item.rotation, 0);
      const pasture = tile.terrain === 'pasture';
      const swamp = tile.terrain === 'swamp';
      // Pasture bushes must read against the green hex (assets are ~0.1 radius).
      const baseMul = pasture
        ? assetId.includes('grass')
          ? 0.42
          : 0.78
        : swamp && (assetId.includes('reed') || assetId.includes('marsh'))
          ? 1.25
          : 1.05;
      const s = item.scale * baseMul;
      dummy.scale.set(s, s * (assetId.includes('snow') ? 0.7 : 0.9), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, geo, items, surface, tilesById]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geo, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled
      raycast={() => undefined}
    />
  );
}

function NaturalUnderstoryLayer({
  items,
  tilesById,
  castShadow,
}: {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  castShadow: boolean;
}) {
  const geometry = useMemo(createUnderstoryGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const origin = cubeToWorld(tile.coord);
      const x = origin.x + item.x;
      const z = origin.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z) + 0.006, z);
      dummy.rotation.set(0, item.rotation + (item.variant % 5) * 0.31, 0);
      const terrainScale = tile.terrain === 'forest' || tile.terrain === 'jungle' ? 0.56 : 0.3;
      const scale = item.scale * terrainScale * (0.72 + (item.variant % 4) * 0.07);
      dummy.scale.set(scale, scale * (0.82 + (item.variant % 3) * 0.07), scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, items, surface, tilesById]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled
      raycast={() => undefined}
    />
  );
}

export function InstancedTrees({
  items,
  tilesById,
  animate = true,
  season = 'summer',
  climateId = null,
  naturalized = false,
}: InstancedTreesProps) {
  const lod = useMapLod();
  const showScrub = shouldShowScrub(lod);
  const castShadow = shouldCastDecorShadows(lod);
  const climateVisual = getClimateVisualPreset(climateId);
  const scrubMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.02,
        flatShading: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      scrubMat.dispose();
    };
  }, [scrubMat]);

  useEffect(() => {
    const tint = mixHex(
      '#ffffff',
      climateVisual?.terrainTint ?? '#ffffff',
      Math.min(0.34, (climateVisual?.terrainTintStrength ?? 0) * 0.75),
    );
    scrubMat.color.set(tint);
  }, [climateVisual, scrubMat]);

  const trees = useMemo(() => items.filter((i) => i.kind === 'tree'), [items]);
  const scrubs = useMemo(
    () => items.filter((item) => {
      if (item.kind !== 'scrub') return false;
      if (!naturalized) return true;
      const terrain = tilesById.get(item.tileId)?.terrain;
      return terrain === 'forest' || terrain === 'jungle' || terrain === 'pasture';
    }),
    [items, naturalized, tilesById],
  );
  const scrubBuckets = useMemo(
    () => scrubBucketsByBiome(scrubs, tilesById, season),
    [scrubs, season, tilesById],
  );

  // The naturalized board uses volumetric card trees cut from the same
  // photographs; crossed impostors stay for the classic/orthographic board.
  return (
    <group>
      {naturalized ? (
        <VolumetricTrees items={trees} tilesById={tilesById} season={season} />
      ) : lod === 0 ? (
        <VolumetricTreeCanopy
          items={trees}
          tilesById={tilesById}
          season={season}
          climateId={climateId}
          castShadow={castShadow}
        />
      ) : lod === 2 ? (
        <RealisticTreeImpostors items={trees} tilesById={tilesById} season={season} />
      ) : (
        <PhotorealTreeCanopy
          items={trees}
          tilesById={tilesById}
          season={season}
          climateId={climateId}
          animate={animate}
          castShadow={castShadow}
        />
      )}
      {showScrub && (naturalized ? (
        <NaturalUnderstoryLayer
          items={scrubs}
          tilesById={tilesById}
          castShadow={castShadow}
        />
      ) : (
        SCRUB_VARIANT_IDS.map((assetId, idx) => (
          <ScrubVariantLayer
            key={assetId}
            assetId={pickVariantId(SCRUB_VARIANT_IDS, idx)}
            items={scrubBuckets[idx]!}
            tilesById={tilesById}
            material={scrubMat}
            castShadow={castShadow}
          />
        ))
      ))}
    </group>
  );
}

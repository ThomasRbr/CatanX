import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import {
  createDuneCrescentGeometry,
  createDuneMoundGeometry,
  createDuneRippleGeometry,
  createPeakMassifGeometry,
  createPeakRidgeGeometry,
  createPeakSpireGeometry,
  createVolcanoConeGeometry,
} from '../assets/meshCatalog';
import {
  HILL_VARIANT_IDS,
  pickVariantId,
  ROCK_VARIANT_IDS,
} from '../assets/visualAssetManifest';
import { useMapLod } from '../camera/MapLodContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { shouldCastDecorShadows } from '../utils/perfBudgets';
import type { DecorInstance } from './deterministicDecoration';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { getAuthoredBiomeTextures } from '../terrain/authoredPbrTextures';
import { attachWorldProjectedPbr } from '../terrain/worldProjectedPbr';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';

interface InstancedRocksProps {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  season?: string;
  naturalized?: boolean;
}

const PEAK_MESH_REV = 'mtn-v23-continuous-ridge-support';
const DUNE_MESH_REV = 'dune-v3-full-hex';

const PEAK_VARIANTS = [
  { id: 'peak_spire', build: createPeakSpireGeometry, sx: 0.94, sy: 0.7, sz: 0.94 },
  { id: 'peak_massif', build: createPeakMassifGeometry, sx: 0.96, sy: 0.66, sz: 0.96 },
  { id: 'peak_ridge', build: createPeakRidgeGeometry, sx: 0.98, sy: 0.68, sz: 0.92 },
] as const;

const DUNE_VARIANTS = [
  { id: 'dune_mound', build: createDuneMoundGeometry, sx: 1.45, sy: 1.05, sz: 1.35 },
  { id: 'dune_crescent', build: createDuneCrescentGeometry, sx: 1.55, sy: 0.95, sz: 1.15 },
  { id: 'dune_ripple', build: createDuneRippleGeometry, sx: 1.7, sy: 0.9, sz: 1.1 },
] as const;

const iceMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.48,
  metalness: 0.22,
  flatShading: false,
});
const lavaRockMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.7,
  metalness: 0.12,
  flatShading: false,
  emissive: '#3a1008',
  emissiveIntensity: 0.35,
});
const volcanoPeakMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.78,
  metalness: 0.08,
  flatShading: false,
  emissive: '#4a1808',
  emissiveIntensity: 0.45,
});
/** Clay quarry mounds — warm ochre, related to hill floor but slightly lighter. */

/** Clay quarry rocks: warm ochre; volcano ash rocks: cool scorched; else neutral. */
const CLAY_ROCK = new THREE.Color('#c6a078');
const ASH_ROCK = new THREE.Color('#9a888c');
const NEUTRAL_ROCK = new THREE.Color('#ffffff');
const _rockTint = new THREE.Color();

function bucketByVariant(items: DecorInstance[], poolLength: number) {
  const buckets = Array.from({ length: poolLength }, () => [] as DecorInstance[]);
  for (const item of items) {
    const idx = ((item.variant % poolLength) + poolLength) % poolLength;
    buckets[idx]!.push(item);
  }
  return buckets;
}

function RockVariantLayer({
  assetId,
  items,
  tilesById,
  castShadow,
  rockMaterial,
}: {
  assetId: string;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  castShadow: boolean;
  rockMaterial: THREE.MeshStandardMaterial;
}) {
  const geo = useVisualGeometry(assetId);
  const ref = useRef<THREE.InstancedMesh>(null);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const o = cubeToWorld(tile.coord);
      const x = o.x + item.x;
      const z = o.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z), z);
      dummy.rotation.set(0, item.rotation, 0);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const tint =
        tile.terrain === 'hill' ? CLAY_ROCK : tile.terrain === 'volcano' ? ASH_ROCK : NEUTRAL_ROCK;
      _rockTint.copy(tint);
      // Slight per-instance variation so the quarry isn't flat paint.
      if (tile.terrain === 'hill' || tile.terrain === 'volcano') {
        const n = 0.92 + (item.variant % 5) * 0.03;
        _rockTint.multiplyScalar(n);
      }
      mesh.setColorAt(i, _rockTint);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [geo, items, surface, tilesById]);

  if (items.length === 0) return null;
  const mat = assetId.startsWith('ice_block')
    ? iceMat
    : assetId.startsWith('lava_rock')
      ? lavaRockMat
      : rockMaterial;
  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, items.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled
      raycast={() => undefined}
    />
  );
}

function createNaturalBoulderGeometry(variant: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(0.115, 2);
  const position = geometry.getAttribute('position');
  const phase = variant * 1.731 + 0.47;
  for (let index = 0; index < position.count; index++) {
    const sourceX = position.getX(index);
    const sourceY = position.getY(index);
    const sourceZ = position.getZ(index);
    const azimuth = Math.atan2(sourceZ, sourceX);
    const elevation = Math.atan2(sourceY, Math.hypot(sourceX, sourceZ));
    const fracture =
      1 +
      Math.sin(azimuth * (3 + (variant % 2)) + phase) * 0.075 +
      Math.sin(elevation * 5.3 - phase * 0.7) * 0.045 +
      Math.sin((sourceX * 31 + sourceZ * 23) + phase) * 0.026;
    const widthX = 1.06 + (variant % 3) * 0.08;
    const widthZ = 1.16 - (variant % 2) * 0.12;
    const flattenedY = Math.max(-0.055, sourceY * (0.76 + (variant % 2) * 0.08));
    position.setXYZ(
      index,
      sourceX * fracture * widthX,
      flattenedY * fracture + 0.055,
      sourceZ * fracture * widthZ,
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function NaturalBoulderLayer({
  geometry,
  items,
  tilesById,
  material,
  castShadow,
}: {
  geometry: THREE.BufferGeometry;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  material: THREE.MeshStandardMaterial;
  castShadow: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const origin = cubeToWorld(tile.coord);
      const x = origin.x + item.x;
      const z = origin.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z) - 0.004, z);
      dummy.rotation.set(
        (item.variant % 3 - 1) * 0.055,
        item.rotation,
        ((item.variant + index) % 5 - 2) * 0.038,
      );
      dummy.scale.set(
        item.scale * 0.4 * (0.92 + (index % 4) * 0.055),
        item.scale * 0.34 * (0.84 + (item.variant % 3) * 0.07),
        item.scale * 0.4 * (0.94 + ((index + 2) % 3) * 0.07),
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const tint = tile.terrain === 'hill' ? CLAY_ROCK : NEUTRAL_ROCK;
      _rockTint.copy(tint).multiplyScalar(0.9 + ((index + item.variant) % 5) * 0.028);
      mesh.setColorAt(index, _rockTint);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [geometry, items, surface, tilesById]);

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

function ProceduralVariantLayer({
  geo,
  items,
  tilesById,
  material,
  castShadow,
  sx,
  sy,
  sz,
}: {
  geo: THREE.BufferGeometry;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  material: THREE.Material;
  castShadow: boolean;
  sx: number;
  sy: number;
  sz: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const o = cubeToWorld(tile.coord);
      const x = o.x + item.x;
      const z = o.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z), z);
      dummy.rotation.set(0, item.rotation, 0);
      // No XY jitter — peaks must stay sized to fill the hex apron evenly.
      dummy.scale.set(item.scale * sx, item.scale * sy, item.scale * sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [geo, items, surface, sx, sy, sz, tilesById]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geo, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}

function SimpleVariantLayer({
  assetId,
  items,
  tilesById,
  material,
  castShadow,
  yScale = 1,
}: {
  assetId: string;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  material: THREE.MeshStandardMaterial;
  castShadow: boolean;
  yScale?: number;
}) {
  const geo = useVisualGeometry(assetId);
  const ref = useRef<THREE.InstancedMesh>(null);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const o = cubeToWorld(tile.coord);
      const x = o.x + item.x;
      const z = o.z + item.z;
      dummy.position.set(x, surface.sampleHeight(x, z), z);
      dummy.rotation.set(0, item.rotation, 0);
      dummy.scale.set(item.scale, item.scale * yScale, item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [assetId, geo, items, surface, tilesById, yScale]);

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

export function InstancedRocks({
  items,
  tilesById,
  season = 'summer',
  naturalized = false,
}: InstancedRocksProps) {
  const lod = useMapLod();
  const quality = useRenderQuality();
  const castShadow = shouldCastDecorShadows(lod);
  const mountainTextures = getAuthoredBiomeTextures('mountain', quality.textureTier);
  const clayTextures = getAuthoredBiomeTextures('hill', quality.textureTier);
  const sandTextures = getAuthoredBiomeTextures('desert', quality.textureTier);
  const rockMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: false,
      map: mountainTextures.albedo,
      normalMap: mountainTextures.normal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: mountainTextures.roughness,
      color: '#c6c4bd',
      roughness: 0.94,
      metalness: 0.008,
      envMapIntensity: 0.62,
    });
    attachWorldProjectedPbr(material, 1.35);
    return material;
  }, [mountainTextures.albedo, mountainTextures.normal, mountainTextures.roughness]);
  const peakMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: false,
      map: mountainTextures.albedo,
      normalMap: mountainTextures.normal,
      normalScale: new THREE.Vector2(0.78, 0.78),
      roughnessMap: mountainTextures.roughness,
      roughness: 0.9,
      metalness: 0.025,
      flatShading: false,
      color: season === 'winter' ? '#e4e9e8' : '#deddd8',
      emissive: '#34332f',
      emissiveMap: mountainTextures.albedo,
      emissiveIntensity: season === 'winter' ? 0.24 : 0.26,
    });
    attachWorldProjectedPbr(material, 0.58);
    return material;
  }, [mountainTextures.albedo, mountainTextures.normal, mountainTextures.roughness, season]);
  const duneMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: season === 'winter' ? '#d8dddc' : '#c6ad7d',
      map: sandTextures.albedo,
      normalMap: sandTextures.normal,
      normalScale: new THREE.Vector2(0.38, 0.38),
      roughnessMap: sandTextures.roughness,
      roughness: season === 'winter' ? 0.88 : 0.96,
      metalness: 0,
    });
    attachWorldProjectedPbr(material, 0.64);
    return material;
  }, [sandTextures.albedo, sandTextures.normal, sandTextures.roughness, season]);
  const hillMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      map: clayTextures.albedo,
      normalMap: clayTextures.normal,
      normalScale: new THREE.Vector2(0.46, 0.46),
      roughnessMap: clayTextures.roughness,
      roughness: 0.94,
      metalness: 0.01,
    });
    attachWorldProjectedPbr(material, 0.62);
    return material;
  }, [clayTextures.albedo, clayTextures.normal, clayTextures.roughness]);

  const rocks = useMemo(() => items.filter((i) => i.kind === 'rock'), [items]);
  const naturalRocks = useMemo(
    () => rocks.filter((item) => {
      const terrain = tilesById.get(item.tileId)?.terrain;
      return terrain !== 'glacier' && terrain !== 'volcano';
    }),
    [rocks, tilesById],
  );
  const iceRocks = useMemo(
    () => rocks.filter((item) => tilesById.get(item.tileId)?.terrain === 'glacier'),
    [rocks, tilesById],
  );
  const iceBuckets = useMemo(() => bucketByVariant(iceRocks, 4), [iceRocks]);
  const iceMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: season === 'winter' ? '#eef4f8' : '#d8e8f0',
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    sheen: 0.4,
    sheenColor: new THREE.Color('#9fd0e6'),
  }), [season]);
  useEffect(() => () => iceMaterial.dispose(), [iceMaterial]);
  const lavaRocks = useMemo(
    () => rocks.filter((item) => tilesById.get(item.tileId)?.terrain === 'volcano'),
    [rocks, tilesById],
  );
  const peaks = useMemo(() => items.filter((i) => i.kind === 'peak'), [items]);
  const volcanoPeaks = useMemo(
    () => peaks.filter((i) => tilesById.get(i.tileId)?.terrain === 'volcano'),
    [peaks, tilesById],
  );
  const landPeaks = useMemo(
    () => peaks.filter((i) => tilesById.get(i.tileId)?.terrain !== 'volcano'),
    [peaks, tilesById],
  );
  const dunes = useMemo(() => items.filter((i) => i.kind === 'dune'), [items]);
  const hills = useMemo(() => items.filter((i) => i.kind === 'hill'), [items]);

  const rockBuckets = useMemo(() => bucketByVariant(rocks, ROCK_VARIANT_IDS.length), [rocks]);
  const naturalRockBuckets = useMemo(
    () => bucketByVariant(naturalRocks, 4),
    [naturalRocks],
  );
  const landPeakBuckets = useMemo(() => bucketByVariant(landPeaks, PEAK_VARIANTS.length), [landPeaks]);
  const duneBuckets = useMemo(() => bucketByVariant(dunes, DUNE_VARIANTS.length), [dunes]);
  const hillBuckets = useMemo(() => bucketByVariant(hills, HILL_VARIANT_IDS.length), [hills]);

  const peakGeos = useMemo(() => PEAK_VARIANTS.map((v) => v.build()), [PEAK_MESH_REV]);
  const duneGeos = useMemo(() => DUNE_VARIANTS.map((v) => v.build()), [DUNE_MESH_REV]);
  const volcanoConeGeo = useMemo(() => createVolcanoConeGeometry(), []);
  const naturalBoulderGeos = useMemo(
    () => Array.from({ length: 4 }, (_, index) => createNaturalBoulderGeometry(index)),
    [],
  );

  useEffect(() => {
    return () => {
      for (const g of peakGeos) g.dispose();
      for (const g of duneGeos) g.dispose();
      for (const g of naturalBoulderGeos) g.dispose();
      volcanoConeGeo.dispose();
      peakMaterial.dispose();
      rockMaterial.dispose();
      duneMaterial.dispose();
      hillMaterial.dispose();
    };
  }, [duneGeos, duneMaterial, hillMaterial, naturalBoulderGeos, peakGeos, peakMaterial, rockMaterial, volcanoConeGeo]);

  return (
    <group>
      {naturalized ? (
        <>
          {naturalBoulderGeos.map((geometry, idx) => (
          <NaturalBoulderLayer
            key={`natural-boulder-${idx}`}
            geometry={geometry}
            items={naturalRockBuckets[idx]!}
            tilesById={tilesById}
            castShadow={castShadow}
            material={rockMaterial}
          />
          ))}
          {/* Glacier ice as fractured séracs, not the rounded ice-block GLB
              that read as a village of igloos. */}
          {naturalBoulderGeos.map((geometry, idx) => (
            <NaturalBoulderLayer
              key={`ice-${idx}`}
              geometry={geometry}
              items={iceBuckets[idx]!}
              tilesById={tilesById}
              castShadow={castShadow}
              material={iceMaterial}
            />
          ))}
          <RockVariantLayer
            key="lava-rocks"
            assetId="lava_rock_a"
            items={lavaRocks}
            tilesById={tilesById}
            castShadow={castShadow}
            rockMaterial={rockMaterial}
          />
        </>
      ) : ROCK_VARIANT_IDS.map((assetId, idx) => (
        <RockVariantLayer
          key={assetId}
          assetId={pickVariantId(ROCK_VARIANT_IDS, idx)}
          items={rockBuckets[idx]!}
          tilesById={tilesById}
          castShadow={castShadow}
          rockMaterial={rockMaterial}
        />
      ))}
      {PEAK_VARIANTS.map((variant, idx) => (
        <ProceduralVariantLayer
          key={`land-${variant.id}`}
          geo={peakGeos[idx]!}
          items={landPeakBuckets[idx]!}
          tilesById={tilesById}
          material={peakMaterial}
          castShadow={castShadow}
          sx={variant.sx}
          sy={variant.sy}
          sz={variant.sz}
        />
      ))}
      <ProceduralVariantLayer
        key="volcano-cone"
        geo={volcanoConeGeo}
        items={volcanoPeaks}
        tilesById={tilesById}
        material={volcanoPeakMat}
        castShadow={castShadow}
        sx={1.32}
        sy={1.28}
        sz={1.32}
      />
      {DUNE_VARIANTS.map((variant, idx) => (
        <ProceduralVariantLayer
          key={variant.id}
          geo={duneGeos[idx]!}
          items={duneBuckets[idx]!}
          tilesById={tilesById}
          material={duneMaterial}
          castShadow={castShadow}
          sx={variant.sx}
          sy={variant.sy}
          sz={variant.sz}
        />
      ))}
      {!naturalized && HILL_VARIANT_IDS.map((assetId, idx) => (
        <SimpleVariantLayer
          key={assetId}
          assetId={pickVariantId(HILL_VARIANT_IDS, idx)}
          items={hillBuckets[idx]!}
          tilesById={tilesById}
          material={hillMaterial}
          castShadow={castShadow}
          yScale={0.32}
        />
      ))}
    </group>
  );
}

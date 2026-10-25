import { useEffect, useMemo } from 'react';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { loadAuthoredTexture } from '../terrain/authoredPbrTextures';
import type { TextureSet } from '../terrain/BiomeMaterialRegistry';
import type { SurfaceHeightSampler } from '../terrain/BoardHeightfield';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';

interface AgriculturalParcelsProps {
  tilesById: Map<string, HexTile>;
  season: string;
}

type ParcelMaterial = 'wheat' | 'ploughed';

interface ParcelLayout {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

const PARCEL_LAYOUT: readonly ParcelLayout[] = [
  { centerX: -0.32, centerZ: -0.24, width: 0.63, depth: 0.42 },
  { centerX: 0.31, centerZ: -0.23, width: 0.55, depth: 0.4 },
  { centerX: -0.31, centerZ: 0.25, width: 0.6, depth: 0.4 },
  { centerX: 0.31, centerZ: 0.25, width: 0.57, depth: 0.4 },
];

function textureSet(stem: 'wheat_rows' | 'ploughed_field', channel: 'albedo' | 'normal' | 'roughness' | 'ao'): TextureSet {
  const extension = channel === 'normal' ? 'webp' : 'jpg';
  const source = `/assets/textures/terrain/photoreal/${stem}_${channel}_v1.${extension}`;
  return {
    sources: { '512': source, '1k': source, '2k': source, '4k': source },
    colorSpace: channel === 'albedo' ? 'srgb' : 'linear',
    repeat: [1, 1],
  };
}

function parcelKind(tileId: string, index: number, season: string): ParcelMaterial {
  const roll = hashString(`${tileId}:farm:${index}`) % 10;
  if (season === 'spring') return roll < 6 ? 'ploughed' : 'wheat';
  if (season === 'autumn') return roll < 5 ? 'ploughed' : 'wheat';
  return roll < 2 ? 'ploughed' : 'wheat';
}

function buildParcelGeometry(
  tiles: readonly HexTile[],
  surface: SurfaceHeightSampler,
  materialKind: ParcelMaterial,
  season: string,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segmentsU = 8;
  const segmentsV = 4;

  for (const tile of tiles) {
    const origin = cubeToWorld(tile.coord);
    const baseBearing = (((tile.coord.q * 17 + tile.coord.r * 11) % 6) + 6) % 6 * Math.PI / 6;
    const cosine = Math.cos(baseBearing);
    const sine = Math.sin(baseBearing);

    for (let parcelIndex = 0; parcelIndex < PARCEL_LAYOUT.length; parcelIndex++) {
      if (parcelKind(tile.id, parcelIndex, season) !== materialKind) continue;
      const layout = PARCEL_LAYOUT[parcelIndex]!;
      const seed = hashString(`${tile.id}:parcel:${parcelIndex}`);
      const widthScale = 0.92 + (seed % 17) / 100;
      const depthScale = 0.9 + ((seed >> 4) % 15) / 100;
      const skew = (((seed >> 8) % 21) - 10) * 0.0026;
      const edgeWave = 0.018 + ((seed >> 13) % 9) * 0.0016;
      const base = positions.length / 3;

      for (let vIndex = 0; vIndex <= segmentsV; vIndex++) {
        const v = vIndex / segmentsV;
        for (let uIndex = 0; uIndex <= segmentsU; uIndex++) {
          const u = uIndex / segmentsU;
          const boundaryFade = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
          const irregularX = Math.sin(v * Math.PI * 2 + parcelIndex * 1.7) * edgeWave * (1 - Math.sin(Math.PI * u));
          const irregularZ = Math.sin(u * Math.PI * 3 + seed * 0.001) * edgeWave * (1 - Math.sin(Math.PI * v));
          const localX = layout.centerX
            + (u - 0.5) * layout.width * widthScale
            + (v - 0.5) * skew
            + irregularX;
          const localZ = layout.centerZ
            + (v - 0.5) * layout.depth * depthScale
            + irregularZ
            + boundaryFade * Math.sin(seed * 0.0007) * 0.006;
          const worldX = origin.x + cosine * localX + sine * localZ;
          const worldZ = origin.z - sine * localX + cosine * localZ;
          const normal = surface.sampleNormal(worldX, worldZ);
          positions.push(worldX, surface.sampleHeight(worldX, worldZ) + 0.011, worldZ);
          normals.push(normal.x, normal.y, normal.z);
          // Each parcel owns a complete authored crop pattern; the field
          // bearing rotates the geometry while UVs preserve straight furrows.
          uvs.push(u, v);
        }
      }

      const stride = segmentsU + 1;
      for (let vIndex = 0; vIndex < segmentsV; vIndex++) {
        for (let uIndex = 0; uIndex < segmentsU; uIndex++) {
          const a = base + vIndex * stride + uIndex;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildBorderGeometry(
  tiles: readonly HexTile[],
  surface: SurfaceHeightSampler,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const edgeSegments = 8;

  for (const tile of tiles) {
    const origin = cubeToWorld(tile.coord);
    const bearing = (((tile.coord.q * 17 + tile.coord.r * 11) % 6) + 6) % 6 * Math.PI / 6;
    const cosine = Math.cos(bearing);
    const sine = Math.sin(bearing);
    for (let parcelIndex = 0; parcelIndex < PARCEL_LAYOUT.length; parcelIndex++) {
      const layout = PARCEL_LAYOUT[parcelIndex]!;
      const seed = hashString(`${tile.id}:parcel:${parcelIndex}`);
      const width = layout.width * (0.92 + (seed % 17) / 100);
      const depth = layout.depth * (0.9 + ((seed >> 4) % 15) / 100);
      const halfWidth = 0.007 + (seed % 3) * 0.001;
      const corners: Array<[number, number]> = [
        [layout.centerX - width * 0.5, layout.centerZ - depth * 0.5],
        [layout.centerX + width * 0.5, layout.centerZ - depth * 0.5],
        [layout.centerX + width * 0.5, layout.centerZ + depth * 0.5],
        [layout.centerX - width * 0.5, layout.centerZ + depth * 0.5],
      ];

      for (let edge = 0; edge < 4; edge++) {
        const start = corners[edge]!;
        const end = corners[(edge + 1) % 4]!;
        const localDx = end[0] - start[0];
        const localDz = end[1] - start[1];
        const localLength = Math.max(0.001, Math.hypot(localDx, localDz));
        const localPerpX = -localDz / localLength;
        const localPerpZ = localDx / localLength;
        const base = positions.length / 3;
        for (let segment = 0; segment <= edgeSegments; segment++) {
          const t = segment / edgeSegments;
          const wobble = Math.sin(t * Math.PI * 2 + seed * 0.001 + edge) * 0.004;
          const localX = THREE.MathUtils.lerp(start[0], end[0], t) + localPerpX * wobble;
          const localZ = THREE.MathUtils.lerp(start[1], end[1], t) + localPerpZ * wobble;
          for (const side of [-1, 1]) {
            const offsetX = localX + localPerpX * halfWidth * side;
            const offsetZ = localZ + localPerpZ * halfWidth * side;
            const worldX = origin.x + cosine * offsetX + sine * offsetZ;
            const worldZ = origin.z - sine * offsetX + cosine * offsetZ;
            const normal = surface.sampleNormal(worldX, worldZ);
            positions.push(worldX, surface.sampleHeight(worldX, worldZ) + 0.014, worldZ);
            normals.push(normal.x, normal.y, normal.z);
          }
        }
        for (let segment = 0; segment < edgeSegments; segment++) {
          const a = base + segment * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function seasonalWheatTint(season: string): string {
  if (season === 'spring') return '#c5c9ae';
  if (season === 'autumn') return '#dcc59d';
  return '#eee2c8';
}

/** Structured farm parcels that replace the former overlapping circular decals. */
export function AgriculturalParcels({ tilesById, season }: AgriculturalParcelsProps) {
  const quality = useRenderQuality();
  const surface = useSurfaceHeight();
  const plainsTiles = useMemo(
    () => [...tilesById.values()].filter((tile) => tile.terrain === 'plains').sort((a, b) => a.id.localeCompare(b.id)),
    [tilesById],
  );
  const wheatGeometry = useMemo(
    () => buildParcelGeometry(plainsTiles, surface, 'wheat', season),
    [plainsTiles, season, surface],
  );
  const ploughedGeometry = useMemo(
    () => buildParcelGeometry(plainsTiles, surface, 'ploughed', season),
    [plainsTiles, season, surface],
  );
  const borderGeometry = useMemo(
    () => buildBorderGeometry(plainsTiles, surface),
    [plainsTiles, surface],
  );

  const wheatTextures = useMemo(() => ({
    albedo: loadAuthoredTexture(textureSet('wheat_rows', 'albedo'), quality.textureTier),
    normal: loadAuthoredTexture(textureSet('wheat_rows', 'normal'), quality.textureTier),
    roughness: loadAuthoredTexture(textureSet('wheat_rows', 'roughness'), quality.textureTier),
    ao: loadAuthoredTexture(textureSet('wheat_rows', 'ao'), quality.textureTier),
  }), [quality.textureTier]);
  const ploughedTextures = useMemo(() => ({
    albedo: loadAuthoredTexture(textureSet('ploughed_field', 'albedo'), quality.textureTier),
    normal: loadAuthoredTexture(textureSet('ploughed_field', 'normal'), quality.textureTier),
    roughness: loadAuthoredTexture(textureSet('ploughed_field', 'roughness'), quality.textureTier),
    ao: loadAuthoredTexture(textureSet('ploughed_field', 'ao'), quality.textureTier),
  }), [quality.textureTier]);

  const wheatMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: wheatTextures.albedo,
    normalMap: wheatTextures.normal,
    normalScale: new THREE.Vector2(0.46, 0.46),
    roughnessMap: wheatTextures.roughness,
    aoMap: wheatTextures.ao,
    aoMapIntensity: 0.5,
    color: seasonalWheatTint(season),
    roughness: 0.94,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -1.5,
  }), [season, wheatTextures]);
  const ploughedMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: ploughedTextures.albedo,
    normalMap: ploughedTextures.normal,
    normalScale: new THREE.Vector2(0.52, 0.52),
    roughnessMap: ploughedTextures.roughness,
    aoMap: ploughedTextures.ao,
    aoMapIntensity: 0.58,
    color: season === 'spring' ? '#c2b6a5' : '#d2c2ae',
    roughness: 0.97,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1.35,
    polygonOffsetUnits: -1.35,
  }), [ploughedTextures, season]);
  const borderMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: season === 'autumn' ? '#665f49' : '#59604a',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), [season]);

  useEffect(() => () => {
    wheatGeometry.dispose();
    ploughedGeometry.dispose();
    borderGeometry.dispose();
    wheatMaterial.dispose();
    ploughedMaterial.dispose();
    borderMaterial.dispose();
  }, [borderGeometry, borderMaterial, ploughedGeometry, ploughedMaterial, wheatGeometry, wheatMaterial]);

  if (season === 'winter' || plainsTiles.length === 0) return null;
  return (
    <group>
      <mesh geometry={ploughedGeometry} material={ploughedMaterial} receiveShadow raycast={() => undefined} />
      <mesh geometry={wheatGeometry} material={wheatMaterial} receiveShadow raycast={() => undefined} />
      <mesh geometry={borderGeometry} material={borderMaterial} receiveShadow raycast={() => undefined} renderOrder={2} />
    </group>
  );
}

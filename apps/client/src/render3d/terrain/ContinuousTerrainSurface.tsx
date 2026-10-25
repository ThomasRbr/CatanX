import { useEffect, useMemo } from 'react';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { cubeToWorld } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';
import { getClimateVisualPreset, mixHex } from '../utils/seasonVisuals';
import { TERRAIN_BASE_COLORS } from './TerrainCatalog';
import { getTerrainTopSurface } from './terrainTopSurface';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { getAuthoredBiomeTextures } from './authoredPbrTextures';
import { getProceduralPbrTextures } from './proceduralPbrTextures';
import { attachBiomeBlendPbr, type BiomeBlendPbrTextures } from './biomeBlendPbr';
import type { SurfaceHeightSampler } from './BoardHeightfield';
import { useSurfaceHeight } from './SurfaceHeightContext';

interface ContinuousTerrainSurfaceProps {
  tiles: readonly HexTile[];
  season: string;
  climateId?: string | null;
}

interface LandTileSample {
  tile: HexTile;
  x: number;
  z: number;
  color: THREE.Color;
  materialFamily: number;
}

const SOURCE_OVERSIZE_COMPENSATION = 1 / 1.015;

/** meadow, wheat, rock, clay, sand, forest floor */
export function terrainMaterialFamily(terrain: HexTile['terrain']): 0 | 1 | 2 | 3 | 4 | 5 {
  if (terrain === 'plains') return 1;
  if (terrain === 'mountain' || terrain === 'goldmine' || terrain === 'glacier') return 2;
  if (terrain === 'hill' || terrain === 'ruins' || terrain === 'volcano' || terrain === 'sacred') return 3;
  if (terrain === 'desert' || terrain === 'coast') return 4;
  if (terrain === 'forest' || terrain === 'jungle' || terrain === 'swamp') return 5;
  return 0;
}

/**
 * Gaussian width of the biome blend, in world units squared.
 *
 * Adjacent hex centres sit √3 ≈ 1.73 apart, so a tile's own centre is 0 away
 * and its six neighbours are 3.0 away in squared distance. The previous value
 * of 6.2 gave each neighbour exp(-3/6.2) ≈ 0.62 against the tile's own 1.0 —
 * six neighbours therefore outvoted the tile itself almost four to one and
 * every biome converged on the same average mud. At 0.8 a neighbour scores
 * exp(-3/0.8) ≈ 0.024 at the centre and still reaches parity exactly on the
 * shared edge, which is where a soft frontier belongs.
 */
const BIOME_BLEND_SIGMA_SQ = 0.8;
/** Beyond this the Gaussian is below 1/1000 and cannot affect the normalised mix. */
const BIOME_BLEND_CUTOFF_SQ = 6;

function blendedBiomeWeights(samples: readonly LandTileSample[], x: number, z: number): [number, number, number, number, number, number] {
  const weights: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  let total = 0;
  // The warp keeps frontiers organic rather than straight hex edges. It is a
  // displacement of the sampling point, not a widening of the blend.
  const warpedX = x
    + Math.sin(z * 1.37 + Math.sin(x * 0.61)) * 0.3
    + Math.sin(z * 2.71 - x * 0.33) * 0.13;
  const warpedZ = z
    + Math.sin(x * 1.19 - Math.cos(z * 0.73)) * 0.3
    + Math.sin(x * 2.43 + z * 0.51) * 0.13;
  for (const sample of samples) {
    const dx = warpedX - sample.x;
    const dz = warpedZ - sample.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > BIOME_BLEND_CUTOFF_SQ) continue;
    const weight = Math.exp(-distanceSq / BIOME_BLEND_SIGMA_SQ);
    weights[sample.materialFamily] += weight;
    total += weight;
  }
  if (total <= 0) return [1, 0, 0, 0, 0, 0];
  return weights.map((weight) => weight / total) as [number, number, number, number, number, number];
}

/**
 * Share of glacier in the blend at a point. Glaciers sit in the rock family
 * for texture, but must read as ice: the shader lays permanent snow wherever
 * this weight is high.
 */
function glacierShare(samples: readonly LandTileSample[], x: number, z: number): number {
  let ice = 0;
  let total = 0;
  for (const sample of samples) {
    const dx = x - sample.x;
    const dz = z - sample.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > BIOME_BLEND_CUTOFF_SQ) continue;
    const weight = Math.exp(-distanceSq / BIOME_BLEND_SIGMA_SQ);
    total += weight;
    if (sample.tile.terrain === 'glacier') ice += weight;
  }
  return total > 0 ? ice / total : 0;
}

function buildContinuousGeometry(
  tiles: readonly HexTile[],
  heightfield: SurfaceHeightSampler,
): THREE.BufferGeometry {
  const samples: LandTileSample[] = tiles
    .filter((tile) => !isWaterTerrain(tile.terrain))
    .map((tile) => {
      const world = cubeToWorld(tile.coord);
      return {
        tile,
        x: world.x,
        z: world.z,
        color: new THREE.Color(TERRAIN_BASE_COLORS[tile.terrain]),
        materialFamily: terrainMaterialFamily(tile.terrain),
      };
    });

  const positions: number[] = [];
  const uvs: number[] = [];
  const biomeWeightsA: number[] = [];
  const biomeWeightSand: number[] = [];
  const biomeWeightForest: number[] = [];
  const biomeWeightIce: number[] = [];

  for (const sample of samples) {
    const source = getTerrainTopSurface(sample.tile.terrain);
    const position = source.getAttribute('position');
    const yaw = ((hashString(sample.tile.id) % 6) * Math.PI) / 3;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);

    for (let index = 0; index < position.count; index++) {
      const localX = position.getX(index) * SOURCE_OVERSIZE_COMPENSATION;
      const localZ = position.getZ(index) * SOURCE_OVERSIZE_COMPENSATION;
      const worldX = sample.x + cosine * localX + sine * localZ;
      const worldZ = sample.z - sine * localX + cosine * localZ;
      positions.push(worldX, heightfield.sampleHeight(worldX, worldZ), worldZ);

      uvs.push(worldX * 0.22, worldZ * 0.22);
      const weights = blendedBiomeWeights(samples, worldX, worldZ);
      biomeWeightsA.push(weights[0], weights[1], weights[2], weights[3]);
      biomeWeightSand.push(weights[4]);
      biomeWeightForest.push(weights[5]);
      biomeWeightIce.push(glacierShare(samples, worldX, worldZ));
    }
  }

  // No `color` attribute: the material runs with `vertexColors: false` because
  // the authored albedo carries the biome colour. Building one cost a second
  // O(vertices × tiles) pass whose result was never sampled.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('biomeWeightsA', new THREE.Float32BufferAttribute(biomeWeightsA, 4));
  geometry.setAttribute('biomeWeightSand', new THREE.Float32BufferAttribute(biomeWeightSand, 1));
  geometry.setAttribute('biomeWeightForest', new THREE.Float32BufferAttribute(biomeWeightForest, 1));
  geometry.setAttribute('biomeWeightIce', new THREE.Float32BufferAttribute(biomeWeightIce, 1));
  // The source is authored per logical region, but the visual surface must be
  // one island. Welding identical border vertices removes the hard six-sided
  // normal breaks while preserving invisible rule hitboxes.
  const welded = mergeVertices(geometry, 0.0001);
  geometry.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  welded.computeBoundingSphere();
  return welded;
}

function seasonalMaterialTint(season: string): string {
  if (season === 'winter') return '#d7dedf';
  if (season === 'autumn') return '#d4b487';
  if (season === 'spring') return '#eef6e9';
  return '#ffffff';
}

/** A single visual skin for every land biome. Rules still use invisible hexes. */
export function ContinuousTerrainSurface({
  tiles,
  season,
  climateId = null,
}: ContinuousTerrainSurfaceProps) {
  const quality = useRenderQuality();
  const heightfield = useSurfaceHeight();
  const geometry = useMemo(
    () => buildContinuousGeometry(tiles, heightfield),
    [heightfield, tiles],
  );
  const macroAlbedo = useMemo(() => {
    const texture = new THREE.TextureLoader().load(
      '/assets/textures/terrain/catanx/temperate_macro_albedo_v1.png',
    );
    texture.name = 'CatanX temperate macro albedo v1';
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 12;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, []);
  const climate = getClimateVisualPreset(climateId);
  const textures = useMemo(() => {
    // Board-scale biome blend does not resolve 4k texel detail — cap at 2k to
    // cut bandwidth while settlements / props keep the Ultra 4k tier.
    const terrainTier = quality.textureTier === '4k' ? '2k' : quality.textureTier;
    const meadow = getAuthoredBiomeTextures('pasture', terrainTier);
    const forest = getAuthoredBiomeTextures('forest', terrainTier);
    const wheat = getAuthoredBiomeTextures('plains', terrainTier);
    const rock = getAuthoredBiomeTextures('mountain', terrainTier);
    const clay = getAuthoredBiomeTextures('hill', terrainTier);
    const sand = getAuthoredBiomeTextures('desert', terrainTier);
    const fallback = getProceduralPbrTextures('pasture', terrainTier);

    // Only what the shader actually samples. Building the full 6×4 grid meant
    // uploading twelve textures — every roughness and AO but pasture's, and the
    // wheat / clay / sand normals — that no sampler ever reads.
    return {
      albedo: {
        meadow: meadow.albedo ?? fallback.albedo,
        forest: forest.albedo ?? fallback.albedo,
        wheat: wheat.albedo ?? fallback.albedo,
        rock: rock.albedo ?? fallback.albedo,
        clay: clay.albedo ?? fallback.albedo,
        sand: sand.albedo ?? fallback.albedo,
      },
      normal: {
        meadow: meadow.normal ?? fallback.normal,
        forest: forest.normal ?? fallback.normal,
        rock: rock.normal ?? fallback.normal,
      },
      roughness: meadow.roughness ?? fallback.roughness,
      ao: meadow.ao ?? fallback.roughness,
    } satisfies BiomeBlendPbrTextures;
  }, [quality.textureTier]);
  const material = useMemo(() => {
    // MeshStandard, not MeshPhysical. The island surface covers most of the
    // frame, and Physical evaluates clearcoat, sheen, iridescence and
    // transmission branches on every one of those fragments. The only feature
    // it was using here was a clearcoat of 0.012 (0.24 in rain), which is
    // cheaper and just as convincing as a roughness drop.
    const result = new THREE.MeshStandardMaterial({
      color: mixHex(
        seasonalMaterialTint(season),
        climate?.terrainTint ?? '#ffffff',
        climate?.terrainTintStrength ?? 0,
      ),
      // Authored albedo maps already carry their physically based colour.
      // Multiplying them by the legacy biome vertex palette crushed the
      // luminance (especially pasture/forest) and made the island nearly black.
      vertexColors: false,
      map: textures.albedo.meadow,
      normalMap: textures.normal.meadow,
      // The scanned normals carry real relief, unlike the luminance-derived
      // maps they replace, so they no longer need to be flattened to hide it.
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: textures.roughness,
      aoMap: textures.ao,
      aoMapIntensity: 0.68,
      // Rain reads as a wet sheen: drop roughness instead of adding a lobe.
      roughness: THREE.MathUtils.clamp(
        (climate?.particle === 'rain' ? 0.74 : 0.95) + (climate?.roughnessDelta ?? 0),
        0.28,
        1,
      ),
      metalness: 0.006,
      flatShading: false,
    });
    attachBiomeBlendPbr(result, textures, 0.72, season === 'winter' ? 0.48 : 0, macroAlbedo);
    return result;
  }, [climate, macroAlbedo, season, textures]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  useEffect(() => () => macroAlbedo.dispose(), [macroAlbedo]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
      castShadow={false}
      raycast={() => undefined}
    />
  );
}

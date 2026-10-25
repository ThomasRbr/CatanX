import { useEffect, useMemo } from 'react';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { cubeToWorld } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';
import { useSurfaceHeight } from './SurfaceHeightContext';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { getAuthoredBiomeTextures } from './authoredPbrTextures';
import { attachWorldProjectedPbr } from './worldProjectedPbr';

interface MountainRidgeNetworkProps {
  tiles: readonly HexTile[];
  season?: string;
}

const PEAK = new Set(['mountain', 'goldmine', 'volcano']);
const FOOTHILL = new Set(['hill', 'tundra', 'glacier']);

function adjacent(a: HexTile, b: HexTile): boolean {
  return Math.max(
    Math.abs(a.coord.q - b.coord.q),
    Math.abs(a.coord.r - b.coord.r),
    Math.abs(a.coord.s - b.coord.s),
  ) === 1;
}

function ridgePairs(tiles: readonly HexTile[]): Array<[HexTile, HexTile]> {
  const out: Array<[HexTile, HexTile]> = [];
  for (let a = 0; a < tiles.length; a++) {
    const first = tiles[a]!;
    if (!PEAK.has(first.terrain)) continue;
    for (let b = a + 1; b < tiles.length; b++) {
      const second = tiles[b]!;
      if (!adjacent(first, second)) continue;
      if (PEAK.has(second.terrain) || FOOTHILL.has(second.terrain)) out.push([first, second]);
    }
  }
  return out;
}

function hashNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 0.017) * 43758.5453123;
  return value - Math.floor(value);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hashNoise(x0, y0, seed);
  const b = hashNoise(x0 + 1, y0, seed);
  const c = hashNoise(x0, y0 + 1, seed);
  const d = hashNoise(x0 + 1, y0 + 1, seed);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, sx),
    THREE.MathUtils.lerp(c, d, sx),
    sy,
  );
}

function ridgeFbm(x: number, y: number, seed: number): number {
  return smoothNoise(x, y, seed) * 0.52
    + smoothNoise(x * 2.07 + 9.2, y * 2.07 - 4.1, seed + 19) * 0.3
    + smoothNoise(x * 4.31 - 2.7, y * 4.31 + 7.4, seed + 43) * 0.18;
}

function createRidgeGeometry(
  first: HexTile,
  second: HexTile,
  sampleHeight: (x: number, z: number) => number,
  resolution: number,
): THREE.BufferGeometry {
  const a = cubeToWorld(first.coord);
  const b = cubeToWorld(second.coord);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const sideX = -dz / length;
  const sideZ = dx / length;
  const seed = hashString(`${first.id}|${second.id}`);
  const ridgeStrength = PEAK.has(second.terrain) ? 1 : 0.38;
  const positions: number[] = [];
  const fades: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const steps = Math.max(5, resolution);
  const crossSteps = Math.max(12, Math.round(resolution * 0.72));

  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const taper = Math.sin(Math.PI * t);
    const lineNoise = ridgeFbm(t * 4.2, 0.37, seed) - 0.5;
    const wobble = (
      lineNoise * 0.14
      + Math.sin(t * Math.PI * 2.1 + seed * 0.001) * 0.025
    ) * taper;
    const cx = THREE.MathUtils.lerp(a.x, b.x, t) + sideX * wobble;
    const cz = THREE.MathUtils.lerp(a.z, b.z, t) + sideZ * wobble;
    const boundaryVariation = 0.9 + ridgeFbm(t * 5.8, 3.6, seed + 71) * 0.22;
    // A narrow rocky spine sits on a much broader heightfield shoulder. The
    // three irregular peak pulses avoid both a single cone and the inflated
    // plateau silhouette of the previous implementation.
    const width = (0.39 + taper * (0.1 + (seed % 7) * 0.006)) * boundaryVariation;
    const triangularPeak = (center: number, radius: number) => Math.pow(
      Math.max(0, 1 - Math.abs(t - center) / radius),
      0.72,
    );
    const peakA = triangularPeak(0.22 + (seed % 5) * 0.012, 0.19);
    const peakB = triangularPeak(0.5 + (seed % 3 - 1) * 0.018, 0.18);
    const peakC = triangularPeak(0.78 - (seed % 7) * 0.008, 0.2);
    const crestNoise = 0.82 + ridgeFbm(t * 9.5, 8.2, seed + 103) * 0.34;
    const peakTrain = 0.38 + Math.max(peakA * 0.76, peakB, peakC * 0.86);
    const ridgeHeight = Math.pow(taper, 0.58)
      * (0.31 + (seed % 11) * 0.0055)
      * peakTrain
      * crestNoise
      * ridgeStrength;
    const crestOffset = (ridgeFbm(t * 7.2, 12.4, seed + 137) - 0.5) * 0.13;
    const steepSide = (seed & 1) === 0 ? 1 : -1;
    for (let cross = 0; cross <= crossSteps; cross++) {
      const u = cross / crossSteps * 2 - 1;
      const shiftedU = THREE.MathUtils.clamp(u - crestOffset, -1, 1);
      const sideDistance = Math.abs(shiftedU) / (shiftedU * steepSide > 0 ? 0.82 : 1.08);
      const normalizedDistance = THREE.MathUtils.clamp(sideDistance, 0, 1);
      const linearFace = Math.max(0, 1 - normalizedDistance);
      const shoulderExponent = shiftedU * steepSide > 0 ? 0.92 : 0.7;
      const shoulder = Math.pow(linearFace, shoulderExponent);
      const crag = Math.pow(linearFace, shiftedU * steepSide > 0 ? 2.7 : 2.15);
      const profile = shoulder * 0.68 + crag * 0.32;
      const vertexX = cx + sideX * width * u;
      const vertexZ = cz + sideZ * width * u;
      const base = sampleHeight(vertexX, vertexZ);
      const cragNoise = ridgeFbm(t * 13.8 + u * 1.7, u * 8.6, seed + 211) - 0.5;
      const fracture = cragNoise * 0.038 * profile * taper;
      // Narrow drainage channels originate below the crest and widen toward
      // the talus. They break specular highlights into geological facets.
      const drainage = ridgeFbm(t * 10.4 + Math.abs(u) * 2.1, 21.3, seed + 307);
      const gully = Math.pow(Math.max(0, drainage - 0.62) / 0.38, 2)
        * 0.045
        * shoulder
        * Math.pow(Math.abs(u), 0.62)
        * taper;
      const asymmetry = shiftedU * steepSide * 0.022 * taper;
      const talusNoise = (ridgeFbm(t * 17.5, u * 13.2, seed + 401) - 0.5)
        * 0.016
        * (1 - crag)
        * shoulder;
      // Sink the complete perimeter below the heightfield. This removes the
      // straight material seam that previously exposed the ridge as a blanket.
      const buriedPerimeter = Math.pow(1 - profile, 2) * 0.09
        + Math.pow(1 - taper, 2) * 0.065;
      const y = base
        + ridgeHeight * profile
        + fracture
        + asymmetry
        + talusNoise
        - gully
        - buriedPerimeter;
      positions.push(vertexX, y, vertexZ);
      fades.push(THREE.MathUtils.smoothstep(profile * Math.pow(taper, 0.5), 0.055, 0.78));
      uvs.push(t * length, cross / crossSteps);
      if (index > 0 && cross > 0) {
        const row = crossSteps + 1;
        const a0 = (index - 1) * row + cross - 1;
        const a1 = a0 + 1;
        const b0 = index * row + cross - 1;
        const b1 = b0 + 1;
        indices.push(a0, b0, a1, b0, b1, a1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('ridgeFade', new THREE.Float32BufferAttribute(fades, 1));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Geological bridges that make adjacent mountain biomes read as one range. */
export function MountainRidgeNetwork({ tiles, season = 'summer' }: MountainRidgeNetworkProps) {
  const surface = useSurfaceHeight();
  const quality = useRenderQuality();
  const textures = getAuthoredBiomeTextures('mountain', quality.textureTier);
  const pairs = useMemo(() => ridgePairs(tiles), [tiles]);
  const geometries = useMemo(
    () => pairs.map(([a, b]) => createRidgeGeometry(
      a,
      b,
      (x, z) => surface.sampleHeight(x, z),
      quality.id === 'ultra' ? 38 : quality.id === 'high' ? 28 : quality.id === 'balanced' ? 20 : 12,
    )),
    [pairs, quality.id, surface],
  );
  const material = useMemo(() => {
    const result = new THREE.MeshStandardMaterial({
      color: season === 'winter' ? '#e6e9e7' : '#ffffff',
      vertexColors: false,
      map: textures.albedo,
      normalMap: textures.normal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughnessMap: textures.roughness,
      aoMap: textures.ao,
      aoMapIntensity: 0.7,
      roughness: season === 'winter' ? 0.82 : 0.94,
      metalness: 0.025,
      emissive: season === 'winter' ? '#3c4144' : '#625e56',
      emissiveMap: textures.albedo,
      emissiveIntensity: season === 'winter' ? 0.06 : 0.052,
      flatShading: false,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.025,
    });
    // Match the rock sampling frequency used by ContinuousTerrainSurface:
    // 0.72 world scale * 0.74 rock scale / 1.46 texture repeat.
    attachWorldProjectedPbr(result, 0.365);
    const applyWorldProjection = result.onBeforeCompile;
    const worldProjectionKey = result.customProgramCacheKey;
    result.onBeforeCompile = (shader, renderer) => {
      applyWorldProjection.call(result, shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          `attribute float ridgeFade;
          varying float vCatanxRidgeFade;
          void main() {`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vCatanxRidgeFade = ridgeFade;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `varying float vCatanxRidgeFade;
          void main() {`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.a *= smoothstep(0.02, 0.96, vCatanxRidgeFade);`,
        );
    };
    result.customProgramCacheKey = () => `${worldProjectionKey.call(result)}:ridge-fade-v1`;
    return result;
  }, [season, textures.albedo, textures.ao, textures.normal, textures.roughness]);

  useEffect(() => () => {
    for (const geometry of geometries) geometry.dispose();
    material.dispose();
  }, [geometries, material]);

  if (geometries.length === 0) return null;
  return (
    <group raycast={() => undefined}>
      {geometries.map((geometry, index) => (
        <mesh
          key={`${pairs[index]![0].id}-${pairs[index]![1].id}`}
          geometry={geometry}
          material={material}
          // The visible ridge is feathered by a custom alpha varying. Three's
          // default shadow-depth pass cannot see that varying and used to cast
          // the complete buried strip as enormous black triangles across the
          // ocean. The continuous heightfield below still supplies the massif
          // silhouette, while received light, AO and normal shading ground it.
          castShadow={false}
          receiveShadow
          raycast={() => undefined}
        />
      ))}
    </group>
  );
}

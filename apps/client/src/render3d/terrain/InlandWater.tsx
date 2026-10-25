import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { hexNeighbor, hexToId, type HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { normalizeSeason } from '../utils/seasonVisuals';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { resolveAtmosphere } from '../env/atmosphere';
import { SKY_COLOR_FUNCTION, SKY_UNIFORM_DECLARATIONS } from '../env/skyGlsl';
import { useSurfaceHeight } from './SurfaceHeightContext';

interface InlandWaterProps {
  tiles: readonly HexTile[];
  season?: string;
  climateId?: string | null;
  cinematic?: boolean;
  animate?: boolean;
}

/**
 * Water terrain enclosed by land. `coast` is deliberately excluded: those tiles
 * sit on the island perimeter, where the ocean already reaches them, and giving
 * them their own surface produced hex slabs floating out over the sea.
 */
const INLAND_WATER = new Set(['lake', 'river']);

/** How far the lake sits below the land that surrounds it. */
const BANK_DROP = 0.055;

const VERTEX = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
uniform float uFrozen;
varying vec3 vWorldPosition;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y += (1.0 - uFrozen) * sin(world.x * 2.4 + uTime * 0.9) * 0.004
           + (1.0 - uFrozen) * sin(world.z * 3.1 - uTime * 0.7) * 0.003;
  vWorldPosition = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
${SKY_UNIFORM_DECLARATIONS}
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
/** 0 = open water, 1 = frozen lake (winter). */
uniform float uFrozen;
varying vec3 vWorldPosition;

${SKY_COLOR_FUNCTION}

float catanxLakeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float catanxLakeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(catanxLakeHash(i), catanxLakeHash(i + vec2(1.0, 0.0)), u.x),
    mix(catanxLakeHash(i + vec2(0.0, 1.0)), catanxLakeHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 p = vWorldPosition.xz;

  // Sheltered water: short, fine ripples rather than open-sea swell.
  vec2 r1 = p * 6.5 + vec2(uTime * 0.16, -uTime * 0.12);
  vec2 r2 = p * 13.0 - vec2(uTime * 0.11, uTime * 0.19);
  float n1 = catanxLakeNoise(r1);
  float n2 = catanxLakeNoise(r2);
  vec2 slope = vec2(
    (catanxLakeNoise(r1 + vec2(0.1, 0.0)) - n1) * 1.1 + (catanxLakeNoise(r2 + vec2(0.1, 0.0)) - n2) * 0.5,
    (catanxLakeNoise(r1 + vec2(0.0, 0.1)) - n1) * 1.1 + (catanxLakeNoise(r2 + vec2(0.0, 0.1)) - n2) * 0.5
  );
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float cosTheta = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);

  vec3 reflectDirection = reflect(-viewDirection, normal);
  reflectDirection.y = abs(reflectDirection.y);
  vec3 reflection = catanxSkyColor(reflectDirection);

  // Still water is darker than open sea and reflects more of the sky.
  vec3 body = mix(uDeep, uShallow, catanxLakeNoise(p * 0.7) * 0.5 + 0.25);
  vec3 color = mix(body, reflection, clamp(fresnel * 1.6, 0.0, 0.72));

  if (uFrozen > 0.001) {
    // Winter ice: milky blue-white sheet, darker clear patches, a web of
    // pressure cracks and frost dust; it reflects the sky only faintly.
    float cloud = catanxLakeNoise(p * 2.2) * 0.6 + catanxLakeNoise(p * 7.0) * 0.4;
    vec3 ice = mix(vec3(0.62, 0.76, 0.84), vec3(0.88, 0.94, 0.97), smoothstep(0.3, 0.75, cloud));
    float crackA = abs(catanxLakeNoise(p * 5.3 + 3.1) - 0.5);
    float crackB = abs(catanxLakeNoise(p * 11.0 - 7.7) - 0.5);
    float cracks = (1.0 - smoothstep(0.0, 0.035, crackA)) * 0.55 + (1.0 - smoothstep(0.0, 0.02, crackB)) * 0.3;
    ice = mix(ice, vec3(0.42, 0.58, 0.68), cracks);
    float frost = smoothstep(0.62, 0.9, catanxLakeNoise(p * 18.0));
    ice = mix(ice, vec3(0.97, 0.99, 1.0), frost * 0.5);
    vec3 iceColor = mix(ice, reflection, clamp(fresnel * 0.6, 0.0, 0.25));
    float glint = pow(max(dot(vec3(0.0, 1.0, 0.0), normalize(normalize(uSunDirection) + viewDirection)), 0.0), 60.0);
    iceColor += uSunColor * glint * 0.35;
    color = mix(color, iceColor, uFrozen);
  }

  vec3 halfVector = normalize(normalize(uSunDirection) + viewDirection);
  color += uSunColor * pow(max(dot(normal, halfVector), 0.0), 300.0) * 2.2;

  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Lakes and rivers inside the island.
 *
 * The Diorama renderer draws land through `ContinuousTerrainSurface`, which
 * filters water terrain out. Nothing else covered those tiles, so every inland
 * lake was a hex-shaped hole: the camera looked straight through the island and
 * saw the ocean — complete with shoreline foam, because the shore field reads
 * near-zero distance there. On screen that became a flat pale slab that looked
 * like a concrete plateau rather than water.
 */
export function InlandWater({
  tiles,
  season = 'spring',
  climateId = null,
  cinematic = false,
  animate = true,
}: InlandWaterProps) {
  const surface = useSurfaceHeight();
  const ambient = useAmbientAnimation();
  const normalizedSeason = normalizeSeason(season);

  const grade = useMemo(
    () => resolveAtmosphere({ season: normalizedSeason, climateId, cinematic }),
    [cinematic, climateId, normalizedSeason],
  );

  const waterTiles = useMemo(() => {
    const byId = new Map(tiles.map((tile) => [tile.id, tile]));
    return tiles.filter((tile) => {
      if (!INLAND_WATER.has(tile.terrain)) return false;
      // Only truly enclosed water gets its own surface. A lake that touches the
      // open sea is already covered by the ocean, and giving it a separate
      // surface pinned to the surrounding land height floats a pale hex slab
      // out over the water.
      for (const direction of [0, 1, 2, 3, 4, 5] as const) {
        const neighbour = byId.get(hexToId(hexNeighbor(tile.coord, direction)));
        if (!neighbour || neighbour.terrain === 'ocean' || neighbour.terrain === 'coast') {
          return false;
        }
      }
      return true;
    });
  }, [tiles]);

  const geometry = useMemo(() => {
    if (waterTiles.length === 0) return null;
    const positions: number[] = [];
    const indices: number[] = [];

    for (const tile of waterTiles) {
      const origin = cubeToWorld(tile.coord);
      // The banks are land, so take the surrounding terrain height and sit
      // just under it. Sampling the tile centre would return the water level
      // the heightfield reserves for water and leave a visible step.
      let bank = 0;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        bank += surface.sampleHeight(
          origin.x + Math.cos(angle) * HEX_WORLD_RADIUS * 1.08,
          origin.z + Math.sin(angle) * HEX_WORLD_RADIUS * 1.08,
        );
      }
      const y = bank / 6 - BANK_DROP;

      // Slightly oversized so the surface tucks under the banks instead of
      // leaving a seam of ocean visible at the rim.
      const radius = HEX_WORLD_RADIUS * 1.04;
      const base = positions.length / 3;
      positions.push(origin.x, y, origin.z);
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        positions.push(origin.x + Math.cos(angle) * radius, y, origin.z + Math.sin(angle) * radius);
      }
      for (let i = 0; i < 6; i++) {
        // Wound so the geometric normal points at +Y.
        indices.push(base, base + 1 + ((i + 1) % 6), base + 1 + i);
      }
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    result.computeBoundingSphere();
    return result;
  }, [surface, waterTiles]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: grade.waterShallow.clone() },
      uDeep: { value: grade.waterMid.clone() },
      uFrozen: { value: normalizedSeason === 'winter' ? 1 : 0 },
      uZenith: { value: grade.zenith.clone() },
      uHorizon: { value: grade.horizon.clone() },
      uHaze: { value: grade.haze.clone() },
      uGroundBounce: { value: grade.groundBounce.clone() },
      uSunDirection: { value: grade.sunDirection.clone() },
      uSunColor: { value: grade.sunColor.clone() },
    }),
    // Built once; colours are animated towards the live grade each frame.
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          ...uniforms,
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        fog: true,
        toneMapped: true,
      }),
    [uniforms],
  );

  useEffect(
    () => () => {
      geometry?.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const gradeRef = useRef(grade);
  gradeRef.current = grade;

  useFrame((_, delta) => {
    if (animate) uniforms.uTime.value = ambient.time;
    const speed = Math.min(1, delta * 1.6);
    const target = gradeRef.current;
    uniforms.uShallow.value.lerp(target.waterShallow, speed);
    uniforms.uDeep.value.lerp(target.waterMid, speed);
    // Lakes freeze over and thaw gradually when the season turns.
    const frozen = normalizedSeason === 'winter' ? 1 : 0;
    uniforms.uFrozen.value += (frozen - uniforms.uFrozen.value) * Math.min(1, delta * 0.8);
    uniforms.uZenith.value.lerp(target.zenith, speed);
    uniforms.uHorizon.value.lerp(target.horizon, speed);
    uniforms.uHaze.value.lerp(target.haze, speed);
    uniforms.uGroundBounce.value.lerp(target.groundBounce, speed);
    uniforms.uSunColor.value.lerp(target.sunColor, speed);
    uniforms.uSunDirection.value.lerp(target.sunDirection, speed).normalize();
  });

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} raycast={() => undefined} />;
}

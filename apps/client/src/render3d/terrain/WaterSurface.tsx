import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import type { WorldBounds } from '../camera/fitOrthographicCamera';
import { useMapLod } from '../camera/MapLodContext';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { getClimateVisualPreset, normalizeSeason } from '../utils/seasonVisuals';
import { shouldAnimateDecor } from '../utils/mapLod';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { resolveAtmosphere } from '../env/atmosphere';
import { buildShoreField } from '../env/shoreField';
import { SKY_COLOR_FUNCTION, SKY_UNIFORM_DECLARATIONS } from '../env/skyGlsl';

interface WaterSurfaceProps {
  bounds: WorldBounds;
  tiles?: readonly HexTile[];
  season?: string;
  climateId?: string | null;
  cinematic?: boolean;
  animate?: boolean;
  onClearHover?: () => void;
}

/**
 * Radius the ocean reaches. It must clear the camera far plane so the water
 * always terminates in fog against the sky, never on a visible edge.
 */
const OCEAN_RADIUS = 780;

/**
 * Radially graded ocean disc.
 *
 * A uniform grid cannot do this job: fine enough for waves near the island
 * means millions of triangles out at the horizon. Ring radii grow
 * geometrically, so tessellation is dense where the camera looks and coarse
 * where only fog is visible.
 */
function buildOceanGeometry(innerRadius: number, rings: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const ratio = Math.pow(OCEAN_RADIUS / innerRadius, 1 / (rings - 1));

  // Centre vertex.
  positions.push(0, 0, 0);
  uvs.push(0, 0);

  for (let ring = 0; ring < rings; ring++) {
    const radius = innerRadius * Math.pow(ratio, ring);
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, 0, z);
      uvs.push(x, z);
    }
  }

  // Fan from the centre to the first ring.
  for (let segment = 0; segment < segments; segment++) {
    const a = 1 + segment;
    const b = 1 + ((segment + 1) % segments);
    indices.push(0, b, a);
  }

  // Winding matters: rings run outward with increasing angle, which puts the
  // geometric normal at -Y unless the two triangles are wound the other way.
  // Getting this backwards culls the entire ocean without any error.
  for (let ring = 0; ring < rings - 1; ring++) {
    const base = 1 + ring * segments;
    const next = base + segments;
    for (let segment = 0; segment < segments; segment++) {
      const s1 = (segment + 1) % segments;
      indices.push(base + segment, next + s1, next + segment);
      indices.push(base + segment, base + s1, next + s1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), OCEAN_RADIUS);
  return geometry;
}

/**
 * Gerstner (trochoidal) wave bank, shared by the vertex and fragment stages.
 *
 * A sum of sines makes symmetric humps: rounded crests, rounded troughs. Real
 * water is the opposite — water particles orbit rather than bob, which pinches
 * crests sharp and flattens troughs wide. Gerstner reproduces that by moving
 * points horizontally *towards* each crest as well as vertically, and it is the
 * single change that stops an ocean reading as a wobbling sheet.
 *
 * `steepness` (Q) controls the pinch. Above Q = 1/(w·A·waves) the surface
 * self-intersects and folds inside out, so the values here stay well under it.
 */
const GERSTNER = /* glsl */ `
struct CatanxWater {
  vec3 offset;
  vec3 normal;
  float crest;
};

// Written as explicit calls rather than a loop over a const array: three
// compiles this material as GLSL ES 1.00, which has no array constructors.
void catanxAccumWave(
  vec2 direction, float wavelength, float steepness, float amplitude,
  vec2 p, float t,
  inout vec3 offset, inout vec3 tangent, inout vec3 binormal, inout float jacobian
) {
  vec2 d = normalize(direction);
  float w = 6.28318530718 / wavelength;
  // Deep-water dispersion: longer waves travel faster, which is why a real sea
  // never settles into one repeating pattern.
  //
  // g is in world units, not metres. A hex spans two units and reads as roughly
  // a hundred metres of coastline, so using 9.8 directly made the swell cross a
  // whole tile in half a second — a rapid shimmer rather than an ocean.
  float speed = sqrt(0.34 / w);
  float q = steepness / max(1e-4, w * amplitude * 4.0);

  float phase = w * dot(d, p) + t * speed;
  float c = cos(phase);
  float s = sin(phase);
  float wa = w * amplitude;

  offset += vec3(q * amplitude * d.x * c, amplitude * s, q * amplitude * d.y * c);
  tangent += vec3(-q * d.x * d.x * wa * s, d.x * wa * c, -q * d.x * d.y * wa * s);
  binormal += vec3(-q * d.x * d.y * wa * s, d.y * wa * c, -q * d.y * d.y * wa * s);
  // Horizontal compression. Whitecaps form where the surface pinches, not
  // simply where it happens to be high.
  jacobian += q * wa * s;
}

CatanxWater catanxGerstner(vec2 p, float t, float scale) {
  // Amplitude decays with distance so the horizon stays flat and only the water
  // near the island visibly moves.
  float falloff = 1.0 / (1.0 + length(p) * 0.012);
  float a = falloff * scale;

  vec3 offset = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float jacobian = 0.0;

  // Steepness, not amplitude, is what the eye reads. In a Gerstner wave the
  // product q·A is fixed by steepness alone, so the surface normal — and
  // therefore every highlight on the water — is independent of how tall the
  // wave is. Amplitude only moves the silhouette.
  catanxAccumWave(vec2( 0.92,  0.39), 7.10, 0.88, 0.060 * a, p, t, offset, tangent, binormal, jacobian);
  catanxAccumWave(vec2(-0.54,  0.84), 4.30, 0.72, 0.042 * a, p, t, offset, tangent, binormal, jacobian);
  catanxAccumWave(vec2( 0.31, -0.95), 2.30, 0.54, 0.023 * a, p, t, offset, tangent, binormal, jacobian);
  catanxAccumWave(vec2(-0.88, -0.47), 1.30, 0.36, 0.012 * a, p, t, offset, tangent, binormal, jacobian);

  CatanxWater result;
  result.offset = offset;
  result.normal = normalize(cross(binormal, tangent));
  result.crest = clamp(jacobian, 0.0, 1.0);
  return result;
}
`;

const VERTEX = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
uniform float uWaveScale;
uniform sampler2D uShoreMap;
uniform vec2 uShoreOrigin;
uniform vec2 uShoreSize;
varying vec3 vWorldPosition;
varying float vWaveHeight;
varying float vWaveCrest;

${GERSTNER}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);

  // Waves shoal: as the bottom rises the swell loses height and calms. Without
  // this the open-sea amplitude keeps its full travel right up to the beach and
  // washes over the shoreline.
  vec2 shoreUv = (world.xz - uShoreOrigin) / uShoreSize;
  float shore = texture2D(uShoreMap, clamp(shoreUv, 0.0, 1.0)).r;
  float outside = step(1.0, max(abs(shoreUv.x - 0.5), abs(shoreUv.y - 0.5)) * 2.0);
  shore = mix(shore, 1.0, outside);
  float shoal = mix(0.28, 1.0, smoothstep(0.0, 0.3, shore));

  CatanxWater wave = catanxGerstner(world.xz, uTime, uWaveScale * shoal);
  world.xyz += wave.offset;
  vWorldPosition = world.xyz;
  vWaveHeight = wave.offset.y;
  vWaveCrest = wave.crest;

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
uniform float uWaveScale;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform sampler2D uShoreMap;
uniform vec2 uShoreOrigin;
uniform vec2 uShoreSize;
uniform float uFoamStrength;
uniform vec3 uScatter;
varying vec3 vWorldPosition;
varying float vWaveHeight;
varying float vWaveCrest;

${SKY_COLOR_FUNCTION}
${GERSTNER}

// Cheap value noise; used for the capillary detail that carries the sun glitter.
float catanxHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float catanxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(catanxHash(i), catanxHash(i + vec2(1.0, 0.0)), u.x),
    mix(catanxHash(i + vec2(0.0, 1.0)), catanxHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/**
 * Capillary ripple perturbation, layered on top of the Gerstner normal.
 *
 * The wave bank gives the surface its shape; these give it the fine texture
 * that carries the sun glitter. They fade with distance — kept everywhere they
 * turn the horizon into aliasing noise.
 */
vec3 catanxRippleNormal(vec2 p, float t, float detailFade) {
  vec2 r1 = p * 2.3 + vec2(t * 0.075, -t * 0.05);
  vec2 r2 = p * 5.7 - vec2(t * 0.058, t * 0.088);
  float n1 = catanxNoise(r1);
  float n2 = catanxNoise(r2);
  vec2 ripple = (
    vec2(catanxNoise(r1 + vec2(0.12, 0.0)) - n1, catanxNoise(r1 + vec2(0.0, 0.12)) - n1) * 1.5 +
    vec2(catanxNoise(r2 + vec2(0.12, 0.0)) - n2, catanxNoise(r2 + vec2(0.0, 0.12)) - n2) * 0.75
  ) * detailFade * uWaveScale;
  return normalize(vec3(-ripple.x, 1.0, -ripple.y));
}

void main() {
  vec2 p = vWorldPosition.xz;
  vec2 shoreUv = (p - uShoreOrigin) / uShoreSize;
  float shore = texture2D(uShoreMap, clamp(shoreUv, 0.0, 1.0)).r;
  // Outside the field's footprint the water is unconditionally open sea.
  float outside = step(1.0, max(abs(shoreUv.x - 0.5), abs(shoreUv.y - 0.5)) * 2.0);
  shore = mix(shore, 1.0, outside);

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float distanceToCamera = length(cameraPosition - vWorldPosition);
  float detailFade = 1.0 / (1.0 + distanceToCamera * 0.055);

  // Re-evaluate the wave bank per pixel. Interpolating the vertex normal across
  // a ring quad rounds off exactly the sharp crests Gerstner exists to produce.
  // The shoaling factor must match the vertex stage, or the shading would
  // describe a different surface than the one that was displaced.
  float shoal = mix(0.28, 1.0, smoothstep(0.0, 0.3, shore));
  CatanxWater wave = catanxGerstner(p, uTime, uWaveScale * shoal);
  vec3 rippleNormal = catanxRippleNormal(p, uTime, detailFade);
  vec3 normal = normalize(wave.normal + vec3(rippleNormal.x, 0.0, rippleNormal.z));

  // Depth grading follows the coast, not a circle around the board centre.
  vec3 body = mix(uShallow, uMid, smoothstep(0.0, 0.34, shore));
  body = mix(body, uDeep, smoothstep(0.28, 0.85, shore));

  vec3 sunDirection = normalize(uSunDirection);

  // Subsurface scattering. Where a crest rises between the eye and the sun, the
  // water is thin enough to transmit, and that back-lit green is most of what
  // makes real sea water look like a liquid rather than a mirror.
  float thickness = clamp(wave.offset.y / max(1e-4, 0.055 * uWaveScale * shoal), 0.0, 1.0);
  float backLight = pow(clamp(dot(viewDirection, -sunDirection) * 0.5 + 0.5, 0.0, 1.0), 4.0);
  float scatter = backLight * thickness * (1.0 - smoothstep(0.0, 0.5, shore) * 0.35);
  body += uScatter * scatter * 0.9;

  // Fresnel. At grazing angles the ocean is a mirror of the sky, which is what
  // makes the surface continue into the horizon instead of stopping at an edge.
  float cosTheta = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);

  vec3 reflectDirection = reflect(-viewDirection, normal);
  reflectDirection.y = abs(reflectDirection.y);
  vec3 reflection = catanxSkyColor(reflectDirection);

  vec3 color = mix(body, reflection, clamp(fresnel, 0.0, 0.82));

  // Sun glitter. A tight Blinn lobe on the perturbed normal is what reads as a
  // sparkling path across the water rather than one blown-out blob.
  vec3 halfVector = normalize(sunDirection + viewDirection);
  float specular = pow(max(dot(normal, halfVector), 0.0), 420.0);
  float broadSpecular = pow(max(dot(normal, halfVector), 0.0), 42.0);
  color += uSunColor * (specular * 3.4 + broadSpecular * 0.16) * detailFade;

  // Two foams. Crest foam follows the Jacobian, so it appears where the wave
  // pinches — the way a whitecap actually forms. Shore foam is a band at the
  // waterline, broken up so it never reads as a drawn outline.
  float foamNoise = catanxNoise(p * 3.1 + vec2(uTime * 0.35, -uTime * 0.28));
  // Tight threshold: whitecaps belong on the sharpest crests only. A wider band
  // spreads them into soft blobs that read as smudges on the water rather than
  // as breaking waves.
  float crestFoam = smoothstep(0.66, 0.95, wave.crest + foamNoise * 0.12) * detailFade;
  float shoreBand = 1.0 - smoothstep(0.0, 0.085, shore);
  float shoreFoam = clamp(shoreBand * (0.45 + smoothstep(0.02, 0.075, vWaveHeight + foamNoise * 0.045) * 0.55), 0.0, 1.0);
  float foam = clamp(max(shoreFoam, crestFoam * 0.7), 0.0, 1.0) * uFoamStrength;
  color = mix(color, vec3(0.86, 0.91, 0.92), foam * 0.72);

  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Continuous animated ocean reaching to the horizon.
 *
 * The previous surface was a 38-unit plane with fog disabled, so zooming out
 * revealed a dark rectangle floating in the void with all four edges visible.
 */
export function WaterSurface({
  bounds,
  tiles = [],
  season = 'spring',
  climateId = null,
  cinematic = false,
  animate = true,
  onClearHover,
}: WaterSurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lod = useMapLod();
  const quality = useRenderQuality();
  const ambient = useAmbientAnimation();
  const climateVisual = getClimateVisualPreset(climateId);
  const normalizedSeason = normalizeSeason(season);

  const grade = useMemo(
    () => resolveAtmosphere({ season: normalizedSeason, climateId, cinematic }),
    [cinematic, climateId, normalizedSeason],
  );

  const shore = useMemo(() => buildShoreField(tiles), [tiles]);
  useEffect(() => () => shore.dispose(), [shore]);

  const geometry = useMemo(() => {
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const inner = Math.max(0.6, span * 0.06);
    const rings = quality.waterQuality === 'advanced' ? 72 : quality.waterQuality === 'standard' ? 56 : 36;
    const segments = quality.waterQuality === 'advanced' ? 128 : quality.waterQuality === 'standard' ? 96 : 64;
    return buildOceanGeometry(inner, rings, segments);
  }, [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ, quality.waterQuality]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWaveScale: { value: climateVisual?.waterWaveMult ?? 1 },
      uShallow: { value: grade.waterShallow.clone() },
      uMid: { value: grade.waterMid.clone() },
      uDeep: { value: grade.waterDeep.clone() },
      uScatter: { value: grade.waterScatter.clone() },
      uZenith: { value: grade.zenith.clone() },
      uHorizon: { value: grade.horizon.clone() },
      uHaze: { value: grade.haze.clone() },
      uGroundBounce: { value: grade.groundBounce.clone() },
      uSunDirection: { value: grade.sunDirection.clone() },
      uSunColor: { value: grade.sunColor.clone() },
      uShoreMap: { value: shore.texture },
      uShoreOrigin: { value: shore.origin.clone() },
      uShoreSize: { value: shore.size.clone() },
      uFoamStrength: { value: normalizedSeason === 'winter' ? 0.8 : 1 },
    }),
    // Rebuilt only when the shore field changes; colours are animated below.
    [shore],
  );

  const material = useMemo(() => {
    // Spread rather than UniformsUtils.merge: merge deep-clones, which would
    // both duplicate the shore texture and detach the objects the frame loop
    // animates in place.
    return new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        ...uniforms,
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      fog: true,
      toneMapped: true,
    });
  }, [uniforms]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const pulse = shouldAnimateDecor(animate, lod);
  const gradeRef = useRef(grade);
  gradeRef.current = grade;

  useFrame((_, delta) => {
    if (pulse) uniforms.uTime.value = ambient.time;
    uniforms.uWaveScale.value = climateVisual?.waterWaveMult ?? 1;

    // Colours cross-fade so a season or climate change does not snap.
    const speed = Math.min(1, delta * 1.6);
    const target = gradeRef.current;
    uniforms.uShallow.value.lerp(target.waterShallow, speed);
    uniforms.uMid.value.lerp(target.waterMid, speed);
    uniforms.uDeep.value.lerp(target.waterDeep, speed);
    uniforms.uScatter.value.lerp(target.waterScatter, speed);
    uniforms.uZenith.value.lerp(target.zenith, speed);
    uniforms.uHorizon.value.lerp(target.horizon, speed);
    uniforms.uHaze.value.lerp(target.haze, speed);
    uniforms.uGroundBounce.value.lerp(target.groundBounce, speed);
    uniforms.uSunColor.value.lerp(target.sunColor, speed);
    uniforms.uSunDirection.value.lerp(target.sunDirection, speed).normalize();

    if (meshRef.current) {
      const targetY = -0.065 + (climateVisual?.waterLevelDelta ?? 0);
      meshRef.current.position.y += (targetY - meshRef.current.position.y) * 0.045;
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, -0.065 + (climateVisual?.waterLevelDelta ?? 0), 0]}
      frustumCulled={false}
      renderOrder={-100}
      onPointerDown={(event) => {
        if (event.button === 0) onClearHover?.();
      }}
    />
  );
}

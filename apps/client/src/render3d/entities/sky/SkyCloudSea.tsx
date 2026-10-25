import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AtmosphereGrade } from '../../env/atmosphere';
import { CLOUD_DECK_Y } from './skyLayout';
import { CLOUD_FIELD_SIZE, CLOUD_FIELD_TILE, cloudFieldTexture } from './cloudField';

/**
 * The sea of clouds below the floating islands.
 *
 * A single large plane lit as a height field read from a baked, tileable cloud
 * texture (see `cloudField.ts`): golden tops facing the low sun, lavender
 * shade, blue-violet gaps, a warm lining on thin edges and self-shadowing by
 * probing six steps towards the sun. Islands cast soft blue shadows on it,
 * projected analytically from the hub positions, so it costs no shadow map.
 */

export const MAX_CLOUD_SHADOWS = 32;

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FIELD = /* glsl */ `
uniform sampler2D uField;
uniform float uTime;
const float TILE = ${CLOUD_FIELD_TILE.toFixed(1)};
const float RELIEF = 1.1;
// Height of the cloud tops in world units. A second, much larger and slower
// sample of the same field modulates coverage, so the tile never visibly
// repeats and the deck gets broad gaps between dense banks.
float cloudHeight(vec2 p) {
  vec2 drift = uTime * vec2(0.03, 0.012);
  float h = texture2D(uField, (p + drift) / TILE).r;
  float region = texture2D(uField, (p * 0.37 - drift * 0.4) / TILE + vec2(0.37, 0.61)).r;
  float cover = smoothstep(0.0, 0.5, region + 0.28);
  return h * cover * RELIEF;
}
`;

const DECK_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec2 uSunXZ;
uniform float uSunSlope;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uDeep;
uniform vec3 uRim;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uShadows[${MAX_CLOUD_SHADOWS}];
uniform int uShadowCount;
uniform float uShadowStretch;
varying vec3 vWorld;

${FIELD}

void main() {
  vec2 p = vWorld.xz;
  vec3 toFrag = vWorld - cameraPosition;
  float viewDist = length(toFrag);

  float h = cloudHeight(p);
  float e = TILE / ${CLOUD_FIELD_SIZE.toFixed(1)};
  float hx = cloudHeight(p + vec2(e, 0.0));
  float hz = cloudHeight(p + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));

  // Self-shadow: does a cloud further towards the sun rise above the ray?
  float occ = -1.0;
  for (int i = 1; i <= 6; i++) {
    float probe = float(i) * float(i) * 0.03;
    occ = max(occ, cloudHeight(p + uSunXZ * probe) - (h + probe * uSunSlope));
  }
  // Gaps are a far lower layer: they take no crisp shadow from the banks.
  float selfShadow = smoothstep(-0.02, 0.22, occ) * smoothstep(0.04, 0.3, h / RELIEF);

  float ndl = dot(n, uSunDir);
  float wrap = clamp((ndl + 0.12) / 1.12, 0.0, 1.0);
  float light = wrap * (1.0 - selfShadow * 0.75);
  float hn = h / RELIEF;
  vec3 col = mix(uShade, uLit, light);
  // Gaps between the banks open onto a lower, hazier cloud layer.
  float lower = texture2D(uField, p / (TILE * 1.7) + vec2(0.53, 0.29) - uTime * 0.0006).r;
  vec3 gap = mix(uDeep, mix(uDeep, uShade, 0.55), smoothstep(0.15, 0.9, lower));
  col = mix(gap, col, smoothstep(0.04, 0.36, hn));
  // Soft occlusion in creases, brighter crowns.
  col *= mix(0.8, 1.04, smoothstep(0.3, 0.9, hn));
  // Golden lining on thin edges facing the sun.
  float edge = smoothstep(0.06, 0.26, hn) * (1.0 - smoothstep(0.26, 0.5, hn));
  col += uRim * edge * pow(max(ndl, 1e-4), 1.2) * 0.22;

  // Island shadows, stretched along the sun's azimuth.
  float hub = 0.0;
  vec2 across = vec2(-uSunXZ.y, uSunXZ.x);
  for (int i = 0; i < ${MAX_CLOUD_SHADOWS}; i++) {
    if (i >= uShadowCount) break;
    vec4 s = uShadows[i];
    vec2 d = p - s.xy;
    float dist = length(vec2(dot(d, uSunXZ) / uShadowStretch, dot(d, across)));
    hub = max(hub, (1.0 - smoothstep(s.z * 0.3, s.z * 1.35, dist)) * s.w);
  }
  col = mix(col, col * vec3(0.52, 0.6, 0.86), hub * (0.5 + 0.5 * hn));

  // Warmer towards the sun side of the frame, cooler away from it.
  float sunSide = dot(normalize(toFrag.xz), uSunXZ) * 0.5 + 0.5;
  col *= mix(vec3(0.94, 0.96, 1.04), vec3(1.06, 1.0, 0.92), sunSide);

  float fog = smoothstep(uFogNear, uFogFar, viewDist);
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface CloudShadowCaster {
  x: number;
  z: number;
  /** Height of the island top above the deck. */
  height: number;
  depth: number;
  radius: number;
  strength: number;
}

interface SkyCloudSeaProps {
  grade: AtmosphereGrade;
  center: THREE.Vector2;
  casters: CloudShadowCaster[];
  animate: boolean;
}

function gradeDeck(deck: THREE.ShaderMaterial, grade: AtmosphereGrade, sunXZ: THREE.Vector2, sunSlope: number) {
  const u = deck.uniforms;
  (u.uSunDir!.value as THREE.Vector3).copy(grade.sunDirection).normalize();
  (u.uSunXZ!.value as THREE.Vector2).copy(sunXZ);
  u.uSunSlope!.value = sunSlope;
  (u.uFog!.value as THREE.Color).copy(grade.fog);
  u.uFogNear!.value = grade.fogNear;
  u.uFogFar!.value = grade.fogFar;
}

/** Project each island onto the deck along the sun and upload the shadow set. */
function shadeDeck(
  deck: THREE.ShaderMaterial,
  casters: CloudShadowCaster[],
  sunXZ: THREE.Vector2,
  sunSlope: number,
) {
  const shadows = deck.uniforms.uShadows!.value as THREE.Vector4[];
  const count = Math.min(MAX_CLOUD_SHADOWS, casters.length);
  let stretch = 2;
  for (let i = 0; i < count; i++) {
    const caster = casters[i]!;
    // Mid-point between the projections of the grass top and the rock tip.
    const reach = (caster.height - caster.depth * 0.5) / sunSlope;
    shadows[i]!.set(caster.x - sunXZ.x * reach, caster.z - sunXZ.y * reach, caster.radius, caster.strength);
    stretch = 1 + caster.depth / sunSlope / (caster.radius * 2.6);
  }
  deck.uniforms.uShadowCount!.value = count;
  deck.uniforms.uShadowStretch!.value = stretch;
}

function tickDeck(deck: THREE.ShaderMaterial, delta: number) {
  deck.uniforms.uTime!.value += Math.min(delta, 0.1);
}

export function SkyCloudSea({ grade, center, casters, animate }: SkyCloudSeaProps) {
  const sun = grade.sunDirection;
  const sunXZ = useMemo(() => new THREE.Vector2(sun.x, sun.z).normalize(), [sun]);
  const sunSlope = sun.y / Math.max(1e-3, Math.hypot(sun.x, sun.z));

  const deck = useMemo(() => {
    const shadows = Array.from({ length: MAX_CLOUD_SHADOWS }, () => new THREE.Vector4());
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: DECK_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uField: { value: cloudFieldTexture() },
        uSunDir: { value: new THREE.Vector3() },
        uSunXZ: { value: new THREE.Vector2() },
        uSunSlope: { value: 0.5 },
        uLit: { value: new THREE.Color('#ffd49c') },
        uShade: { value: new THREE.Color('#7672b0') },
        uDeep: { value: new THREE.Color('#4c5694') },
        uRim: { value: new THREE.Color('#ff9a50') },
        uFog: { value: new THREE.Color() },
        uFogNear: { value: 24 },
        uFogFar: { value: 72 },
        uShadows: { value: shadows },
        uShadowCount: { value: 0 },
        uShadowStretch: { value: 2 },
      },
      depthWrite: true,
    });
  }, []);

  useEffect(() => gradeDeck(deck, grade, sunXZ, sunSlope), [deck, grade, sunXZ, sunSlope]);
  useEffect(() => shadeDeck(deck, casters, sunXZ, sunSlope), [casters, deck, sunSlope, sunXZ]);
  useEffect(() => () => deck.dispose(), [deck]);

  useFrame((_, delta) => {
    if (animate) tickDeck(deck, delta);
  });

  return (
    <mesh
      material={deck}
      position={[center.x, CLOUD_DECK_Y, center.y]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-10}
      raycast={() => undefined}
      frustumCulled={false}
    >
      <planeGeometry args={[220, 220, 1, 1]} />
    </mesh>
  );
}

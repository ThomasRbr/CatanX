import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldBounds } from '../camera/fitOrthographicCamera';
import { useMapLod } from '../camera/MapLodContext';
import { getClimateVisualPreset, type ClimateVisualPreset } from '../utils/seasonVisuals';

/**
 * Climate weather.
 *
 * The old layer drew every climate as square `PointsMaterial` dots: rain,
 * snow, leaves and dust were the same blocky confetti in four colours. Each
 * kind now has its own sprite shape and motion — rain streaks slanting in the
 * wind, round tumbling snowflakes, a wind-driven blizzard, spinning autumn
 * leaves in a mosaic of colours, glinting frost, glowing pollen, drifting dust
 * — and storm climates add distant lightning.
 */

type WeatherKind = ClimateVisualPreset['particle'];

const KIND_INDEX: Record<WeatherKind, number> = {
  mist: 0,
  rain: 1,
  snow: 2,
  blizzard: 3,
  leaves: 4,
  frost: 5,
  pollen: 6,
  dust: 7,
  wind: 8,
  fire: 9,
};

/** World-space sprite size (at unit distance scale) per kind. */
/**
 * World-space sprite size per kind. The board camera sits ~15–20 units away,
 * so a sprite must be a few tenths of a unit to cover more than a few pixels
 * (rain streaks are a tenth of their sprite wide).
 */
const KIND_SIZE: Record<WeatherKind, number> = {
  mist: 1.3,
  rain: 0.55,
  snow: 0.2,
  blizzard: 0.26,
  leaves: 0.3,
  frost: 0.16,
  pollen: 0.13,
  dust: 0.3,
  wind: 1.1,
  fire: 0.14,
};

const KIND_COLOR: Record<WeatherKind, string> = {
  mist: '#dfe8ea',
  rain: '#b9dcf2',
  snow: '#f6faff',
  blizzard: '#eef5ff',
  leaves: '#e08a3c',
  frost: '#f2fbff',
  pollen: '#ffe590',
  dust: '#d8ad70',
  wind: '#e3edf1',
  fire: '#ff9a3c',
};

const KIND_OPACITY: Record<WeatherKind, number> = {
  mist: 0.16,
  rain: 0.55,
  snow: 0.92,
  blizzard: 0.85,
  leaves: 0.95,
  frost: 0.9,
  pollen: 0.85,
  dust: 0.42,
  wind: 0.2,
  fire: 0.95,
};

const VERTEX = /* glsl */ `
#include <fog_pars_vertex>
attribute float aSeed;
uniform float uSize;
uniform float uScale;
varying float vSeed;
varying float vDepthFade;
void main() {
  vSeed = aSeed;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float size = uSize * (0.65 + aSeed * 0.7);
  gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
  // Very close particles would fill the screen with blur.
  vDepthFade = smoothstep(0.6, 2.0, -mvPosition.z);
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform int uKind;
uniform float uWind;
varying float vSeed;
varying float vDepthFade;

vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float alpha = 0.0;
  vec3 color = uColor;

  if (uKind == 1) {
    // Rain: a thin streak slanted by the wind.
    vec2 q = rot(p, -0.22 * uWind);
    float across = 1.0 - smoothstep(0.02, 0.07, abs(q.x));
    float along = smoothstep(0.5, 0.15, abs(q.y)) * smoothstep(-0.5, 0.3, -q.y);
    alpha = across * along;
  } else if (uKind == 2 || uKind == 3) {
    // Snow: soft round flakes; the blizzard stretches them along the wind.
    vec2 q = p;
    if (uKind == 3) q = rot(q, 0.3) * vec2(0.55, 1.6);
    float r = length(q);
    alpha = smoothstep(0.5, 0.12, r);
    color = mix(color, vec3(1.0), smoothstep(0.25, 0.0, r) * 0.4);
  } else if (uKind == 4) {
    // Leaves: pointed oval with a midrib, spinning, in an autumn mosaic.
    vec2 q = rot(p, uTime * (0.8 + vSeed * 1.8) + vSeed * 6.28);
    q.y *= 1.0 + 0.35 * sin(uTime * 2.4 + vSeed * 9.0); // flutter
    float leaf = 1.0 - smoothstep(0.0, 0.03, abs(q.x) - (0.2 - q.y * q.y * 0.75));
    leaf *= step(abs(q.y), 0.46);
    float rib = 1.0 - smoothstep(0.0, 0.025, abs(q.x));
    float pick = fract(vSeed * 13.7);
    vec3 tint = pick < 0.3 ? vec3(0.9, 0.55, 0.15)
      : pick < 0.55 ? vec3(0.82, 0.28, 0.08)
      : pick < 0.75 ? vec3(0.66, 0.14, 0.07)
      : pick < 0.9 ? vec3(0.95, 0.76, 0.22)
      : vec3(0.5, 0.3, 0.12);
    color = mix(tint, tint * 0.6, rib * 0.6);
    alpha = leaf;
  } else if (uKind == 5) {
    // Frost: tiny four-point glints that twinkle.
    float twinkle = 0.45 + 0.55 * sin(uTime * (2.5 + vSeed * 4.0) + vSeed * 30.0);
    float core = smoothstep(0.18, 0.0, length(p));
    float star = (1.0 - smoothstep(0.0, 0.04, abs(p.x))) * smoothstep(0.5, 0.0, abs(p.y))
      + (1.0 - smoothstep(0.0, 0.04, abs(p.y))) * smoothstep(0.5, 0.0, abs(p.x));
    alpha = clamp(core + star * 0.75, 0.0, 1.0) * max(0.0, twinkle);
  } else if (uKind == 9) {
    // Embers: hot cores cooling to red as they rise and flicker.
    float flicker = 0.6 + 0.4 * sin(uTime * (6.0 + vSeed * 5.0) + vSeed * 40.0);
    float r = length(p);
    alpha = smoothstep(0.5, 0.0, r) * flicker;
    color = mix(vec3(1.0, 0.3, 0.08), vec3(1.0, 0.85, 0.45), smoothstep(0.3, 0.0, r));
  } else if (uKind == 6) {
    // Pollen: glowing motes that pulse softly.
    float pulse = 0.65 + 0.35 * sin(uTime * 1.6 + vSeed * 20.0);
    alpha = smoothstep(0.5, 0.0, length(p)) * pulse;
    color *= 1.2;
  } else if (uKind == 8) {
    // Wind: long faint horizontal wisps.
    vec2 q = rot(p, 0.12);
    alpha = (1.0 - smoothstep(0.02, 0.1, abs(q.y))) * smoothstep(0.5, 0.1, abs(q.x));
  } else {
    // Mist and dust: large very soft puffs.
    alpha = pow(smoothstep(0.5, 0.0, length(p)), 1.6);
  }

  alpha *= uOpacity * vDepthFade;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function deterministicUnit(index: number, salt: number): number {
  const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Vertical fall speed and horizontal drift multiplier per kind. */
function motionFor(kind: WeatherKind): { fall: number; drift: number; sway: number } {
  switch (kind) {
    case 'rain':
      return { fall: 6.2, drift: 0.55, sway: 0.04 };
    case 'blizzard':
      return { fall: 1.4, drift: 2.6, sway: 0.5 };
    case 'snow':
      return { fall: 0.62, drift: 0.32, sway: 0.42 };
    case 'leaves':
      return { fall: 0.42, drift: 0.7, sway: 0.65 };
    case 'frost':
      return { fall: 0.14, drift: 0.12, sway: 0.2 };
    case 'pollen':
      return { fall: 0.08, drift: 0.22, sway: 0.35 };
    case 'dust':
      return { fall: 0.03, drift: 1.4, sway: 0.25 };
    case 'wind':
      return { fall: 0.02, drift: 2.2, sway: 0.1 };
    case 'fire':
      return { fall: -0.5, drift: 0.25, sway: 0.3 };
    default:
      return { fall: 0.03, drift: 0.18, sway: 0.08 };
  }
}

export function WeatherParticles({
  bounds,
  climateId,
}: {
  bounds: WorldBounds;
  climateId?: string | null;
}) {
  const lod = useMapLod();
  const { size, gl } = useThree();
  const preset = getClimateVisualPreset(climateId);
  const kind: WeatherKind = preset?.particle ?? 'mist';
  const baseCount = lod === 0 ? 520 : lod === 1 ? 360 : 160;
  // Rain and blizzard need many more particles to read as a downpour.
  const kindBoost = kind === 'rain' ? 2.2 : kind === 'blizzard' ? 2 : kind === 'snow' ? 1.4 : 1;
  const count = Math.max(0, Math.round(baseCount * kindBoost * (preset?.weatherDensity ?? 0)));
  const spanX = Math.max(8, bounds.maxX - bounds.minX + 7);
  const spanZ = Math.max(8, bounds.maxZ - bounds.minZ + 7);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  // Ground-hugging kinds stay low over the island.
  const top = kind === 'dust' || kind === 'mist' || kind === 'wind' ? 2.4 : 7.5;

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = centerX + (deterministicUnit(i, 1) - 0.5) * spanX;
      positions[i * 3 + 1] = 0.25 + deterministicUnit(i, 2) * top;
      positions[i * 3 + 2] = centerZ + (deterministicUnit(i, 3) - 0.5) * spanZ;
      seeds[i] = deterministicUnit(i, 5);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    result.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    return result;
  }, [centerX, centerZ, count, spanX, spanZ, top]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          uColor: { value: new THREE.Color(KIND_COLOR[kind]) },
          uOpacity: { value: KIND_OPACITY[kind] },
          uSize: { value: KIND_SIZE[kind] },
          uScale: { value: 400 },
          uTime: { value: 0 },
          uKind: { value: KIND_INDEX[kind] },
          uWind: { value: 1 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        fog: true,
        blending: kind === 'pollen' || kind === 'frost' || kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [kind],
  );
  useEffect(() => () => material.dispose(), [material]);
  const pointsRef = useRef<THREE.Points>(null);

  useFrame(({ clock }, delta) => {
    const points = pointsRef.current;
    if (!preset || count === 0 || !points) return;
    // Through the mounted object: the memoised material is not mutated in render scope.
    const uniforms = (points.material as THREE.ShaderMaterial).uniforms;
    uniforms.uTime!.value = clock.elapsedTime;
    uniforms.uWind!.value = preset.windStrength;
    uniforms.uScale!.value = (size.height * gl.getPixelRatio()) / 2;
    const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attr.array as Float32Array;
    const motion = motionFor(kind);
    const wind = motion.drift * preset.windStrength;
    const dt = Math.min(delta, 0.05);
    const time = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const offset = i * 3;
      let x = array[offset]!;
      let y = array[offset + 1]!;
      let z = array[offset + 2]!;
      const seed = deterministicUnit(i, 9);
      x += wind * dt * (0.75 + seed * 0.5);
      z += Math.sin(time * (0.6 + seed) + seed * 12.0) * motion.sway * dt;
      y -= motion.fall * dt * (0.8 + seed * 0.4);
      if (x > centerX + spanX * 0.5) x -= spanX;
      if (z > centerZ + spanZ * 0.5) z -= spanZ;
      if (z < centerZ - spanZ * 0.5) z += spanZ;
      if (y < 0.12) y = top - deterministicUnit(i, 12) * 0.8;
      if (y > top) y = 0.2 + deterministicUnit(i, 13) * 0.4;
      array[offset] = x;
      array[offset + 1] = y;
      array[offset + 2] = z;
    }
    attr.needsUpdate = true;
  });

  if (!preset || count === 0) return null;
  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => undefined}
      renderOrder={30}
    />
  );
}

const STORM_CLIMATES = new Set(['summer_hot_storms', 'autumn_equinox_storm', 'autumn_russet_rains', 'spring_floods']);

function boltGeometry(seed: number, x: number, z: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  let px = x;
  let pz = z;
  const segments = 14;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(new THREE.Vector3(px, 8.5 - t * 8.6, pz));
    px += (deterministicUnit(seed * 31 + i, 1) - 0.5) * 0.55;
    pz += (deterministicUnit(seed * 31 + i, 2) - 0.5) * 0.55;
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1), 48, 0.022, 5, false);
}

/**
 * Storm climates: a distant lightning bolt over the sea now and then, with a
 * cold flash lighting the island. One light for the whole effect.
 */
export function StormLightning({
  bounds,
  climateId,
}: {
  bounds: WorldBounds;
  climateId?: string | null;
}) {
  const active = climateId ? STORM_CLIMATES.has(climateId) : false;
  const light = useRef<THREE.HemisphereLight>(null);
  const boltRef = useRef<THREE.Mesh>(null);
  const state = useRef({ next: 3 + Math.random() * 5, start: -10, index: 0 });
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#e9f3ff', transparent: true, opacity: 0, toneMapped: false }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const bolts = useMemo(() => {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.5 + 3;
    return Array.from({ length: 4 }, (_, i) => {
      const angle = deterministicUnit(i, 7) * Math.PI * 2;
      return boltGeometry(i + 1, cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius);
    });
  }, [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ]);
  useEffect(() => () => bolts.forEach((bolt) => bolt.dispose()), [bolts]);

  useFrame(({ clock }) => {
    if (!active || !light.current || !boltRef.current) return;
    const t = clock.elapsedTime;
    const s = state.current;
    if (t > s.next) {
      s.start = t;
      s.index = (s.index + 1) % bolts.length;
      s.next = t + 6 + Math.random() * 9;
      boltRef.current.geometry = bolts[s.index]!;
    }
    const age = t - s.start;
    // Double flicker: a strike, a short dark gap, a second weaker strike.
    const flash = age < 0 ? 0 : age < 0.08 ? 1 : age < 0.16 ? 0.15 : age < 0.26 ? 0.75 : Math.max(0, 0.75 - (age - 0.26) * 3);
    light.current.intensity = flash * 1.6;
    (boltRef.current.material as THREE.MeshBasicMaterial).opacity = flash;
    boltRef.current.visible = flash > 0.02;
  });

  if (!active) return null;
  return (
    <group>
      <hemisphereLight ref={light} color="#dce9ff" groundColor="#3b4a66" intensity={0} />
      <mesh ref={boltRef} geometry={bolts[0]} material={material} visible={false} raycast={() => undefined} renderOrder={31} />
    </group>
  );
}

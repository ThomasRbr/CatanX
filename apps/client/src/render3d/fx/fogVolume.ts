import * as THREE from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import type { HexTile } from '@catanx/engine';
import { cubeToWorld } from '../utils/hexToWorld';

/**
 * Fog of war as a cloud deck.
 *
 * The old fog was a dark hexagonal prism per tile: terrain pierced it, its
 * vertical walls cut the frame into a honeycomb and it read as a bug rather
 * than as weather. Unknown land now lies under a sea of cloud that is
 * ray-marched against the scene depth, so it wraps around mountains, thins to a
 * haze over land the player has explored but cannot currently see, and sinks
 * away when a tile is revealed.
 *
 * Two pieces share one state object so the composer never has to rebuild:
 * - `FogVolumeState` owns the visibility mask and every uniform; the
 *   FogOfWar3D driver updates it when the game state changes.
 * - `FogVolumeEffect` is the post-processing pass that reads it.
 */

/** Texels per world unit (a hex has radius 1). */
const MASK_DENSITY = 8;
const MASK_MARGIN = 1.6;
const NOISE_SIZE = 64;

export const FOG_UNEXPLORED = 1;
export const FOG_EXPLORED = 0.42;

export const FOG_DECK_BASE = 0.0;
// Forest impostors stand ~1.2 above the ground; the deck must clear them.
export const FOG_DECK_TOP = 2.0;

export interface FogMaskInput {
  tiles: Iterable<HexTile>;
  playerId: string;
}

// --- Noise -----------------------------------------------------------------

function hash3(x: number, y: number, z: number, period: number, seed: number): number {
  const xi = ((x % period) + period) % period;
  const yi = ((y % period) + period) % period;
  const zi = ((z % period) + period) % period;
  let h = (xi * 374761393 + yi * 668265263 + zi * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise(x: number, y: number, z: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const fz = smooth(z - z0);
  let result = 0;
  for (let dz = 0; dz < 2; dz++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        result += w * hash3(x0 + dx, y0 + dy, z0 + dz, period, seed);
      }
    }
  }
  return result;
}

/** Tileable inverted Worley noise: 1 at cell centres, the "puff" shape. */
function worley(x: number, y: number, z: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const px = cx + hash3(cx, cy, cz, period, seed);
        const py = cy + hash3(cx, cy, cz, period, seed + 17);
        const pz = cz + hash3(cx, cy, cz, period, seed + 31);
        const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
        if (d < best) best = d;
      }
    }
  }
  return 1 - Math.min(1, Math.sqrt(best));
}

let noiseTexture: THREE.Data3DTexture | null = null;

/**
 * 64³ tileable cloud noise. R = Perlin-Worley-like base shape, G = high
 * frequency Worley erosion. Built once on first use (~40 ms).
 */
export function cloudNoiseTexture(): THREE.Data3DTexture {
  if (noiseTexture) return noiseTexture;
  const n = NOISE_SIZE;
  const data = new Uint8Array(n * n * n * 2);
  let i = 0;
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const v = y / n;
        const w = z / n;
        let fbm = 0;
        let amp = 0.5;
        let total = 0;
        for (let o = 0; o < 4; o++) {
          const p = 4 << o;
          fbm += amp * valueNoise(u * p, v * p, w * p, p, 11 + o);
          total += amp;
          amp *= 0.5;
        }
        fbm /= total;
        const cells = worley(u * 4, v * 4, w * 4, 4, 5);
        // Perlin-Worley: billowy cells modulated by fbm.
        const base = THREE.MathUtils.clamp(fbm * 0.55 + cells * 0.6 - 0.12, 0, 1);
        const detail =
          worley(u * 8, v * 8, w * 8, 8, 9) * 0.625 + worley(u * 16, v * 16, w * 16, 16, 13) * 0.375;
        data[i++] = Math.round(base * 255);
        data[i++] = Math.round(detail * 255);
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, n, n, n);
  texture.format = THREE.RGFormat;
  texture.type = THREE.UnsignedByteType;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  noiseTexture = texture;
  return texture;
}

// --- Visibility mask ---------------------------------------------------------

interface MaskDomain {
  minX: number;
  minZ: number;
  width: number;
  height: number;
  /** World extent covered by the texture. */
  sizeX: number;
  sizeZ: number;
}

function worldToAxial(x: number, z: number): { q: number; r: number } {
  const qf = (Math.sqrt(3) / 3) * x - z / 3;
  const rf = (2 / 3) * z;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))]!;
      }
      tmp[y * w + x] = sum / span;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
      }
      out[y * w + x] = sum / span;
    }
  }
  return out;
}

/** Rasterise per-tile fog values into a soft world-space mask. */
export function rasteriseFogMask({ tiles, playerId }: FogMaskInput): { domain: MaskDomain; values: Float32Array } {
  // Two channels, interleaved: R is a tight blur that decides *where* there is
  // cloud; G is a wide blur that shapes the deck's height, so the walls around
  // a visible clearing slope away instead of standing up like a cliff.
  const byCoord = new Map<string, number>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const tile of tiles) {
    const visible = tile.visible.has(playerId);
    const explored = tile.explored.has(playerId);
    const value = visible ? 0 : explored ? FOG_EXPLORED : FOG_UNEXPLORED;
    byCoord.set(`${tile.coord.q},${tile.coord.r}`, value);
    const o = cubeToWorld(tile.coord);
    minX = Math.min(minX, o.x);
    maxX = Math.max(maxX, o.x);
    minZ = Math.min(minZ, o.z);
    maxZ = Math.max(maxZ, o.z);
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minZ = maxZ = 0;
  }
  minX -= MASK_MARGIN;
  minZ -= MASK_MARGIN;
  maxX += MASK_MARGIN;
  maxZ += MASK_MARGIN;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const width = Math.min(256, Math.max(8, Math.ceil(sizeX * MASK_DENSITY)));
  const height = Math.min(256, Math.max(8, Math.ceil(sizeZ * MASK_DENSITY)));
  const raw = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const z = minZ + ((y + 0.5) / height) * sizeZ;
    for (let x = 0; x < width; x++) {
      const wx = minX + ((x + 0.5) / width) * sizeX;
      const { q, r } = worldToAxial(wx, z);
      raw[y * width + x] = byCoord.get(`${q},${r}`) ?? 0;
    }
  }
  // Box passes ≈ gaussians of ~0.3 and ~0.8 world units.
  const narrow = boxBlur(boxBlur(raw, width, height, 2), width, height, 1);
  const wide = boxBlur(boxBlur(boxBlur(raw, width, height, 4), width, height, 4), width, height, 3);
  const values = new Float32Array(width * height * 2);
  for (let i = 0; i < width * height; i++) {
    values[i * 2] = narrow[i]!;
    // Never lower than the density mask, or dense cloud would sit on a deck
    // with no height and vanish at the core of large unknown regions.
    values[i * 2 + 1] = Math.max(wide[i]!, narrow[i]! * 0.85);
  }
  return { domain: { minX, minZ, width, height, sizeX, sizeZ }, values };
}

function sameDomain(a: MaskDomain | null, b: MaskDomain): boolean {
  return (
    !!a &&
    a.width === b.width &&
    a.height === b.height &&
    Math.abs(a.minX - b.minX) < 1e-6 &&
    Math.abs(a.minZ - b.minZ) < 1e-6
  );
}

/** Seconds for a reveal to dissolve. */
const REVEAL_SECONDS = 2.2;

export class FogVolumeState {
  readonly uniforms = {
    uEnabled: new THREE.Uniform(0),
    uMaskPrev: new THREE.Uniform<THREE.Texture | null>(null),
    uMaskNext: new THREE.Uniform<THREE.Texture | null>(null),
    uMaskBlend: new THREE.Uniform(1),
    uMaskOrigin: new THREE.Uniform(new THREE.Vector2()),
    uMaskInvSize: new THREE.Uniform(new THREE.Vector2(1, 1)),
    uNoise: new THREE.Uniform<THREE.Texture | null>(null),
    uTime: new THREE.Uniform(0),
    uSunDir: new THREE.Uniform(new THREE.Vector3(0, 1, 0)),
    uSunColor: new THREE.Uniform(new THREE.Color(1, 1, 1)),
    uSkyColor: new THREE.Uniform(new THREE.Color(0.7, 0.78, 0.9)),
    uShadeColor: new THREE.Uniform(new THREE.Color(0.32, 0.36, 0.44)),
    uCamPos: new THREE.Uniform(new THREE.Vector3()),
    uInvProj: new THREE.Uniform(new THREE.Matrix4()),
    uCamWorld: new THREE.Uniform(new THREE.Matrix4()),
  };

  private domain: MaskDomain | null = null;
  private prev: Float32Array | null = null;
  private next: Float32Array | null = null;
  private prevTex: THREE.DataTexture | null = null;
  private nextTex: THREE.DataTexture | null = null;
  private blend = 1;

  private makeTexture(domain: MaskDomain): THREE.DataTexture {
    const texture = new THREE.DataTexture(
      new Uint8Array(domain.width * domain.height * 2),
      domain.width,
      domain.height,
      THREE.RGFormat,
      THREE.UnsignedByteType,
    );
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
  }

  private upload(texture: THREE.DataTexture, values: Float32Array) {
    const data = texture.image.data as Uint8Array;
    for (let i = 0; i < values.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, values[i]!)) * 255);
    texture.needsUpdate = true;
  }

  /** Apply a new visibility snapshot; reveals blend over REVEAL_SECONDS. */
  setMask(input: FogMaskInput, animate: boolean) {
    const { domain, values } = rasteriseFogMask(input);
    if (!sameDomain(this.domain, domain) || !this.next || !animate) {
      this.prevTex?.dispose();
      this.nextTex?.dispose();
      this.domain = domain;
      this.prevTex = this.makeTexture(domain);
      this.nextTex = this.makeTexture(domain);
      this.prev = values;
      this.next = values;
      this.upload(this.prevTex, values);
      this.upload(this.nextTex, values);
      this.blend = 1;
    } else {
      // Start from what is on screen right now, even mid-dissolve.
      const shown = new Float32Array(values.length);
      for (let i = 0; i < values.length; i++) {
        shown[i] = this.prev![i]! + (this.next![i]! - this.prev![i]!) * this.blend;
      }
      this.prev = shown;
      this.next = values;
      this.upload(this.prevTex!, shown);
      this.upload(this.nextTex!, values);
      this.blend = 0;
    }
    const u = this.uniforms;
    u.uMaskPrev.value = this.prevTex;
    u.uMaskNext.value = this.nextTex;
    u.uMaskBlend.value = this.blend;
    u.uMaskOrigin.value.set(domain.minX, domain.minZ);
    u.uMaskInvSize.value.set(1 / domain.sizeX, 1 / domain.sizeZ);
    u.uNoise.value = cloudNoiseTexture();
  }

  setEnabled(enabled: boolean) {
    this.uniforms.uEnabled.value = enabled && this.nextTex ? 1 : 0;
  }

  get enabled(): boolean {
    return this.uniforms.uEnabled.value > 0.5;
  }

  setLighting(sunDir: THREE.Vector3, sunColor: THREE.Color, sunIntensity: number, sky: THREE.Color, horizon: THREE.Color) {
    const u = this.uniforms;
    u.uSunDir.value.copy(sunDir).normalize();
    // Clouds are not PBR: scale the key so a lit top sits just under white
    // after ACES, and the underside takes the sky's blue.
    u.uSunColor.value.copy(sunColor).multiplyScalar(Math.min(1.25, 0.42 * sunIntensity));
    u.uSkyColor.value.copy(horizon).lerp(sky, 0.45).multiplyScalar(0.5);
    u.uShadeColor.value.copy(sky).lerp(new THREE.Color('#4c5566'), 0.6).multiplyScalar(0.36);
  }

  tick(delta: number) {
    this.uniforms.uTime.value += delta;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + delta / REVEAL_SECONDS);
      this.uniforms.uMaskBlend.value = this.blend;
    }
  }

  syncCamera(camera: THREE.Camera) {
    const u = this.uniforms;
    camera.updateMatrixWorld();
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
  }

  dispose() {
    this.prevTex?.dispose();
    this.nextTex?.dispose();
    this.prevTex = this.nextTex = null;
    this.uniforms.uEnabled.value = 0;
  }
}

// --- Shared GLSL ---------------------------------------------------------------

/**
 * Density of the cloud deck at world position p.
 *
 * The deck's top surface is a heightfield: thick (up to FOG_DECK_TOP) over
 * unknown land, low over explored land, absent over visible land. Inside it,
 * Perlin-Worley noise carves billows and the erosion channel frays the edges.
 */
export const FOG_DENSITY_GLSL = /* glsl */ `
// x = density mask, y = deck height mask.
vec2 fogMaskAt(vec2 xz) {
  vec2 st = (xz - uMaskOrigin) * uMaskInvSize;
  vec2 a = texture2D(uMaskPrev, st).rg;
  vec2 b = texture2D(uMaskNext, st).rg;
  return mix(a, b, smoothstep(0.0, 1.0, uMaskBlend));
}

float fogDensityAt(vec3 p, vec2 mask) {
  float m = mask.x;
  vec3 wind = vec3(uTime * 0.018, uTime * 0.004, uTime * 0.011);
  vec2 shape = texture(uNoise, p * vec3(0.16, 0.34, 0.16) + wind).rg;
  // Deck top rises with fog strength; billows lift it unevenly.
  // The floor of the billows sits above the tallest tree on a mountain, so
  // nothing of an unknown tile ever pokes through.
  float top = ${FOG_DECK_BASE.toFixed(3)} + ${(FOG_DECK_TOP - FOG_DECK_BASE).toFixed(3)} * mask.y * (0.72 + 0.4 * shape.r);
  float h = top - p.y;
  if (h <= 0.0) return 0.0;
  float body = smoothstep(0.0, 0.32, h);
  float erosion = texture(uNoise, p * 0.62 - wind * 1.7).g;
  float d = body * (0.45 + 0.85 * shape.r) - (1.0 - body) * erosion * 0.6;
  return max(d, 0.0) * m * m;
}
`;

export const FOG_MARCH_GLSL = /* glsl */ `
#ifndef FOG_STEPS
#define FOG_STEPS 22
#endif

float fogHash(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Returns (inscattered colour, transmittance).
vec4 fogMarch(vec3 ro, vec3 rd, float tScene) {
  float tTop = (${FOG_DECK_TOP.toFixed(3)} - ro.y) / rd.y;
  float tBase = (${FOG_DECK_BASE.toFixed(3)} - ro.y) / rd.y;
  float tIn = max(min(tTop, tBase), 0.0);
  float tOut = min(max(tTop, tBase), tScene);
  if (abs(rd.y) < 1e-4 || tOut <= tIn) return vec4(0.0, 0.0, 0.0, 1.0);

  // Cheap reject: no fog at either end or the middle of the segment.
  vec3 pa = ro + rd * tIn;
  vec3 pb = ro + rd * tOut;
  if (fogMaskAt(pa.xz).x + fogMaskAt(pb.xz).x + fogMaskAt(mix(pa.xz, pb.xz, 0.5)).x < 0.004) {
    return vec4(0.0, 0.0, 0.0, 1.0);
  }

  float dt = (tOut - tIn) / float(FOG_STEPS);
  float t = tIn + dt * fogHash(gl_FragCoord.xy);
  float transmittance = 1.0;
  vec3 light = vec3(0.0);
  for (int i = 0; i < FOG_STEPS; i++) {
    vec3 p = ro + rd * t;
    vec2 m = fogMaskAt(p.xz);
    if (m.x > 0.004) {
      float d = fogDensityAt(p, m);
      if (d > 0.002) {
        float sigma = d * 9.0;
        float alpha = 1.0 - exp(-sigma * dt);
        // Two shadow probes toward the sun give the billows their form.
        float occl = fogDensityAt(p + uSunDir * 0.1, m) * 0.1 + fogDensityAt(p + uSunDir * 0.32, m) * 0.22;
        float sun = exp(-occl * 9.0);
        float height = clamp(p.y / ${FOG_DECK_TOP.toFixed(3)}, 0.0, 1.0);
        vec3 ambient = mix(uShadeColor, uSkyColor, height);
        // Silver lining: forward scattering when looking toward the sun.
        float phase = 0.75 + 0.6 * pow(max(dot(rd, uSunDir), 0.0), 6.0);
        vec3 c = ambient + uSunColor * sun * phase;
        light += transmittance * alpha * c;
        transmittance *= 1.0 - alpha;
        if (transmittance < 0.015) break;
      }
    }
    t += dt;
  }
  return vec4(light, transmittance);
}
`;

const FOG_UNIFORMS_GLSL = /* glsl */ `
uniform sampler2D uMaskPrev;
uniform sampler2D uMaskNext;
uniform float uMaskBlend;
uniform vec2 uMaskOrigin;
uniform vec2 uMaskInvSize;
uniform highp sampler3D uNoise;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uShadeColor;
`;

const FOG_EFFECT_FRAGMENT = /* glsl */ `
uniform float uEnabled;
${FOG_UNIFORMS_GLSL}
uniform vec3 uCamPos;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;

${FOG_DENSITY_GLSL}
${FOG_MARCH_GLSL}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (uEnabled < 0.5) {
    outputColor = inputColor;
    return;
  }
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInvProj * ndc;
  view /= view.w;
  vec3 world = (uCamWorld * vec4(view.xyz, 1.0)).xyz;
  vec3 rd = world - uCamPos;
  float tScene = length(rd);
  rd /= max(tScene, 1e-5);
  vec4 fog = fogMarch(uCamPos, rd, tScene);
  outputColor = vec4(inputColor.rgb * fog.a + fog.rgb, inputColor.a);
}
`;

export class FogVolumeEffect extends Effect {
  private readonly state: FogVolumeState;
  private readonly camera: THREE.Camera;

  constructor(state: FogVolumeState, camera: THREE.Camera) {
    super('FogVolumeEffect', FOG_EFFECT_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>(Object.entries(state.uniforms) as [string, THREE.Uniform][]),
    });
    this.state = state;
    this.camera = camera;
  }

  override update() {
    if (this.state.enabled) this.state.syncCamera(this.camera);
  }
}

/**
 * Fallback for renderers without the post chain (low tier, orthographic):
 * the same deck marched from a plane laid over it, without scene depth.
 * Terrain never reaches the deck top, so the error is confined to the few
 * centimetres of cloud that would have sat below a hill top.
 */
export function createFogDeckMaterial(state: FogVolumeState): THREE.ShaderMaterial {
  const u = state.uniforms;
  return new THREE.ShaderMaterial({
    defines: { FOG_STEPS: 12 },
    uniforms: {
      uMaskPrev: u.uMaskPrev,
      uMaskNext: u.uMaskNext,
      uMaskBlend: u.uMaskBlend,
      uMaskOrigin: u.uMaskOrigin,
      uMaskInvSize: u.uMaskInvSize,
      uNoise: u.uNoise,
      uTime: u.uTime,
      uSunDir: u.uSunDir,
      uSunColor: u.uSunColor,
      uSkyColor: u.uSkyColor,
      uShadeColor: u.uShadeColor,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${FOG_UNIFORMS_GLSL}
      varying vec3 vWorld;
      ${FOG_DENSITY_GLSL}
      ${FOG_MARCH_GLSL}
      void main() {
        vec3 rd = normalize(vWorld - cameraPosition);
        vec4 fog = fogMarch(cameraPosition, rd, 1e4);
        gl_FragColor = vec4(fog.rgb, 1.0 - fog.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

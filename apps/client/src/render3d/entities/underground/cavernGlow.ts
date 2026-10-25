/**
 * "Light without lights" for the underground.
 *
 * A real `pointLight` per chamber multiplies the shader cost of every lit
 * material on screen and recompiles every program whenever the count changes.
 * Instead, the cave materials share one small uniform array of glow sources
 * (position, radius, colour) and evaluate a cheap wrapped-Lambert falloff in
 * their fragment shader. Chambers, lanterns, shafts and the fault all light
 * the surrounding rock in their own colour for one loop over a uniform array,
 * the program never recompiles when sources come and go, and only the cave
 * materials pay for it.
 */
import * as THREE from 'three';

export type GlowMode = 'steady' | 'flicker' | 'pulse' | 'breathe';

export interface GlowSource {
  x: number;
  y: number;
  z: number;
  /** Distance at which the glow fades to zero. */
  radius: number;
  color: THREE.ColorRepresentation;
  intensity: number;
  mode?: GlowMode;
  /** Ordering when the budget is exceeded: higher survives. */
  priority?: number;
}

interface ActiveGlow {
  color: THREE.Color;
  intensity: number;
  mode: GlowMode;
  phase: number;
}

/** Uniform vectors left for three's own lighting/material uniforms. */
const RESERVED_FRAGMENT_VECTORS = 260;

export function glowBudgetFor(maxFragmentUniforms: number | undefined): number {
  const available = Math.floor(((maxFragmentUniforms ?? 1024) - RESERVED_FRAGMENT_VECTORS) / 2);
  return Math.max(12, Math.min(96, available));
}

export class CavernGlowField {
  readonly max: number;
  readonly uniforms: {
    uGlowPos: { value: THREE.Vector4[] };
    uGlowCol: { value: THREE.Vector3[] };
    uGlowCount: { value: number };
  };
  private active: ActiveGlow[] = [];

  constructor(max: number) {
    this.max = max;
    this.uniforms = {
      uGlowPos: { value: Array.from({ length: max }, () => new THREE.Vector4(0, -100, 0, 0.001)) },
      uGlowCol: { value: Array.from({ length: max }, () => new THREE.Vector3()) },
      uGlowCount: { value: 0 },
    };
  }

  set(sources: GlowSource[]): void {
    const ordered = [...sources].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, this.max);
    this.active = ordered.map((source, index) => {
      this.uniforms.uGlowPos.value[index]!.set(source.x, source.y, source.z, Math.max(0.05, source.radius));
      const color = new THREE.Color(source.color);
      this.uniforms.uGlowCol.value[index]!.set(
        color.r * source.intensity,
        color.g * source.intensity,
        color.b * source.intensity,
      );
      return {
        color,
        intensity: source.intensity,
        mode: source.mode ?? 'steady',
        // Deterministic, de-synchronised phase per source.
        phase: ((source.x * 12.9898 + source.z * 78.233) % 6.283) + index * 0.37,
      };
    });
    this.uniforms.uGlowCount.value = this.active.length;
  }

  /** Animate flicker / pulse. Cheap: a few dozen Vector3 writes per frame. */
  tick(time: number): void {
    for (let i = 0; i < this.active.length; i++) {
      const glow = this.active[i]!;
      if (glow.mode === 'steady') continue;
      let k = 1;
      if (glow.mode === 'flicker') {
        k = 0.86 + 0.08 * Math.sin(time * 9.3 + glow.phase) + 0.06 * Math.sin(time * 23.1 + glow.phase * 2.1);
      } else if (glow.mode === 'pulse') {
        k = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(time * 3.1 + glow.phase));
      } else if (glow.mode === 'breathe') {
        k = 0.82 + 0.18 * Math.sin(time * 1.15 + glow.phase);
      }
      const s = glow.intensity * k;
      this.uniforms.uGlowCol.value[i]!.set(glow.color.r * s, glow.color.g * s, glow.color.b * s);
    }
  }
}

export interface CavernMaterialPatch {
  /** Accumulate the shared glow field into this material. */
  glow?: CavernGlowField | null;
  /** Emissive = vertex/instance colour × `emissive` (for crystals, lanterns). */
  emissiveFromColor?: boolean;
  /**
   * Project the material's maps in world XZ at this scale. Geometry that sets
   * `aUvMode = 1` keeps its own `uv` instead (vertical cliff faces).
   */
  worldUvScale?: number;
  /** Add the geometry's `aEmissive` attribute (lava seams, ore veins). */
  vertexEmissive?: boolean;
}

const GLOW_VERTEX_HEAD = /* glsl */ `
varying vec3 vCavernWorld;
`;

const GLOW_VERTEX_BODY = /* glsl */ `
{
  vec4 cavernWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cavernWorld = instanceMatrix * cavernWorld;
  #endif
  cavernWorld = modelMatrix * cavernWorld;
  vCavernWorld = cavernWorld.xyz;
}
`;

function glowFragmentHead(max: number): string {
  return /* glsl */ `
#define CAVERN_GLOW_MAX ${max}
uniform vec4 uGlowPos[ CAVERN_GLOW_MAX ];
uniform vec3 uGlowCol[ CAVERN_GLOW_MAX ];
uniform int uGlowCount;
varying vec3 vCavernWorld;
`;
}

const GLOW_FRAGMENT_BODY = /* glsl */ `
{
  vec3 cavernN = normalize( inverseTransformDirection( normal, viewMatrix ) );
  vec3 cavernGlow = vec3( 0.0 );
  for ( int i = 0; i < CAVERN_GLOW_MAX; i ++ ) {
    if ( i >= uGlowCount ) break;
    vec4 gp = uGlowPos[ i ];
    vec3 toLight = gp.xyz - vCavernWorld;
    float dist = length( toLight );
    float att = clamp( 1.0 - dist / gp.w, 0.0, 1.0 );
    if ( att <= 0.0 ) continue;
    att *= att;
    float ndl = dot( cavernN, toLight / max( dist, 1e-4 ) );
    cavernGlow += uGlowCol[ i ] * att * clamp( ndl * 0.62 + 0.38, 0.0, 1.0 );
  }
  totalEmissiveRadiance += diffuseColor.rgb * cavernGlow;
}
`;

export function patchCavernMaterial<T extends THREE.MeshStandardMaterial>(
  material: T,
  patch: CavernMaterialPatch,
): T {
  const { glow, emissiveFromColor = false, worldUvScale, vertexEmissive = false } = patch;
  material.onBeforeCompile = (shader) => {
    let vertex = shader.vertexShader;
    let fragment = shader.fragmentShader;

    if (worldUvScale !== undefined) {
      vertex = vertex.replace(
        '#include <common>',
        `#include <common>
        attribute float aUvMode;`,
      );
      vertex = vertex.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          vec4 cavernUvWorld = vec4( position, 1.0 );
          #ifdef USE_INSTANCING
            cavernUvWorld = instanceMatrix * cavernUvWorld;
          #endif
          cavernUvWorld = modelMatrix * cavernUvWorld;
          vec2 cavernUv = mix( cavernUvWorld.xz, uv, aUvMode ) * ${worldUvScale.toFixed(4)};
          #ifdef USE_MAP
            vMapUv = ( mapTransform * vec3( cavernUv, 1.0 ) ).xy;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = ( normalMapTransform * vec3( cavernUv, 1.0 ) ).xy;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = ( roughnessMapTransform * vec3( cavernUv, 1.0 ) ).xy;
          #endif
        }`,
      );
    }

    if (glow) {
      shader.uniforms.uGlowPos = glow.uniforms.uGlowPos;
      shader.uniforms.uGlowCol = glow.uniforms.uGlowCol;
      shader.uniforms.uGlowCount = glow.uniforms.uGlowCount;
      vertex = vertex.replace('#include <common>', `#include <common>\n${GLOW_VERTEX_HEAD}`);
      vertex = vertex.replace('#include <project_vertex>', `#include <project_vertex>\n${GLOW_VERTEX_BODY}`);
      fragment = fragment.replace('#include <common>', `#include <common>\n${glowFragmentHead(glow.max)}`);
    }

    if (vertexEmissive) {
      vertex = vertex.replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aEmissive;\nvarying vec3 vCavernEmissive;',
      );
      vertex = vertex.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCavernEmissive = aEmissive;');
      fragment = fragment.replace('#include <common>', '#include <common>\nvarying vec3 vCavernEmissive;');
    }

    if (emissiveFromColor || glow || vertexEmissive) {
      fragment = fragment.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${emissiveFromColor ? '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR_ALPHA )\n totalEmissiveRadiance *= vColor.rgb;\n#endif' : ''}
        ${glow ? GLOW_FRAGMENT_BODY : ''}
        ${vertexEmissive ? 'totalEmissiveRadiance += vCavernEmissive;' : ''}`,
      );
    }

    shader.vertexShader = vertex;
    shader.fragmentShader = fragment;
  };
  const key = `cavern-v1:${glow ? glow.max : 0}:${emissiveFromColor ? 1 : 0}:${worldUvScale ?? '-'}:${vertexEmissive ? 1 : 0}`;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

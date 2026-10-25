import { Suspense, forwardRef, memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
} from '@react-three/postprocessing';
import { BlendFunction, Effect, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { isIntegratedGpu } from '../quality/renderQuality';
import { normalizeSeason } from '../utils/seasonVisuals';
import { FogVolumeEffect, type FogVolumeState } from './fogVolume';

/**
 * Final colour grade, applied after tone mapping.
 *
 * One fragment instead of HueSaturation + BrightnessContrast + Vignette: they
 * would merge into the same pass anyway, but splitting the grade made it easy
 * to fight itself (contrast crushing what saturation had just lifted).
 *
 * - split toning: cool shadows, warm highlights, the classic outdoor look that
 *   separates sunlit faces from shade without darkening either;
 * - contrast acts on luminance in a square-root space, so it pivots around
 *   perceived mid grey and leaves hue and saturation alone;
 * - vibrance lifts muted colours more than already saturated ones, so meadows
 *   gain colour while the sea and roofs do not go neon;
 * - a triangular dither breaks the 8-bit banding on the sky gradient.
 */
const GRADE_FRAGMENT = /* glsl */ `
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform float uVignette;

float catanxGradeLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, vec3(0.0));
  float luma = catanxGradeLuma(c);
  c *= mix(uShadowTint, uHighlightTint, smoothstep(0.04, 0.62, luma));

  // Contrast on luminance only. Per-channel contrast also stretched
  // saturation and crushed the small blue channel of foliage into a yellow cast.
  float lp = sqrt(max(luma, 1e-5));
  float lq = max((lp - 0.36) * uContrast + 0.36, 0.0);
  c *= (lq * lq) / max(luma, 1e-5);

  luma = catanxGradeLuma(c);
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float vibrance = 1.0 + uVibrance * (1.0 - smoothstep(0.0, 0.42, chroma));
  c = mix(vec3(luma), c, uSaturation * vibrance);

  vec2 d = (uv - 0.5) * vec2(1.0, 0.82);
  float vignette = 1.0 - uVignette * smoothstep(0.22, 0.74, length(d));
  c *= vignette;

  // Triangular-PDF dither, about one 8-bit step.
  float n0 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float n1 = fract(sin(dot(gl_FragCoord.xy + 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n0 + n1 - 1.0) / 255.0;

  outputColor = vec4(c, inputColor.a);
}
`;

interface GradeSettings {
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  contrast: number;
  saturation: number;
  vibrance: number;
  vignette: number;
}

class BoardGradeEffect extends Effect {
  constructor(settings: GradeSettings) {
    super('BoardGradeEffect', GRADE_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uShadowTint', new THREE.Uniform(settings.shadowTint.clone())],
        ['uHighlightTint', new THREE.Uniform(settings.highlightTint.clone())],
        ['uContrast', new THREE.Uniform(settings.contrast)],
        ['uSaturation', new THREE.Uniform(settings.saturation)],
        ['uVibrance', new THREE.Uniform(settings.vibrance)],
        ['uVignette', new THREE.Uniform(settings.vignette)],
      ]),
    });
  }

  apply(settings: GradeSettings) {
    (this.uniforms.get('uShadowTint')!.value as THREE.Color).copy(settings.shadowTint);
    (this.uniforms.get('uHighlightTint')!.value as THREE.Color).copy(settings.highlightTint);
    this.uniforms.get('uContrast')!.value = settings.contrast;
    this.uniforms.get('uSaturation')!.value = settings.saturation;
    this.uniforms.get('uVibrance')!.value = settings.vibrance;
    this.uniforms.get('uVignette')!.value = settings.vignette;
  }
}

const BoardGrade = forwardRef<BoardGradeEffect, { settings: GradeSettings }>(function BoardGrade(
  { settings },
  ref,
) {
  const effect = useMemo(() => new BoardGradeEffect(settings), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    effect.apply(settings);
  }, [effect, settings]);
  // `dispose={null}` on a primitive makes R3F assign `effect.dispose = null`, so the
  // cleanup threw on unmount and the board fell back to the legacy renderer.
  // Primitives are never auto-disposed, so dispose explicitly via the prototype.
  useEffect(() => () => BoardGradeEffect.prototype.dispose.call(effect), [effect]);
  return <primitive ref={ref} object={effect} />;
});

/** Season-aware grade. Kept gentle: the materials already carry the biome. */
function gradeFor(season: string, cinematic: boolean): GradeSettings {
  const s = normalizeSeason(season);
  const shadow =
    s === 'winter' ? '#eef3ff' : s === 'autumn' ? '#f3f3ff' : '#f2f6ff';
  const highlight =
    s === 'winter' ? '#fffcf6' : s === 'autumn' ? '#fff5e6' : '#fffaf0';
  return {
    shadowTint: new THREE.Color(shadow),
    highlightTint: new THREE.Color(highlight),
    contrast: cinematic ? 1.08 : 1.05,
    saturation: s === 'winter' ? 0.97 : 1.02,
    vibrance: s === 'winter' ? 0.06 : 0.12,
    vignette: cinematic ? 0.26 : 0.14,
  };
}

function rendererName(gl: THREE.WebGLRenderer): string {
  const context = gl.getContext();
  const info = context.getExtension('WEBGL_debug_renderer_info');
  return String(info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER));
}

/** Warm-black occlusion: neutral black reads as soot on sunlit soil. */
const AO_COLOR = new THREE.Color('#1b1712');

interface BoardPostStackProps {
  enabled?: boolean;
  season?: string;
  cinematic?: boolean;
  /** Optical depth of field, only for cinematic shots. */
  depthOfField?: boolean;
  winter?: boolean;
  /** Fog-of-war cloud deck, ray-marched against scene depth. */
  fogVolume?: FogVolumeState | null;
}

/**
 * The single post-processing chain for the perspective board.
 *
 * Order matters and is what the composer's auto-grouping produces:
 *   scene (HDR, linear) → N8AO → Bloom → [DoF] → ToneMapping + grade → SMAA
 *
 * The composer forces `gl.toneMapping = NoToneMapping` while mounted and three
 * never tone-maps into a render target, so the explicit ToneMapping effect is
 * mandatory. (The old cinematic-only composer lacked it and rendered the whole
 * cinematic view untone-mapped.)
 */
export const BoardPostStack = memo(function BoardPostStack({
  enabled = true,
  season = 'summer',
  cinematic = false,
  depthOfField = false,
  winter = false,
  fogVolume = null,
}: BoardPostStackProps) {
  const quality = useRenderQuality();
  const height = useThree((state) => state.size.height);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  // Integrated GPUs keep the grade and bloom but skip AO and MSAA (SMAA
  // instead): those two halved the frame rate on an Intel UHD.
  const liteGpu = useMemo(() => isIntegratedGpu(rendererName(gl)), [gl]);
  const fogEffect = useMemo(
    () => (fogVolume ? new FogVolumeEffect(fogVolume, camera) : null),
    [camera, fogVolume],
  );
  useEffect(() => () => {
    if (fogEffect) Object.getPrototypeOf(fogEffect).dispose.call(fogEffect);
  }, [fogEffect]);
  const grade = useMemo(() => gradeFor(season, cinematic), [season, cinematic]);

  const dbg = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('post') ?? '' : '';
  if (dbg.includes('off')) return null;
  const top = (quality.id === 'ultra' || quality.id === 'high') && !liteGpu;
  const ao = quality.indirectLighting && !liteGpu && !dbg.includes('noao');
  const dof = depthOfField && quality.cinematicDepthOfField;
  const dofHeight = Math.max(400, Math.round(height * 0.45));

  // The composer rebuilds every EffectPass (and recompiles their shaders)
  // whenever its `children` prop changes identity. Without this memo each game
  // action re-rendered the world, rebuilt the chain and caused a hitch.
  const effects = useMemo(
    () => (
      <>
        {/* Contact occlusion is what anchors houses, trees and rocks to the
            ground. Radius is in world units: a tile is ~1, a house ~0.12. Kept
            under a grass clump's spread, or dense wheat stains the chits. */}
        {ao ? (
          <N8AO
            aoRadius={0.2}
            distanceFalloff={0.35}
            intensity={1.45}
            aoSamples={top ? 16 : 8}
            denoiseSamples={top ? 8 : 4}
            denoiseRadius={8}
            halfRes={!top}
            depthAwareUpsampling
            color={AO_COLOR}
          />
        ) : null}
        {/* Clouds go over the occluded scene but before bloom and tone
            mapping, so their sunlit tops are graded with everything else. */}
        {fogEffect && !dbg.includes('nofog') ? <primitive object={fogEffect} /> : null}
        {/* Only true highlights bloom: sun glitter, snow in full sun, glass. */}
        {dbg.includes('nobloom') ? null : <Bloom
          mipmapBlur
          luminanceThreshold={1.05}
          luminanceSmoothing={0.35}
          intensity={cinematic ? 0.55 : 0.38}
          radius={0.72}
        />}
        {dof ? (
          <DepthOfField
            focusDistance={0.018}
            focusRange={winter ? 0.042 : 0.038}
            bokehScale={winter ? 5.0 : 5.4}
            height={dofHeight}
          />
        ) : null}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        {dbg.includes('nograde') ? null : <BoardGrade settings={grade} />}
        {top ? null : <SMAA />}
      </>
    ),
    [ao, cinematic, dbg, dof, dofHeight, fogEffect, grade, top, winter],
  );

  if (!enabled || !quality.atmosphericFx) return null;

  return (
    <Suspense fallback={null}>
      <EffectComposer
        multisampling={top ? 4 : 0}
        frameBufferType={THREE.HalfFloatType}
        enableNormalPass={false}
      >
        {effects}
      </EffectComposer>
    </Suspense>
  );
});

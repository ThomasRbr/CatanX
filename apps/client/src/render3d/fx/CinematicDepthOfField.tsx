import { Suspense, useMemo } from 'react';
import { DepthOfField, EffectComposer } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRenderQuality } from '../quality/RenderQualityContext';

interface CinematicDepthOfFieldProps {
  enabled?: boolean;
  /** Normalized focus distance — used for island aerial when no world target. */
  focusDistance?: number;
  winter?: boolean;
  /** Island aerial needs heavier tilt-shift; village close-up stays tighter. */
  shot?: 'island' | 'village' | 'strategic' | string;
  /** World-space autofocus point (village hamlet). Overrides normalized focus. */
  focusWorld?: { x: number; y?: number; z: number } | null;
}

/**
 * Real optical DoF for cinematic captures. Pinned to
 * @react-three/postprocessing@2.16.7 for three@0.172 + R3F8 + React 18.
 *
 * Village close-ups must use a world `target` — fixed normalized focusDistance
 * collapses when the camera is near the subject (flat depth buffer).
 */
export function CinematicDepthOfField({
  enabled = true,
  focusDistance = 0.018,
  winter = false,
  shot = 'island',
  focusWorld = null,
}: CinematicDepthOfFieldProps) {
  const quality = useRenderQuality();
  const size = useThree((state) => state.size);
  const active = enabled && quality.cinematicDepthOfField && quality.atmosphericFx;
  const village = shot === 'village';
  const target = useMemo(() => {
    if (!focusWorld) return undefined;
    return new THREE.Vector3(focusWorld.x, focusWorld.y ?? 0.05, focusWorld.z);
  }, [focusWorld]);

  if (!active) return null;

  // focusRange = sharp band width (normalized). Village needs a tight band +
  // strong bokeh so near/far trees go soft even when depths are compressed.
  // Bokeh / internal res kept intentionally lean — CinematicAtmosphere already
  // sells the tilt-shift falloff, so optical DoF only needs to soften edges.
  const focusRange = winter
    ? (village ? 0.024 : 0.042)
    : (village ? 0.022 : 0.038);
  const bokehScale = winter
    ? (village ? 5.8 : 5.0)
    : (village ? 6.0 : 5.4);
  const worldFocusRange = village ? (winter ? 1.25 : 1.05) : undefined;

  return (
    <Suspense fallback={null}>
      <EffectComposer multisampling={0} autoClear={false}>
        <DepthOfField
          {...(target
            ? { target, worldFocusRange }
            : { focusDistance })}
          focusRange={focusRange}
          bokehScale={bokehScale}
          height={Math.max(400, Math.round(size.height * 0.45))}
        />
      </EffectComposer>
    </Suspense>
  );
}

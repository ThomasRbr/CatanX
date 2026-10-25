import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

interface StaticShadowBakeProps {
  /** Frames to keep updating the shadow map after mount (asset settle). */
  settleFrames?: number;
  /**
   * Change this whenever something that casts a shadow moves — a building goes
   * up, the robber relocates, the season swings the sun. The map re-bakes and
   * freezes again. Without it a frozen shadow map silently goes stale.
   */
  invalidateKey?: string | number;
}

/**
 * Directional sun + static diorama → bake the shadow map once, then freeze.
 * Skipping the per-frame shadow pass is the largest interactive FPS win without
 * changing lighting, casters, or map resolution.
 */
export function StaticShadowBake({ settleFrames = 48, invalidateKey = '' }: StaticShadowBakeProps) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const baked = useRef(false);

  useEffect(() => {
    frames.current = 0;
    baked.current = false;
    gl.shadowMap.autoUpdate = true;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, invalidateKey, settleFrames]);

  useFrame(() => {
    if (baked.current) return;
    frames.current += 1;
    if (frames.current < settleFrames) {
      gl.shadowMap.needsUpdate = true;
      return;
    }
    gl.shadowMap.needsUpdate = true;
    gl.shadowMap.autoUpdate = false;
    baked.current = true;
  });

  return null;
}

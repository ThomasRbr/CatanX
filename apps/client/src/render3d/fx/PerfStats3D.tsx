import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { evaluatePerfSample, type RenderPerfSample } from '../utils/perfBudgets';

export interface CatanxRenderPerfSample extends RenderPerfSample {
  /** Rolling average FPS from the R3F render loop (last ~1s window). */
  fps: number;
  /** Whether the WebGLRenderer is still regenerating the shadow map each frame. */
  shadowAutoUpdate?: boolean;
  /** Active WebGL drawing buffer pixel ratio. */
  pixelRatio?: number;
}

declare global {
  interface Window {
    __catanxRenderPerf?: CatanxRenderPerfSample;
  }
}

interface PerfStats3DProps {
  mapRadius: number;
  /** Sample every N frames (default 30). */
  sampleEvery?: number;
}

/**
 * Publishes WebGL draw-call + FPS samples to `window.__catanxRenderPerf` for E2E / budgets.
 */
export function PerfStats3D({ mapRadius, sampleEvery = 30 }: PerfStats3DProps) {
  const { gl } = useThree();
  const frame = useRef(0);
  const radiusRef = useRef(mapRadius);
  const fpsWindow = useRef({ startedAt: 0, frames: 0, fps: 0 });
  radiusRef.current = mapRadius;

  useEffect(() => {
    return () => {
      delete window.__catanxRenderPerf;
    };
  }, []);

  // The post chain renders the scene and then several full-screen passes,
  // each of which reset gl.info, so the sample only ever saw the last pass
  // (1 call, 1 triangle). Accumulate a whole frame and reset here instead.
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    gl.info.reset();
    return () => {
      gl.info.autoReset = previous;
    };
  }, [gl]);

  useFrame(() => {
    frame.current += 1;
    const now = performance.now();
    const window_ = fpsWindow.current;
    if (window_.startedAt === 0) window_.startedAt = now;
    window_.frames += 1;
    const elapsed = now - window_.startedAt;
    const publish = (fps: number) => {
      const sample = evaluatePerfSample(gl.info, radiusRef.current);
      window.__catanxRenderPerf = {
        ...sample,
        fps,
        shadowAutoUpdate: gl.shadowMap.autoUpdate,
        pixelRatio: gl.getPixelRatio(),
      };
    };
    if (elapsed >= 1000) {
      window_.fps = Math.round((window_.frames * 1000) / elapsed);
      window_.startedAt = now;
      window_.frames = 0;
      publish(window_.fps);
    } else if (frame.current % sampleEvery === 0) {
      publish(window_.fps);
    }
    gl.info.reset();
  });

  return null;
}

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

const SAMPLE_SECONDS = 2.5;
const COOLDOWN_SECONDS = 5;

export function nextAdaptiveDpr(
  current: number,
  averageFrameMs: number,
  maxDpr: number,
  minDpr = 1,
): number {
  if (averageFrameMs > 28) return Math.max(minDpr, Math.round((current - 0.125) * 8) / 8);
  if (averageFrameMs < 18) return Math.min(maxDpr, Math.round((current + 0.125) * 8) / 8);
  return current;
}

/** Auto mode changes only pixel density, with long windows to avoid visible thrashing. */
export function AdaptiveDprController({
  enabled,
  maxDpr,
  minDpr = 1,
}: {
  enabled: boolean;
  maxDpr: number;
  /**
   * Never render below the display's own resolution. The previous 0.85 floor
   * bought about 28% of the pixels back but made every edge on the board soft,
   * and the board is the product. A machine that cannot hold native res should
   * lose frames, not sharpness.
   */
  minDpr?: number;
}) {
  const setDpr = useThree((state) => state.setDpr);
  const current = useRef(Math.min(
    maxDpr,
    Math.max(minDpr, typeof window === 'undefined' ? 1 : window.devicePixelRatio),
  ));
  const elapsed = useRef(0);
  const accumulated = useRef(0);
  const frames = useRef(0);
  const lastChange = useRef(-COOLDOWN_SECONDS);

  useFrame(({ clock }, delta) => {
    if (!enabled) return;
    elapsed.current += delta;
    accumulated.current += delta * 1000;
    frames.current += 1;
    if (elapsed.current < SAMPLE_SECONDS || clock.elapsedTime - lastChange.current < COOLDOWN_SECONDS) {
      return;
    }
    const average = accumulated.current / Math.max(1, frames.current);
    const next = nextAdaptiveDpr(current.current, average, maxDpr, minDpr);
    elapsed.current = 0;
    accumulated.current = 0;
    frames.current = 0;
    if (Math.abs(next - current.current) < 0.01) return;
    current.current = next;
    lastChange.current = clock.elapsedTime;
    setDpr(next);
  });

  return null;
}

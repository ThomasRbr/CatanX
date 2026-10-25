import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

export type AnimationSpeed = 0.5 | 1 | 1.5 | 2;

export interface AmbientAnimationState {
  /** Wall-clock seconds * speed (frozen when disabled). */
  time: number;
  speed: number;
  enabled: boolean;
  /** Wind direction radians (XZ). */
  windAngle: number;
  /** Global wind strength 0–1. */
  windStrength: number;
}

const AmbientAnimationContext = createContext<AmbientAnimationState>({
  time: 0,
  speed: 1,
  enabled: true,
  windAngle: 0.7,
  windStrength: 0.55,
});

interface AmbientAnimationProviderProps {
  children: ReactNode;
  enabled?: boolean;
  speed?: number;
  windAngle?: number;
  windStrength?: number;
}

/**
 * Single shared clock for ambient motion — avoids N independent useFrame clocks.
 * Consumers read `useAmbientAnimation()` each frame via refs or useFrame.
 */
export function AmbientAnimationProvider({
  children,
  enabled = true,
  speed = 1,
  windAngle = 0.7,
  windStrength = 0.55,
}: AmbientAnimationProviderProps) {
  const stateRef = useRef<AmbientAnimationState>({
    time: 0,
    speed,
    enabled,
    windAngle,
    windStrength,
  });

  // Keep latest props on the ref without reallocating context every frame.
  stateRef.current.speed = enabled ? speed : 0;
  stateRef.current.enabled = enabled;
  stateRef.current.windAngle = windAngle;
  stateRef.current.windStrength = enabled ? windStrength : 0;

  useFrame((_, dt) => {
    const s = stateRef.current;
    if (!s.enabled) return;
    s.time += dt * s.speed;
  });

  const value = useMemo(
    () => stateRef.current,
    // Identity stable — readers always see latest via the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <AmbientAnimationContext.Provider value={value}>{children}</AmbientAnimationContext.Provider>
  );
}

export function useAmbientAnimation(): AmbientAnimationState {
  return useContext(AmbientAnimationContext);
}

/** Resolve settings speed → numeric multiplier. */
export function animationSpeedToNumber(speed: AnimationSpeed | number | undefined): number {
  if (typeof speed === 'number' && Number.isFinite(speed)) return Math.max(0, Math.min(2, speed));
  return 1;
}

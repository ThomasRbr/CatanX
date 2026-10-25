import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GameState } from '@catanx/engine';
import { resolveAtmosphere } from '../env/atmosphere';
import { FOG_DECK_TOP, FogVolumeState, createFogDeckMaterial } from '../fx/fogVolume';
import { shouldRenderFog } from '../utils/fogVisibility';

interface FogOfWar3DProps {
  gameState: GameState;
  currentPlayerId: string;
  /**
   * Shared with the post chain. When the composer is active it ray-marches
   * the deck against scene depth; otherwise this component draws the
   * depth-less fallback itself.
   */
  volume?: FogVolumeState | null;
  /** True when the composer's FogVolumeEffect is drawing the deck. */
  volumetric?: boolean;
  season?: string;
  climateId?: string | null;
}

function FallbackDeck({ state }: { state: FogVolumeState }) {
  const material = useMemo(() => createFogDeckMaterial(state), [state]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      position={[0, FOG_DECK_TOP + 0.002, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      renderOrder={10}
      frustumCulled={false}
      raycast={() => undefined}
    >
      <planeGeometry args={[160, 160]} />
    </mesh>
  );
}

/**
 * Fog of war driver: keeps the cloud deck's visibility mask and lighting in
 * step with the game. Revealed tiles dissolve instead of popping.
 */
export function FogOfWar3D({
  gameState,
  currentPlayerId,
  volume = null,
  volumetric = false,
  season = 'summer',
  climateId = null,
}: FogOfWar3DProps) {
  const enabled =
    shouldRenderFog(Boolean(gameState.config.fogOfWar), gameState.phase) && Boolean(currentPlayerId);
  const ownState = useMemo(() => (volume ? null : new FogVolumeState()), [volume]);
  const state = volume ?? ownState!;
  const lastViewer = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      state.setEnabled(false);
      lastViewer.current = null;
      return;
    }
    // Same viewer → dissolve the change; new viewer (hot seat) → cut.
    const animate = lastViewer.current === currentPlayerId;
    state.setMask({ tiles: gameState.map.values(), playerId: currentPlayerId }, animate);
    state.setEnabled(true);
    lastViewer.current = currentPlayerId;
  }, [currentPlayerId, enabled, gameState.map, state]);

  useEffect(() => {
    const grade = resolveAtmosphere({ season, climateId });
    state.setLighting(grade.sunDirection, grade.sunColor, grade.sunIntensity, grade.zenith, grade.horizon);
  }, [climateId, season, state]);

  useEffect(
    () => () => {
      state.setEnabled(false);
      ownState?.dispose();
    },
    [ownState, state],
  );

  useFrame((_, delta) => {
    if (state.enabled) state.tick(Math.min(delta, 0.1));
  });

  if (!enabled || volumetric) return null;
  return <FallbackDeck state={state} />;
}

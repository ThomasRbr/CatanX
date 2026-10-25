import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { GameState } from '@catanx/engine';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import { useMapLod } from '../camera/MapLodContext';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { edgeOffset } from '../utils/hexEdges';
import { shouldAnimateDecor } from '../utils/mapLod';
import { shouldCastDecorShadows } from '../utils/perfBudgets';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';

interface Robber3DProps {
  gameState: GameState;
  animate?: boolean;
}

/**
 * Robber offset from tile center so it does not bury the production token.
 * H4: subtle idle bob on the shared ambient clock.
 */
export function Robber3D({ gameState, animate = true }: Robber3DProps) {
  const lod = useMapLod();
  const ambient = useAmbientAnimation();
  const castShadow = shouldCastDecorShadows(lod);
  const bob = shouldAnimateDecor(animate, lod);
  const geo = useVisualGeometry('robber');
  const groupRef = useRef<THREE.Group>(null);
  const fromRef = useRef({ x: 0, y: 0, z: 0 });
  const targetRef = useRef({ x: 0, y: 0, z: 0 });
  const moveStartRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const surface = useSurfaceHeight();
  const pos = useMemo(() => {
    const tileId =
      gameState.robberPosition ??
      [...gameState.map.values()].find((t) => t.robber)?.id ??
      null;
    if (!tileId) return null;
    const tile = gameState.map.get(tileId);
    if (!tile) return null;
    const c = cubeToWorld(tile.coord);
    const off = edgeOffset(0, HEX_WORLD_RADIUS * 0.32);
    return {
      x: c.x + off.x,
      // Stand on the relief, not on the old flat slab (it sank into hills).
      y: Math.max(surface.sampleHeight(c.x + off.x, c.z + off.z), HEX_SLAB_THICKNESS) + 0.03,
      z: c.z + off.z,
    };
  }, [gameState.map, gameState.robberPosition, surface]);

  useEffect(() => {
    if (!pos) return;
    const group = groupRef.current;
    if (!group || !initializedRef.current) {
      targetRef.current = pos;
      fromRef.current = pos;
      moveStartRef.current = null;
      initializedRef.current = true;
      group?.position.set(pos.x, pos.y, pos.z);
      return;
    }
    fromRef.current = { x: group.position.x, y: pos.y, z: group.position.z };
    targetRef.current = pos;
    moveStartRef.current = performance.now();
  }, [pos]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g || !pos) return;
    const start = moveStartRef.current;
    if (start != null) {
      const t = Math.min(1, (performance.now() - start) / 620);
      const eased = 1 - Math.pow(1 - t, 3);
      const from = fromRef.current;
      const target = targetRef.current;
      g.position.x = from.x + (target.x - from.x) * eased;
      g.position.z = from.z + (target.z - from.z) * eased;
      g.position.y = target.y + Math.sin(t * Math.PI) * 0.22;
      g.rotation.y = Math.sin(t * Math.PI) * 0.34;
      if (t >= 1) {
        moveStartRef.current = null;
        g.rotation.y = 0;
      }
      return;
    }
    if (!bob || !ambient.enabled) {
      g.position.y = pos.y;
      return;
    }
    g.position.y = pos.y + Math.sin(ambient.time * 1.6) * 0.018;
  });

  if (!pos) return null;

  return (
    <group ref={groupRef}>
      <mesh position={[0, -0.005, 0]} receiveShadow raycast={() => undefined}>
        <cylinderGeometry args={[0.18, 0.2, 0.025, 18]} />
        <meshPhysicalMaterial color="#202735" roughness={0.42} metalness={0.18} clearcoat={0.34} clearcoatRoughness={0.38} />
      </mesh>
      <mesh
        geometry={geo}
        scale={[1.2, 1.25, 1.2]}
        castShadow={castShadow}
        receiveShadow
        userData={{ kind: 'robber', id: 'robber' }}
        raycast={() => undefined}
      >
        <meshPhysicalMaterial vertexColors color="#303238" roughness={0.62} metalness={0.12} clearcoat={0.1} clearcoatRoughness={0.62} flatShading={false} />
      </mesh>
    </group>
  );
}

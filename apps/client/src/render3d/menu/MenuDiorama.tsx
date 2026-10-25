import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { seasonAccents, type SeasonToken } from '../../design/tokens';
import { seasonEnv } from '../utils/seasonVisuals';

const SEASON_ORDER: SeasonToken[] = ['spring', 'summer', 'autumn', 'winter'];
const CYCLE_MS = 14000;

function HexIsland({ season }: { season: SeasonToken }) {
  const group = useRef<THREE.Group>(null);
  const env = seasonEnv(season, { cinematic: true, living: true });
  const accent = seasonAccents[season];

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.08;
  });

  const tiles = useMemo(() => {
    const coords: Array<[number, number, string]> = [
      [0, 0, env.foliage],
      [1.55, 0, '#FFCD4A'],
      [-1.55, 0, '#57C785'],
      [0.78, 1.35, '#FF7C56'],
      [-0.78, 1.35, env.scrub],
      [0.78, -1.35, '#9a8a55'],
      [-0.78, -1.35, '#76B7FF'],
    ];
    return coords;
  }, [env.foliage, env.scrub]);

  return (
    <group ref={group} position={[0, -0.2, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <circleGeometry args={[4.2, 48]} />
        <meshStandardMaterial color={env.waterMid} roughness={0.35} metalness={0.05} />
      </mesh>
      {tiles.map(([x, z, color], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.72, 0.78, 0.16, 6]} />
            <meshStandardMaterial color={color} roughness={0.58} metalness={0.08} />
          </mesh>
          {i % 2 === 0 && (
            <mesh position={[0.1, 0.45, 0]} castShadow>
              <coneGeometry args={[0.18, 0.55, 6]} />
              <meshStandardMaterial color={env.foliage} roughness={0.48} />
            </mesh>
          )}
          {i === 0 && (
            <mesh position={[-0.15, 0.28, 0.1]} castShadow>
              <boxGeometry args={[0.28, 0.28, 0.28]} />
              <meshStandardMaterial color={accent} roughness={0.3} metalness={0.25} />
            </mesh>
          )}
        </group>
      ))}
      {[[-1.15, 0.14, -0.8], [1.15, 0.14, 0.8], [-0.8, 0.14, 1.15]].map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.28, 10]} />
          <meshStandardMaterial color={['#1FC8C4', '#FF6B5F', '#8B6CFF'][index]} roughness={0.32} metalness={0.18} />
        </mesh>
      ))}
    </group>
  );
}

function MenuScene() {
  const [season, setSeason] = useState<SeasonToken>('spring');
  const elapsed = useRef(0);
  const env = seasonEnv(season, { cinematic: true, living: true });
  const { camera } = useThree();

  useFrame((state, dt) => {
    elapsed.current += dt * 1000;
    const idx = Math.floor(elapsed.current / CYCLE_MS) % SEASON_ORDER.length;
    const next = SEASON_ORDER[idx]!;
    if (next !== season) setSeason(next);

    const t = state.clock.elapsedTime * 0.15;
    camera.position.set(Math.sin(t) * 0.6 + 3.2, 3.4, Math.cos(t) * 0.4 + 4.2);
    camera.lookAt(0, 0.2, 0);
  });

  return (
    <>
      <color attach="background" args={[env.background]} />
      <fog attach="fog" args={[env.fog, env.fogNear * 0.35, env.fogFar * 0.55]} />
      <ambientLight intensity={env.ambient + 0.15} />
      <hemisphereLight args={[env.hemiSky, env.hemiGround, env.hemiIntensity]} />
      <directionalLight
        position={[4, 8, 3]}
        intensity={env.sunIntensity}
        color={env.sunColor}
        castShadow
      />
      <HexIsland season={season} />
    </>
  );
}

export interface MenuDioramaProps {
  className?: string;
  enabled?: boolean;
}

/** Lazy-friendly menu diorama: miniature island + slow season cycle. */
export function MenuDiorama({ className, enabled = true }: MenuDioramaProps) {
  if (!enabled) return null;
  return (
    <div className={className} style={{ position: 'absolute', inset: 0, zIndex: 1 }} aria-hidden>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [3.2, 3.4, 4.2], fov: 38, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
        style={{ width: '100%', height: '100%' }}
      >
        <MenuScene />
      </Canvas>
    </div>
  );
}

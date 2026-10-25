import { useLayoutEffect, useMemo, useRef } from 'react';
import type { GameState } from '@catanx/engine';
import { isCitiesKnightsEnabled } from '@catanx/engine';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Group, Mesh } from 'three';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import { useMapLod } from '../camera/MapLodContext';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { playerColor } from '../utils/playerColors';
import { shouldCastDecorShadows } from '../utils/perfBudgets';
import { intersectionToWorld, buildWorldTopology } from '../utils/topologyToWorld';
import { buildBarbarianCoastRoute, type CoastRoutePoint } from './barbarianCoastRoute';

type WorldTopology = ReturnType<typeof buildWorldTopology>;

interface CkPieces3DProps {
  gameState: GameState;
  topology: WorldTopology;
}

export const CK_KNIGHT_ASSET_IDS = {
  1: 'ck_knight_basic',
  2: 'ck_knight_strong',
  3: 'ck_knight_mighty',
} as const;

export function getCkKnightAssetId(rank: 1 | 2 | 3) {
  return CK_KNIGHT_ASSET_IDS[rank];
}

export interface CkWallModulePlacement {
  kind: 'segment' | 'gate' | 'tower';
  angle: number;
  x: number;
  z: number;
  rotationY: number;
}

/** A six-sided modular enclosure sized to frame a city without hiding it. */
export function buildCkWallModules(): CkWallModulePlacement[] {
  const modules: CkWallModulePlacement[] = [];
  const sideRadius = 0.215;
  const towerRadius = 0.245;
  for (let index = 0; index < 6; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 3;
    modules.push({
      kind: index === 0 ? 'gate' : 'segment',
      angle,
      x: Math.cos(angle) * sideRadius,
      z: Math.sin(angle) * sideRadius,
      rotationY: -angle,
    });
    const cornerAngle = angle + Math.PI / 6;
    modules.push({
      kind: 'tower',
      angle: cornerAngle,
      x: Math.cos(cornerAngle) * towerRadius,
      z: Math.sin(cornerAngle) * towerRadius,
      rotationY: -cornerAngle,
    });
  }
  return modules;
}

function ActivationHalo({ color }: { color: string }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 2.8) * 0.055;
    ref.current.scale.setScalar(pulse);
  });
  return (
    <mesh
      ref={ref}
      position={[0, 0.008, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => undefined}
    >
      <ringGeometry args={[0.145, 0.19, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.72} toneMapped={false} />
    </mesh>
  );
}

export function PremiumKnightPiece({
  rank,
  activated,
  color,
  castShadow,
}: {
  rank: 1 | 2 | 3;
  activated: boolean;
  color: string;
  castShadow: boolean;
}) {
  const geometry = useVisualGeometry(getCkKnightAssetId(rank));
  return (
    <group>
      {activated && <ActivationHalo color={color} />}
      <mesh position={[0, 0.012, 0]} receiveShadow raycast={() => undefined}>
        <cylinderGeometry args={[0.135, 0.145, 0.026, 24]} />
        <meshPhysicalMaterial
          color="#393d40"
          roughness={0.58}
          metalness={0.42}
          clearcoat={0.16}
          clearcoatRoughness={0.6}
        />
      </mesh>
      <mesh
        position={[0, 0.026, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => undefined}
      >
        <ringGeometry args={[0.118, 0.14, 28]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={activated ? 0.2 : 0.06}
          roughness={0.42}
          metalness={0.2}
        />
      </mesh>
      <mesh
        geometry={geometry}
        scale={0.86 + rank * 0.015}
        castShadow={castShadow}
        receiveShadow
        raycast={() => undefined}
      >
        <meshPhysicalMaterial
          color={activated ? '#eee9df' : '#b7b8b5'}
          vertexColors
          roughness={0.36}
          metalness={0.18}
          clearcoat={0.12}
          clearcoatRoughness={0.68}
        />
      </mesh>
      {Array.from({ length: rank }, (_, index) => (
        <mesh
          key={index}
          position={[(index - (rank - 1) / 2) * 0.042, 0.045, 0.125]}
          castShadow={castShadow}
          raycast={() => undefined}
        >
          <sphereGeometry args={[0.012, 10, 8]} />
          <meshStandardMaterial
            color="#ffcd4a"
            emissive="#8b5e14"
            emissiveIntensity={0.35}
            metalness={0.72}
            roughness={0.24}
          />
        </mesh>
      ))}
    </group>
  );
}

const CK_WALL_MODULES = buildCkWallModules();

export function PremiumWallPiece({ color, castShadow }: { color: string; castShadow: boolean }) {
  const segmentGeometry = useVisualGeometry('ck_wall_segment');
  const gateGeometry = useVisualGeometry('ck_wall_gate');
  const towerGeometry = useVisualGeometry('ck_wall_tower');
  return (
    <group>
      <mesh
        position={[0, 0.006, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        raycast={() => undefined}
      >
        <ringGeometry args={[0.17, 0.285, 6]} />
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={0.2}
          roughness={0.5}
          metalness={0.18}
        />
      </mesh>
      {CK_WALL_MODULES.map((module, index) => {
        const geometry =
          module.kind === 'gate'
            ? gateGeometry
            : module.kind === 'tower'
              ? towerGeometry
              : segmentGeometry;
        return (
          <mesh
            key={`${module.kind}-${index}`}
            geometry={geometry}
            position={[module.x, 0.016, module.z]}
            rotation={[0, module.rotationY, 0]}
            scale={module.kind === 'tower' ? 0.82 : 0.78}
            castShadow={castShadow}
            receiveShadow
            raycast={() => undefined}
          >
            <meshPhysicalMaterial
              color="#ffffff"
              vertexColors
              roughness={0.5}
              metalness={0.16}
              clearcoat={0.22}
              clearcoatRoughness={0.7}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function CoastTrackTube({
  points,
  color,
  opacity,
  radius,
  emissiveIntensity = 0.22,
}: {
  points: readonly CoastRoutePoint[];
  color: string;
  opacity: number;
  radius: number;
  emissiveIntensity?: number;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        points.map((point) => new THREE.Vector3(point.x, 0.052, point.z)),
        false,
        'centripetal',
      ),
    [points],
  );
  if (points.length < 2) return null;
  return (
    <mesh raycast={() => undefined}>
      <tubeGeometry args={[curve, Math.max(20, points.length * 14), radius, 7, false]} />
      <meshPhysicalMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emissiveIntensity}
        transparent
        opacity={opacity}
        roughness={0.28}
        metalness={0.22}
        depthWrite={false}
      />
    </mesh>
  );
}

function PremiumBarbarianShip({
  route,
  position,
  castShadow,
}: {
  route: readonly CoastRoutePoint[];
  position: number;
  castShadow: boolean;
}) {
  const geometry = useVisualGeometry('ck_barbarian_ship');
  const outerRef = useRef<Group>(null);
  const bobRef = useRef<Group>(null);
  const initializedRef = useRef(false);
  const targetPosition = useRef(new THREE.Vector3());
  const targetYaw = useRef(0);
  const index = Math.min(route.length - 1, Math.max(0, position));
  const current = route[index] ?? route[0];
  const previous = route[Math.max(0, index - 1)];
  const next = route[Math.min(route.length - 1, index + 1)];
  const direction =
    current && previous && next
      ? index < route.length - 1
        ? { x: next.x - current.x, z: next.z - current.z }
        : { x: current.x - previous.x, z: current.z - previous.z }
      : null;
  const yaw = direction ? -Math.atan2(direction.z, direction.x) : 0;

  useLayoutEffect(() => {
    if (!current) return;
    targetPosition.current.set(current.x, 0.075, current.z);
    targetYaw.current = yaw;
    if (!initializedRef.current && outerRef.current) {
      outerRef.current.position.copy(targetPosition.current);
      outerRef.current.rotation.y = yaw;
      initializedRef.current = true;
    }
  }, [current, yaw]);

  useFrame(({ clock }, delta) => {
    if (outerRef.current) {
      const amount = 1 - Math.exp(-delta * 4.8);
      outerRef.current.position.lerp(targetPosition.current, amount);
      const angleDelta = Math.atan2(
        Math.sin(targetYaw.current - outerRef.current.rotation.y),
        Math.cos(targetYaw.current - outerRef.current.rotation.y),
      );
      outerRef.current.rotation.y += angleDelta * amount;
    }
    if (bobRef.current) {
      bobRef.current.position.y = Math.sin(clock.elapsedTime * 2.1) * 0.012;
      bobRef.current.rotation.z = Math.sin(clock.elapsedTime * 1.55) * 0.035;
    }
  });

  if (!current) return null;
  return (
    <group ref={outerRef}>
      <group ref={bobRef}>
        <mesh
          geometry={geometry}
          scale={1.42}
          castShadow={castShadow}
          receiveShadow
          raycast={() => undefined}
        >
          <meshPhysicalMaterial
            color="#ffffff"
            vertexColors
            roughness={0.34}
            metalness={0.2}
            clearcoat={0.42}
            clearcoatRoughness={0.52}
          />
        </mesh>
        <mesh
          position={[-0.27, -0.038, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[2.5, 1.05, 1]}
          raycast={() => undefined}
        >
          <ringGeometry args={[0.08, 0.125, 28]} />
          <meshBasicMaterial color="#e9ffff" transparent opacity={0.62} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function CoastTrackMarker({
  point,
  index,
  active,
  reached,
  destination,
  castShadow,
}: {
  point: CoastRoutePoint;
  index: number;
  active: boolean;
  reached: boolean;
  destination: boolean;
  castShadow: boolean;
}) {
  const haloRef = useRef<Mesh>(null);
  const accent = destination ? '#ffcd4a' : reached ? '#ff6b5f' : '#1fc8c4';

  useFrame(({ clock }) => {
    if (!haloRef.current) return;
    const pulse = active ? 1 + Math.sin(clock.elapsedTime * 3.2) * 0.16 : 1;
    haloRef.current.scale.setScalar(pulse);
    const material = haloRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = active ? 0.3 + Math.sin(clock.elapsedTime * 3.2) * 0.09 : 0.12;
  });

  return (
    <group position={[point.x, 0.05, point.z]}>
      <mesh
        ref={haloRef}
        position={[0, 0.008, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => undefined}
      >
        <ringGeometry args={[destination ? 0.09 : 0.072, destination ? 0.14 : 0.115, 28]} />
        <meshBasicMaterial color={accent} transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh castShadow={castShadow} receiveShadow raycast={() => undefined}>
        <cylinderGeometry
          args={[destination ? 0.092 : 0.068, destination ? 0.102 : 0.076, 0.052, 18]}
        />
        <meshPhysicalMaterial
          color="#202735"
          roughness={0.3}
          metalness={0.68}
          clearcoat={0.38}
          clearcoatRoughness={0.45}
        />
      </mesh>
      <mesh position={[0, 0.029, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <torusGeometry args={[destination ? 0.075 : 0.054, 0.011, 9, 24]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={active || destination ? 1.1 : reached ? 0.62 : 0.28}
          roughness={0.24}
          metalness={0.52}
        />
      </mesh>
      <mesh position={[0, destination ? 0.14 : 0.085, 0]} raycast={() => undefined}>
        {destination ? (
          <coneGeometry args={[0.055, 0.16, 6]} />
        ) : (
          <octahedronGeometry args={[active ? 0.042 : 0.033, 0]} />
        )}
        <meshPhysicalMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={active ? 1.25 : 0.48}
          roughness={0.18}
          metalness={0.24}
          clearcoat={0.7}
        />
      </mesh>
      {destination && (
        <mesh position={[0, 0.195, 0]} raycast={() => undefined}>
          <sphereGeometry args={[0.026, 12, 8]} />
          <meshBasicMaterial color="#fff2b3" toneMapped={false} />
        </mesh>
      )}
      <mesh position={[0, 0.056, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <circleGeometry args={[0.018 + (index % 2) * 0.004, 12]} />
        <meshBasicMaterial color="#f7f8fc" opacity={0.82} transparent />
      </mesh>
    </group>
  );
}

function BarbarianCoastTrack({
  route,
  position,
  castShadow,
}: {
  route: readonly CoastRoutePoint[];
  position: number;
  castShadow: boolean;
}) {
  const safePosition = Math.min(route.length - 1, Math.max(0, position));
  const visited = useMemo(() => route.slice(0, safePosition + 1), [route, safePosition]);
  if (route.length < 2) return null;
  return (
    <group>
      <CoastTrackTube
        points={route}
        color="#172337"
        opacity={0.4}
        radius={0.029}
        emissiveIntensity={0.08}
      />
      <CoastTrackTube
        points={route}
        color="#83eeea"
        opacity={0.88}
        radius={0.015}
        emissiveIntensity={0.8}
      />
      {visited.length >= 2 && (
        <CoastTrackTube
          points={visited}
          color="#ff6b5f"
          opacity={0.96}
          radius={0.022}
          emissiveIntensity={0.95}
        />
      )}
      {route.map((point, index) => {
        return (
          <CoastTrackMarker
            key={`barbarian-step-${index}`}
            point={point}
            index={index}
            active={index === safePosition}
            reached={index <= safePosition}
            destination={index === route.length - 1}
            castShadow={castShadow}
          />
        );
      })}
      <PremiumBarbarianShip route={route} position={safePosition} castShadow={castShadow} />
    </group>
  );
}

/**
 * Jetons C&K distincts des units Armées : chevaliers, murailles,
 * marchand, ornements de métropole, navire barbare (piste).
 */
export function CkPieces3D({ gameState, topology }: CkPieces3DProps) {
  const lod = useMapLod();
  const castShadow = shouldCastDecorShadows(lod);

  const pieces = useMemo(() => {
    if (!isCitiesKnightsEnabled(gameState) || !gameState.extensions?.citiesKnights) {
      return null;
    }
    const ck = gameState.extensions.citiesKnights;

    const knights = ck.knights
      .filter((k) => k.intersectionId)
      .map((k) => {
        const intersection = topology.intersections[k.intersectionId!];
        if (!intersection) return null;
        const base = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.04);
        // Léger décalage pour ne pas recouvrir la construction
        const player = gameState.players.get(k.ownerId);
        return {
          id: k.id,
          rank: k.rank,
          activated: k.activated,
          color: playerColor(player?.color),
          x: base.x + 0.14,
          y: base.y,
          z: base.z - 0.1,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      rank: 1 | 2 | 3;
      activated: boolean;
      color: string;
      x: number;
      y: number;
      z: number;
    }>;

    const walls = Object.entries(ck.walls)
      .map(([intersectionId, ownerId]) => {
        const intersection = topology.intersections[intersectionId];
        if (!intersection) return null;
        const base = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.015);
        const player = gameState.players.get(ownerId);
        return {
          id: `wall-${intersectionId}`,
          color: playerColor(player?.color),
          x: base.x,
          y: base.y,
          z: base.z,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      color: string;
      x: number;
      y: number;
      z: number;
    }>;

    let merchant: { x: number; y: number; z: number } | null = null;
    if (ck.merchant?.tileId) {
      const tile = gameState.map.get(ck.merchant.tileId);
      if (tile) {
        const c = cubeToWorld(tile.coord);
        merchant = {
          x: c.x + HEX_WORLD_RADIUS * 0.28,
          y: HEX_SLAB_THICKNESS + 0.06,
          z: c.z - HEX_WORLD_RADIUS * 0.18,
        };
      }
    }

    const metros = (['trade', 'politics', 'science'] as const)
      .map((track) => {
        const slot = ck.metropolises[track];
        if (!slot.ownerId || !slot.intersectionId) return null;
        const intersection = topology.intersections[slot.intersectionId];
        if (!intersection) return null;
        const base = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.28);
        const accent = track === 'trade' ? '#c9a227' : track === 'politics' ? '#5b7c99' : '#6b8f71';
        return {
          id: `metro-${track}`,
          accent,
          x: base.x,
          y: base.y,
          z: base.z,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      accent: string;
      x: number;
      y: number;
      z: number;
    }>;

    const landCenters = [...gameState.map.values()]
      .filter((tile) => tile.terrain !== 'ocean')
      .map((tile) => cubeToWorld(tile.coord));
    const barbarianRoute = buildBarbarianCoastRoute(
      landCenters,
      ck.barbarianTrackLength,
      HEX_WORLD_RADIUS * 1.16,
    );

    return {
      knights,
      walls,
      merchant,
      metros,
      barbarianRoute,
      barbarianPosition: ck.barbarianTrackPosition,
    };
  }, [gameState, topology]);

  if (!pieces) return null;

  return (
    <group>
      {pieces.knights.map((k) => (
        <group key={k.id} position={[k.x, k.y, k.z]}>
          <PremiumKnightPiece
            rank={k.rank}
            activated={k.activated}
            color={k.color}
            castShadow={castShadow}
          />
        </group>
      ))}

      {pieces.walls.map((w) => (
        <group key={w.id} position={[w.x, w.y, w.z]}>
          <PremiumWallPiece color={w.color} castShadow={castShadow} />
        </group>
      ))}

      {pieces.merchant && (
        <group position={[pieces.merchant.x, pieces.merchant.y, pieces.merchant.z]}>
          <mesh castShadow={castShadow} raycast={() => undefined}>
            <octahedronGeometry args={[0.09, 0]} />
            <meshStandardMaterial color="#d4a017" roughness={0.4} metalness={0.55} flatShading />
          </mesh>
        </group>
      )}

      {pieces.metros.map((m) => (
        <group key={m.id} position={[m.x, m.y, m.z]}>
          <mesh castShadow={castShadow} raycast={() => undefined}>
            <cylinderGeometry args={[0.05, 0.07, 0.22, 6]} />
            <meshStandardMaterial color={m.accent} roughness={0.55} metalness={0.35} flatShading />
          </mesh>
          <mesh position={[0, 0.16, 0]} raycast={() => undefined}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color="#f5e6a8" roughness={0.35} metalness={0.5} flatShading />
          </mesh>
        </group>
      ))}

      <BarbarianCoastTrack
        route={pieces.barbarianRoute}
        position={pieces.barbarianPosition}
        castShadow={castShadow}
      />
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { CatanTopology, GameState } from '@catanx/engine';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import { useMapLod } from '../camera/MapLodContext';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { playerColor } from '../utils/playerColors';
import { shouldAnimateDecor } from '../utils/mapLod';
import { shouldCastDecorShadows } from '../utils/perfBudgets';
import { intersectionStackOffset, tileStackOffset } from '../utils/stackOffset';
import { intersectionToWorld } from '../utils/topologyToWorld';
import { resolveBuildingVisual, type BuildingVisual } from '../utils/buildingVisual';
import { HpBar3D } from './HpBar3D';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import type { BoardViewMode } from '../camera/viewMode';
import { isCinematicView } from '../camera/viewMode';
import { RealisticSettlementAsset } from './RealisticSettlementAsset';
import { RealisticVillage } from './RealisticVillage';
import { SettlementGroundApron } from './SettlementGroundApron';

/**
 * Global size of every placed building.
 *
 * A settlement has to be findable without dominating the tile it sits on. At
 * 1.0 the models covered most of a hex and the terrain underneath stopped
 * reading at all.
 */
const SETTLEMENT_SCALE = 0.72;


interface Buildings3DProps {
  gameState: GameState;
  topology: CatanTopology;
  season?: string;
  viewMode?: BoardViewMode;
}

/** Player accent on banner only — keep baked house materials readable. */
function PlayerBanner({
  color,
  castShadow,
  offset = 0.14,
  animate = true,
}: {
  color: string;
  castShadow: boolean;
  offset?: number;
  animate?: boolean;
}) {
  const geo = useVisualGeometry('banner_a');
  const groupRef = useRef<THREE.Group>(null);
  const ambient = useAmbientAnimation();
  const lod = useMapLod();
  const sway = shouldAnimateDecor(animate && ambient.enabled, lod);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!sway) {
      g.rotation.z = 0;
      return;
    }
    const t = ambient.time;
    g.rotation.z = Math.sin(t * 2.2 + offset * 8) * 0.12 * ambient.windStrength;
  });

  return (
    <group ref={groupRef} position={[offset, 0, -0.04]} scale={[0.72, 0.72, 0.72]}>
      <mesh geometry={geo} castShadow={castShadow} raycast={() => undefined}>
        <meshStandardMaterial
          color={color}
          vertexColors
          roughness={0.78}
          metalness={0.04}
          flatShading={false}
        />
      </mesh>
    </group>
  );
}

function SettlementCluster({
  color,
  castShadow,
  buildingId,
  civilization: _civilization,
  scale = 1,
  season = 'summer',
  dense = false,
}: {
  color: string;
  castShadow: boolean;
  buildingId: string;
  civilization?: string | null;
  scale?: number;
  season?: string;
  dense?: boolean;
}) {
  return (
    <group rotation={[0, stableVillageAngle(buildingId) * 0.18, 0]} scale={[scale * SETTLEMENT_SCALE, scale * SETTLEMENT_SCALE, scale * SETTLEMENT_SCALE]}>
      {dense ? (
        <RealisticVillage
          castShadow={castShadow}
          scale={0.98}
          season={season}
          villageId={buildingId}
          roofColor={color}
        />
      ) : (
        <RealisticSettlementAsset castShadow={castShadow} scale={0.95} season={season} roofColor={color} />
      )}
      <PlayerBanner color={color} castShadow={castShadow} offset={0.14} />
    </group>
  );
}

function CityCluster({
  color,
  castShadow,
  buildingId,
  civilization: _civilization,
  tall = false,
  season = 'summer',
  dense = false,
}: {
  color: string;
  castShadow: boolean;
  buildingId: string;
  civilization?: string | null;
  tall?: boolean;
  season?: string;
  dense?: boolean;
}) {
  const s = tall ? 1.28 : 1.18;
  return (
    <group rotation={[0, stableVillageAngle(buildingId) * 0.14, 0]} scale={[s * SETTLEMENT_SCALE, s * SETTLEMENT_SCALE * (tall ? 1.06 : 1.02), s * SETTLEMENT_SCALE]}>
      {dense ? (
        <RealisticVillage
          castShadow={castShadow}
          urban
          scale={tall ? 0.94 : 0.88}
          season={season}
          villageId={buildingId}
          roofColor={color}
        />
      ) : (
        <RealisticSettlementAsset castShadow={castShadow} urban scale={tall ? 0.92 : 0.86} season={season} roofColor={color} />
      )}
      <PlayerBanner color={color} castShadow={castShadow} offset={0.24} />
    </group>
  );
}

function stableVillageAngle(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 6283) / 1000;
}

function SettlementModel({
  color,
  scale = 1,
  castShadow,
  variant = 0,
}: {
  color: string;
  scale?: number;
  castShadow: boolean;
  variant?: number;
}) {
  const assetId = variant % 2 === 0 ? 'house_settlement_a' : 'house_settlement_b';
  const geo = useVisualGeometry(assetId);
  return (
    <group scale={[scale * SETTLEMENT_SCALE, scale * SETTLEMENT_SCALE, scale * SETTLEMENT_SCALE]}>
      <mesh geometry={geo} castShadow={castShadow} receiveShadow raycast={() => undefined}>
        <meshPhysicalMaterial
          color="#ffffff"
          vertexColors
          roughness={0.56}
          metalness={0.06}
          clearcoat={0.22}
          clearcoatRoughness={0.38}
          flatShading={false}
        />
      </mesh>
      <PlayerBanner color={color} castShadow={castShadow} offset={0.13} />
    </group>
  );
}

function AdvancedModel({
  visual,
  color,
  level,
  castShadow,
}: {
  visual: BuildingVisual;
  color: string;
  level: number;
  castShadow: boolean;
}) {
  const scale = 1 + Math.max(0, level - 1) * 0.08;
  switch (visual) {
    case 'farm':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh position={[0, 0.05, 0]} castShadow={castShadow} receiveShadow raycast={() => undefined}>
            <boxGeometry args={[0.22, 0.1, 0.16]} />
            <meshStandardMaterial color="#cfc0a4" roughness={0.92} metalness={0.03} flatShading={false} />
          </mesh>
          <mesh position={[0.08, 0.16, 0]} castShadow={castShadow} raycast={() => undefined}>
            <cylinderGeometry args={[0.05, 0.06, 0.18, 8]} />
            <meshStandardMaterial color="#b8a070" roughness={0.88} metalness={0.04} flatShading={false} />
          </mesh>
          <mesh position={[0, 0.01, 0]} receiveShadow raycast={() => undefined}>
            <cylinderGeometry args={[0.14, 0.14, 0.025, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} metalness={0.04} flatShading={false} />
          </mesh>
        </group>
      );
    case 'mine':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh
            position={[0, 0.06, 0]}
            rotation={[0.2, 0.4, 0]}
            castShadow={castShadow}
            raycast={() => undefined}
          >
            <boxGeometry args={[0.2, 0.1, 0.14]} />
            <meshStandardMaterial color="#6a6e74" roughness={0.95} metalness={0.12} flatShading={false} />
          </mesh>
          <mesh position={[-0.06, 0.14, 0.02]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.08, 0.16, 0.08]} />
            <meshStandardMaterial color="#4a4e54" roughness={0.9} metalness={0.1} flatShading={false} />
          </mesh>
          <mesh position={[0, 0.01, 0]} receiveShadow raycast={() => undefined}>
            <cylinderGeometry args={[0.14, 0.14, 0.025, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} flatShading={false} />
          </mesh>
        </group>
      );
    case 'market':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh position={[0, 0.05, 0]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.2, 0.08, 0.16]} />
            <meshStandardMaterial color="#d8cbb0" roughness={0.9} metalness={0.04} flatShading={false} />
          </mesh>
          <mesh position={[0, 0.12, 0]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.24, 0.04, 0.18]} />
            <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} flatShading={false} />
          </mesh>
        </group>
      );
    case 'library':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh position={[0, 0.1, 0]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.18, 0.18, 0.14]} />
            <meshStandardMaterial color="#d0c4b0" roughness={0.88} metalness={0.04} flatShading={false} />
          </mesh>
          <mesh position={[-0.05, 0.22, 0]} castShadow={castShadow} raycast={() => undefined}>
            <cylinderGeometry args={[0.025, 0.025, 0.16, 6]} />
            <meshStandardMaterial color="#e8e0d0" roughness={0.8} metalness={0.05} flatShading={false} />
          </mesh>
          <mesh position={[0.05, 0.22, 0]} castShadow={castShadow} raycast={() => undefined}>
            <cylinderGeometry args={[0.025, 0.025, 0.16, 6]} />
            <meshStandardMaterial color="#e8e0d0" roughness={0.8} metalness={0.05} flatShading={false} />
          </mesh>
          <mesh position={[0, 0.01, 0]} receiveShadow raycast={() => undefined}>
            <cylinderGeometry args={[0.13, 0.13, 0.025, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} metalness={0.04} flatShading={false} />
          </mesh>
        </group>
      );
    case 'barracks':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh position={[0, 0.1, 0]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.2, 0.18, 0.18]} />
            <meshStandardMaterial color="#8a7a68" roughness={0.92} metalness={0.06} flatShading={false} />
          </mesh>
          <mesh position={[-0.08, 0.22, -0.06]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} metalness={0.08} flatShading={false} />
          </mesh>
          <mesh position={[0.08, 0.22, -0.06]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} metalness={0.08} flatShading={false} />
          </mesh>
        </group>
      );
    case 'wall':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh position={[0, 0.08, 0]} castShadow={castShadow} raycast={() => undefined}>
            <torusGeometry args={[0.16, 0.035, 6, 12]} />
            <meshStandardMaterial color="#7a7068" roughness={0.95} metalness={0.05} flatShading={false} />
          </mesh>
          <mesh position={[0, 0.01, 0]} receiveShadow raycast={() => undefined}>
            <cylinderGeometry args={[0.14, 0.14, 0.025, 10]} />
            <meshStandardMaterial color={color} roughness={0.9} metalness={0.04} flatShading={false} />
          </mesh>
        </group>
      );
    case 'harbor':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh position={[0, 0.03, 0.06]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.14, 0.05, 0.28]} />
            <meshStandardMaterial color="#8a6a48" roughness={0.9} metalness={0.04} flatShading={false} />
          </mesh>
          <mesh position={[0, 0.1, 0.14]} castShadow={castShadow} raycast={() => undefined}>
            <boxGeometry args={[0.08, 0.12, 0.08]} />
            <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} flatShading={false} />
          </mesh>
        </group>
      );
    case 'temple':
      return (
        <group scale={[scale, scale, scale]}>
          <mesh position={[0, 0.08, 0]} castShadow={castShadow} raycast={() => undefined}>
            <cylinderGeometry args={[0.1, 0.12, 0.14, 6]} />
            <meshStandardMaterial color="#d8cbb0" roughness={0.88} metalness={0.05} flatShading={false} />
          </mesh>
          <mesh
            position={[0, 0.22, 0]}
            rotation={[0, Math.PI / 6, 0]}
            castShadow={castShadow}
            raycast={() => undefined}
          >
            <coneGeometry args={[0.12, 0.16, 4]} />
            <meshStandardMaterial color={color} roughness={0.75} metalness={0.1} flatShading={false} />
          </mesh>
        </group>
      );
    default:
      return <SettlementModel color={color} scale={scale} castShadow={castShadow} />;
  }
}

function BuildingMesh({
  visual,
  color,
  level,
  health,
  isActive,
  castShadow,
  buildingId,
  civilization,
  season,
  dense,
}: {
  visual: BuildingVisual;
  color: string;
  level: number;
  health: number;
  isActive: boolean;
  castShadow: boolean;
  buildingId: string;
  civilization?: string | null;
  season: string;
  dense: boolean;
}) {
  const pieceRef = useRef<THREE.Group>(null);
  const arrivalStart = useRef<number | null>(null);
  const arrivalDone = useRef(false);
  const ambient = useAmbientAnimation();

  useFrame(() => {
    const piece = pieceRef.current;
    if (!piece || arrivalDone.current) return;
    if (!ambient.enabled) {
      piece.position.y = 0;
      piece.scale.setScalar(1);
      arrivalDone.current = true;
      return;
    }
    const now = performance.now();
    arrivalStart.current ??= now;
    const t = Math.min(1, (now - arrivalStart.current) / 520);
    const eased = 1 - Math.pow(1 - t, 3);
    const settle = Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.055;
    piece.position.y = (1 - eased) * 0.34 + settle;
    piece.rotation.y = (1 - eased) * -0.28;
    piece.scale.setScalar(0.62 + eased * 0.38);
    if (t >= 1) {
      piece.position.y = 0;
      piece.rotation.y = 0;
      piece.scale.setScalar(1);
      arrivalDone.current = true;
    }
  });

  const visibilityRadius =
    visual === 'metropolis' ? 0.345 : visual === 'city' ? 0.318 : 0.232;

  return (
    <group ref={pieceRef}>
      {(visual === 'settlement' || visual === 'city' || visual === 'metropolis') && !dense && (
        <SettlementGroundApron
          radius={visual === 'settlement' ? 0.42 : visual === 'city' ? 0.55 : 0.62}
          rotation={(buildingId.length % 7) * 0.37}
          season={season}
          y={-0.052}
        />
      )}
      {/* Ownership as enamel accent only — never a glowing game-token halo. */}
      <mesh
        position={[0, 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => undefined}
        renderOrder={3}
      >
        <ringGeometry
          args={[
            visibilityRadius * 0.97,
            visibilityRadius,
            36,
          ]}
        />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.012}
          roughness={0.82}
          metalness={0.04}
          transparent
          opacity={0.28}
          side={2}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <group>
        {visual === 'settlement' && (
          <SettlementCluster
            color={color}
            scale={1 + (level - 1) * 0.06}
            castShadow={castShadow}
            buildingId={buildingId}
            civilization={civilization}
            season={season}
            dense={dense}
          />
        )}
        {visual === 'city' && (
          <CityCluster
            color={color}
            castShadow={castShadow}
            buildingId={buildingId}
            civilization={civilization}
            season={season}
            dense={dense}
          />
        )}
        {visual === 'metropolis' && (
          <CityCluster
            color={color}
            tall
            castShadow={castShadow}
            buildingId={buildingId}
            civilization={civilization}
            season={season}
            dense={dense}
          />
        )}
        {visual !== 'settlement' && visual !== 'city' && visual !== 'metropolis' && (
          <AdvancedModel visual={visual} color={color} level={level} castShadow={castShadow} />
        )}
      </group>
      {/* Only a damaged building carries a health bar; a full green bar over
          every house was noise on top of the board. */}
      {health < 100 && <HpBar3D
        ratio={health / 100}
        y={visual === 'metropolis' ? 0.72 : visual === 'city' ? 0.62 : 0.42}
        width={visual === 'settlement' ? 0.28 : 0.34}
      />}
      {!isActive && (
        <mesh position={[0, 0.12, 0]} raycast={() => undefined}>
          <sphereGeometry args={[0.28, 10, 8]} />
          <meshBasicMaterial color="#1a1a1a" transparent opacity={0.38} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Settlements, cities, and CatanX advanced buildings with stack offsets.
 */
export function Buildings3D({
  gameState,
  topology,
  season = 'summer',
  viewMode = 'strategic',
}: Buildings3DProps) {
  const lod = useMapLod();
  const quality = useRenderQuality();
  const castShadow = shouldCastDecorShadows(lod);
  const surfaceHeight = useSurfaceHeight();
  // Cinematic / close Ultra: Blender hamlets (pitched roofs + baked AO) via RealisticVillage.
  const dense =
    isCinematicView(viewMode)
    || (lod === 0 && (quality.id === 'ultra' || quality.id === 'high'));

  const items = useMemo(() => {
    const tileStack = new Map<string, number>();
    const intersectionStack = new Map<string, number>();
    const out: Array<{
      id: string;
      visual: BuildingVisual;
      color: string;
      level: number;
      health: number;
      isActive: boolean;
      civilization: string | null;
      x: number;
      y: number;
      z: number;
    }> = [];

    for (const building of gameState.buildings.values()) {
      const player = gameState.players.get(building.ownerId);
      const color = playerColor(player?.color);
      const visual = resolveBuildingVisual(building.definitionId);
      const civilization = player?.civilization ?? null;

      if (building.placementKind === 'intersection' && building.placementIntersectionId) {
        const intersection = topology.intersections[building.placementIntersectionId];
        if (intersection) {
          const idx = intersectionStack.get(building.placementIntersectionId) ?? 0;
          intersectionStack.set(building.placementIntersectionId, idx + 1);
          const flat = intersectionToWorld(intersection, 0);
          const base = intersectionToWorld(
            intersection,
            surfaceHeight.sampleHeight(flat.x, flat.z) + 0.068,
          );
          const off = intersectionStackOffset(idx);
          out.push({
            id: building.id,
            visual,
            color,
            level: building.level,
            health: building.health,
            isActive: building.isActive,
            civilization,
            x: base.x + off.x,
            y: base.y,
            z: base.z + off.z,
          });
          continue;
        }
      }

      const tile = gameState.map.get(building.tileId);
      if (!tile) continue;
      const idx = tileStack.get(building.tileId) ?? 0;
      tileStack.set(building.tileId, idx + 1);
      const c = cubeToWorld(tile.coord);
      const off = tileStackOffset(idx);
      out.push({
        id: building.id,
        visual,
        color,
        level: building.level,
        health: building.health,
        isActive: building.isActive,
        civilization,
        x: c.x + off.x,
        y: surfaceHeight.sampleTileHeight(tile.id, off.x, off.z) + 0.068,
        z: c.z + off.z,
      });
    }
    return out;
  }, [gameState, surfaceHeight, topology]);

  return (
    <group>
      {items.map((item) => (
        <group key={item.id} position={[item.x, item.y, item.z]} userData={{ kind: 'building', id: item.id }}>
          <BuildingMesh
            visual={item.visual}
            color={item.color}
            level={item.level}
            health={item.health}
            isActive={item.isActive}
            castShadow={castShadow}
            buildingId={item.id}
            civilization={item.civilization}
            season={season}
            dense={dense}
          />
        </group>
      ))}
    </group>
  );
}

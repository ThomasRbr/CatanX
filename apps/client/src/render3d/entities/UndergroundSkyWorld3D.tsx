import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState, SkySiteKind, UndergroundDiscoveryKind } from '@catanx/engine';
import { isUndergroundSkyEnabled } from '@catanx/engine';
import type { BoardLayer } from '../../components/Map/boardLayer';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld } from '../utils/hexToWorld';
import { playerColor } from '../utils/playerColors';
import { buildWorldTopology, intersectionToWorld } from '../utils/topologyToWorld';

type WorldTopology = ReturnType<typeof buildWorldTopology>;

interface UndergroundSkyWorld3DProps {
  gameState: GameState;
  layer: BoardLayer;
  currentPlayerId: string;
  topology: WorldTopology;
  animate: boolean;
}

const DISCOVERY_COLORS: Record<UndergroundDiscoveryKind, string> = {
  fossil_roots: '#9a775a',
  clay_bank: '#d07455',
  fungiculture: '#df9cff',
  woolly_lichen: '#9fd7b4',
  iron_vein: '#9db0c2',
  crystal_geode: '#62f2e7',
  aether_breath: '#a78cff',
  thermal_spring: '#ff9f72',
  natural_well: '#63c7ff',
  ancient_workshop: '#ffc85c',
  sealed_chamber: '#d7c5ff',
  unstable_fault: '#ff665f',
};

const SKY_SITE_COLORS: Record<SkySiteKind, string> = {
  calm_mooring: '#e8f4ff',
  aether_source: '#a889ff',
  floating_garden: '#9ce5ae',
  wind_bazaar: '#ffd271',
  observatory: '#72d9ee',
  hanging_ruins: '#e9c9a0',
  turbulent_zone: '#ff877d',
};

function Segment({
  from,
  to,
  color,
  radius,
  opacity = 1,
  emissive = false,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  radius: number;
  opacity?: number;
  emissive?: boolean;
}) {
  const transform = useMemo(() => {
    const midpoint = from.clone().add(to).multiplyScalar(0.5);
    const direction = to.clone().sub(from);
    const length = direction.length();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return { midpoint, length, quaternion };
  }, [from, to]);

  return (
    <mesh
      position={transform.midpoint}
      quaternion={transform.quaternion}
      raycast={() => undefined}
      renderOrder={4}
    >
      <cylinderGeometry args={[radius, radius, transform.length, 10]} />
      <meshPhysicalMaterial
        color={color}
        emissive={emissive ? color : '#000000'}
        emissiveIntensity={emissive ? 0.7 : 0}
        metalness={0.36}
        roughness={0.34}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity > 0.6}
      />
    </mesh>
  );
}

function CrystalCluster({ color, dangerous = false }: { color: string; dangerous?: boolean }) {
  const glow = dangerous ? '#ff524c' : color;
  return (
    <group>
      <mesh position={[0, 0.025, 0]} receiveShadow raycast={() => undefined}>
        <cylinderGeometry args={[0.23, 0.28, 0.05, 12]} />
        <meshPhysicalMaterial color="#5a3325" roughness={0.82} metalness={0.06} />
      </mesh>
      {[-0.11, 0, 0.12].map((x, index) => (
        <mesh
          key={x}
          position={[x, 0.12 + index * 0.035, index === 1 ? -0.03 : 0.04]}
          rotation={[0.08 * index, index * 0.55, 0.12 * (index - 1)]}
          scale={[0.09, 0.19 + index * 0.025, 0.09]}
          castShadow
          raycast={() => undefined}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshPhysicalMaterial
            color={color}
            emissive={glow}
            emissiveIntensity={dangerous ? 0.72 : 0.42}
            transmission={0.12}
            thickness={0.25}
            roughness={0.18}
            metalness={0.08}
            clearcoat={0.88}
          />
        </mesh>
      ))}
    </group>
  );
}

function SealedCavern({ index }: { index: number }) {
  return (
    <group rotation={[0, (index % 6) * (Math.PI / 3), 0]}>
      <mesh position={[0, -0.075, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <ringGeometry args={[0.25, 0.39, 6]} />
        <meshBasicMaterial color="#d08a5f" transparent opacity={0.38} depthWrite={false} />
      </mesh>
      {[0, 1, 2].map((rock) => {
        const angle = rock * (Math.PI * 2) / 3;
        return (
          <mesh
            key={rock}
            position={[Math.cos(angle) * 0.17, 0.015, Math.sin(angle) * 0.17]}
            scale={[0.1, 0.08 + rock * 0.018, 0.12]}
            raycast={() => undefined}
          >
            <dodecahedronGeometry args={[1, 0]} />
            <meshPhysicalMaterial color="#6a3d2b" roughness={0.92} metalness={0.02} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <circleGeometry args={[0.075, 16]} />
        <meshBasicMaterial color="#e6a06e" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ClayWallDetails({ index }: { index: number }) {
  const rotation = (index % 6) * (Math.PI / 3);
  const crystalColor = index % 4 === 0 ? '#62f2e7' : '#e7a16e';
  return (
    <group rotation={[0, rotation, 0]}>
      {[0, 1, 2].map((rock) => {
        const angle = -0.65 + rock * 0.58;
        const radius = 0.38 + (rock % 2) * 0.15;
        return (
          <mesh
            key={rock}
            position={[Math.cos(angle) * radius, 0.11 + rock * 0.035, Math.sin(angle) * radius]}
            rotation={[0.12 * rock, angle, 0.08 * (rock - 1)]}
            scale={[0.22 + rock * 0.035, 0.2 + rock * 0.055, 0.25]}
            castShadow
            receiveShadow
            raycast={() => undefined}
          >
            <dodecahedronGeometry args={[1, 0]} />
            <meshPhysicalMaterial
              color={rock === 1 ? '#6f402e' : '#503026'}
              roughness={0.94}
              metalness={0.015}
            />
          </mesh>
        );
      })}
      <mesh position={[0.3, 0.25, 0.03]} rotation={[0.1, 0.2, -0.08]} scale={[0.065, 0.25, 0.065]} raycast={() => undefined}>
        <octahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial color={crystalColor} emissive={crystalColor} emissiveIntensity={0.64} roughness={0.18} clearcoat={0.82} />
      </mesh>
      <pointLight position={[0.3, 0.34, 0.03]} color={crystalColor} intensity={0.32} distance={1.2} decay={2} />
    </group>
  );
}

function FloatingIsland({ color, index, animate }: { color: string; index: number; animate: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.72 + index * 1.7) * 0.045;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.18 + index) * 0.035;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, -0.04, 0]} castShadow receiveShadow raycast={() => undefined}>
        <cylinderGeometry args={[0.57, 0.27, 0.26, 7]} />
        <meshPhysicalMaterial color="#8a776a" roughness={0.82} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.105, 0]} castShadow receiveShadow raycast={() => undefined}>
        <cylinderGeometry args={[0.58, 0.58, 0.09, 7]} />
        <meshPhysicalMaterial color={color} roughness={0.58} clearcoat={0.25} />
      </mesh>
      <mesh position={[0, 0.215, 0]} raycast={() => undefined}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshPhysicalMaterial
          color="#f7fbff"
          emissive={color}
          emissiveIntensity={0.58}
          roughness={0.12}
          clearcoat={1}
        />
      </mesh>
      {[-0.25, 0.03, 0.27].map((x, shard) => (
        <mesh
          key={`shard-${x}`}
          position={[x, -0.27 - shard * 0.035, shard === 1 ? 0.1 : -0.06]}
          rotation={[0, shard * 0.5, Math.PI]}
          scale={[0.11 + shard * 0.018, 0.3 + shard * 0.07, 0.11]}
          castShadow
          raycast={() => undefined}
        >
          <coneGeometry args={[1, 1, 6]} />
          <meshPhysicalMaterial color="#66564f" roughness={0.86} metalness={0.04} />
        </mesh>
      ))}
      {[-0.27, 0.24].map((x, tree) => (
        <group key={`garden-${x}`} position={[x, 0.22, tree ? 0.04 : -0.08]} scale={0.72}>
          <mesh position={[0, 0.055, 0]} castShadow raycast={() => undefined}>
            <cylinderGeometry args={[0.018, 0.026, 0.11, 8]} />
            <meshStandardMaterial color="#79533b" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.15, 0]} castShadow raycast={() => undefined}>
            <sphereGeometry args={[0.095, 12, 8]} />
            <meshPhysicalMaterial color={tree ? '#6ecb8f' : '#8ad69c'} roughness={0.75} clearcoat={0.12} />
          </mesh>
        </group>
      ))}
      <group position={[0.13, 0.2, -0.16]} scale={0.7}>
        <mesh position={[0, 0.1, 0]} castShadow raycast={() => undefined}>
          <cylinderGeometry args={[0.055, 0.075, 0.2, 10]} />
          <meshPhysicalMaterial color="#f2e7d2" roughness={0.42} metalness={0.1} clearcoat={0.28} />
        </mesh>
        <mesh position={[0, 0.23, 0]} raycast={() => undefined}>
          <octahedronGeometry args={[0.055, 0]} />
          <meshBasicMaterial color="#d6cbff" toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[-0.08, -0.26, 0.48]} raycast={() => undefined}>
        <cylinderGeometry args={[0.025, 0.012, 0.62, 8]} />
        <meshPhysicalMaterial color="#b8efff" transparent opacity={0.48} depthWrite={false} roughness={0.08} />
      </mesh>
      {[-0.42, 0.38].map((x) => (
        <mesh key={x} position={[x, -0.11, 0.1]} scale={[1.55, 0.5, 0.9]} raycast={() => undefined}>
          <sphereGeometry args={[0.22, 16, 10]} />
          <meshPhysicalMaterial color="#eef8ff" transparent opacity={0.62} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, -0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <ringGeometry args={[0.66, 0.72, 40]} />
        <meshBasicMaterial color="#cabdff" transparent opacity={0.32} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const SKY_CLOUDS = [
  [-6.2, 0.35, -4.4, 1.8],
  [-3.4, 0.18, 4.8, 1.45],
  [0.2, 0.25, -5.5, 1.6],
  [4.8, 0.3, -3.8, 1.5],
  [6.1, 0.16, 1.6, 1.85],
  [3.8, 0.2, 5.1, 1.35],
  [-5.8, 0.24, 2.1, 1.55],
  [0.5, 0.12, 6.2, 1.7],
] as const;

function SkyCloudField({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.045) * 0.025;
    ref.current.position.x = Math.sin(clock.elapsedTime * 0.09) * 0.12;
  });
  return (
    <group ref={ref}>
      {SKY_CLOUDS.map(([x, y, z, scale], index) => (
        <group key={`${x}-${z}`} position={[x, y, z]} scale={scale}>
          {[-0.42, 0, 0.42].map((offset, puff) => (
            <mesh
              key={offset}
              position={[offset, puff === 1 ? 0.09 : 0, (puff - 1) * 0.08]}
              scale={[1.35, 0.35 + (puff === 1 ? 0.08 : 0), 0.78]}
              raycast={() => undefined}
              renderOrder={-2}
            >
              <sphereGeometry args={[0.62, 20, 12]} />
              <meshPhysicalMaterial
                color={index % 2 ? '#f4f1ff' : '#f7fbff'}
                emissive={index % 2 ? '#8e7fe6' : '#7cc7ed'}
                emissiveIntensity={0.08}
                transparent
                opacity={0.44}
                depthWrite={false}
                roughness={0.92}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function AetherVortex({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.08;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.18) * 0.08;
  });
  return (
    <group ref={ref} position={[0, 0.56, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {[1.15, 1.42, 1.72].map((radius, index) => (
        <mesh key={radius} raycast={() => undefined} renderOrder={2}>
          <torusGeometry args={[radius, 0.018 + index * 0.008, 10, 64]} />
          <meshBasicMaterial
            color={index === 1 ? '#f6d8ff' : '#b9f5ff'}
            transparent
            opacity={0.34 - index * 0.06}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <pointLight position={[0, 0, 0.45]} color="#aa8cff" intensity={0.55} distance={5.5} decay={2} />
    </group>
  );
}

function SkyLanePulse({
  from,
  to,
  reverse,
  index,
  animate,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  reverse: boolean;
  index: number;
  animate: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    const raw = (clock.elapsedTime * 0.17 + index * 0.23) % 1;
    const progress = reverse ? 1 - raw : raw;
    ref.current.position.lerpVectors(from, to, progress);
  });
  const initial = reverse ? to : from;
  return (
    <mesh ref={ref} position={initial} raycast={() => undefined} renderOrder={6}>
      <sphereGeometry args={[0.055, 12, 8]} />
      <meshBasicMaterial color="#f5f0ff" toneMapped={false} />
      <pointLight color="#a992ff" intensity={0.24} distance={0.9} decay={2} />
    </mesh>
  );
}

function PremiumAirship({ color, animate, index }: { color: string; animate: boolean; index: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.15 + index) * 0.035;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.72 + index) * 0.025;
  });
  return (
    <group ref={ref} scale={0.94}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow raycast={() => undefined}>
        <capsuleGeometry args={[0.12, 0.38, 8, 18]} />
        <meshPhysicalMaterial color="#f4eadb" roughness={0.38} clearcoat={0.48} />
      </mesh>
      <mesh position={[0, -0.19, 0]} castShadow raycast={() => undefined}>
        <boxGeometry args={[0.3, 0.1, 0.13]} />
        <meshPhysicalMaterial color={color} roughness={0.32} metalness={0.25} clearcoat={0.55} />
      </mesh>
      <mesh position={[-0.16, -0.1, 0]} rotation={[0, 0, -0.25]} raycast={() => undefined}>
        <boxGeometry args={[0.18, 0.02, 0.32]} />
        <meshPhysicalMaterial color="#d9b468" roughness={0.45} metalness={0.32} />
      </mesh>
    </group>
  );
}

function SurfaceGate({ kind, color }: { kind: 'shaft' | 'airport'; color: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <torusGeometry args={[kind === 'shaft' ? 0.2 : 0.25, 0.035, 10, 28]} />
        <meshPhysicalMaterial color={color} metalness={0.62} roughness={0.24} clearcoat={0.6} />
      </mesh>
      {kind === 'airport' && (
        <mesh position={[0, 0.14, 0]} castShadow raycast={() => undefined}>
          <cylinderGeometry args={[0.035, 0.06, 0.28, 12]} />
          <meshPhysicalMaterial color="#f7f8fc" metalness={0.3} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

export function UndergroundSkyWorld3D({
  gameState,
  layer,
  currentPlayerId,
  topology,
  animate,
}: UndergroundSkyWorld3DProps) {
  if (!isUndergroundSkyEnabled(gameState)) return null;
  const extension = gameState.extensions?.undergroundSky;
  if (!extension) return null;

  const nodePositions = new Map<string, THREE.Vector3>();
  for (const node of Object.values(extension.undergroundGraph.nodes)) {
    const tile = gameState.map.get(node.surfaceTileId);
    if (!tile) continue;
    const world = cubeToWorld(tile.coord);
    nodePositions.set(node.id, new THREE.Vector3(world.x, HEX_SLAB_THICKNESS + 0.19, world.z));
  }

  const hubPositions = new Map<string, THREE.Vector3>();
  Object.values(extension.skyGraph.hubs).forEach((hub, index) => {
    const tile = hub.anchorTileId ? gameState.map.get(hub.anchorTileId) : undefined;
    if (!tile) return;
    const world = cubeToWorld(tile.coord);
    const angle = index * 2.399;
    hubPositions.set(
      hub.id,
      new THREE.Vector3(
        world.x + Math.cos(angle) * 0.38,
        HEX_SLAB_THICKNESS + 1.18 + (index % 3) * 0.16,
        world.z + Math.sin(angle) * 0.38,
      ),
    );
  });

  if (layer === 'surface') {
    return (
      <group>
        {extension.shafts.map((shaft) => {
          const point = topology.intersections[shaft.intersectionId];
          if (!point) return null;
          const owner = gameState.players.get(shaft.playerId);
          const world = intersectionToWorld(point, HEX_SLAB_THICKNESS + 0.045);
          return (
            <group key={shaft.id} position={[world.x, world.y, world.z]}>
              <SurfaceGate kind="shaft" color={playerColor(owner?.color, '#63e6dc')} />
            </group>
          );
        })}
        {extension.airports.map((airport) => {
          const point = topology.intersections[airport.intersectionId];
          if (!point) return null;
          const owner = gameState.players.get(airport.playerId);
          const world = intersectionToWorld(point, HEX_SLAB_THICKNESS + 0.04);
          return (
            <group key={airport.id} position={[world.x, world.y, world.z]}>
              <SurfaceGate kind="airport" color={playerColor(owner?.color, '#a889ff')} />
            </group>
          );
        })}
      </group>
    );
  }

  if (layer === 'underground') {
    const revealed = new Set(extension.revealedUndergroundNodeIds);
    const undergroundSurfaceIds = new Set(
      Object.values(extension.undergroundGraph.nodes).map((node) => node.surfaceTileId),
    );
    const ownedTunnelByEdge = new Map(extension.tunnels.map((tunnel) => [tunnel.edgeId, tunnel]));
    return (
      <group>
        <hemisphereLight color="#e6a171" groundColor="#2b130d" intensity={0.82} />
        <pointLight position={[0, 5.5, 0]} color="#d88555" intensity={2.1} distance={18} decay={2} />
        {[...gameState.map.values()].map((tile, index) => {
          const world = cubeToWorld(tile.coord);
          const cavernTile = undergroundSurfaceIds.has(tile.id);
          return (
            <group key={`veil-${tile.id}`} position={[world.x, 0, world.z]}>
              <mesh
                position={[0, HEX_SLAB_THICKNESS + (cavernTile ? 0.022 : 0.095), 0]}
                castShadow={!cavernTile}
                receiveShadow
                raycast={() => undefined}
              >
                <cylinderGeometry args={[0.98, cavernTile ? 0.98 : 1.025, cavernTile ? 0.04 : 0.19, 6]} />
                <meshPhysicalMaterial
                  color={cavernTile ? '#562d1f' : '#35231f'}
                  emissive={cavernTile ? '#35170f' : '#1c100d'}
                  emissiveIntensity={cavernTile ? 0.25 : 0.11}
                  roughness={0.95}
                  metalness={0.015}
                  clearcoat={cavernTile ? 0.05 : 0}
                />
              </mesh>
              {!cavernTile && index % 2 === 0 && (
                <group position={[0, HEX_SLAB_THICKNESS + 0.2, 0]}>
                  <ClayWallDetails index={index} />
                </group>
              )}
            </group>
          );
        })}
        {Object.values(extension.undergroundGraph.edges).map((edge) => {
          const from = nodePositions.get(edge.a);
          const to = nodePositions.get(edge.b);
          if (!from || !to || !revealed.has(edge.a) || !revealed.has(edge.b)) return null;
          const tunnel = ownedTunnelByEdge.get(edge.id);
          const owner = tunnel ? gameState.players.get(tunnel.playerId) : undefined;
          return (
            <Segment
              key={edge.id}
              from={from}
              to={to}
              color={tunnel ? playerColor(owner?.color, '#f1a06d') : '#9b6041'}
              radius={tunnel ? 0.055 : 0.023}
              opacity={tunnel ? 1 : 0.58}
              emissive={Boolean(tunnel)}
            />
          );
        })}
        {Object.values(extension.undergroundGraph.nodes).map((node, index) => {
          const position = nodePositions.get(node.id);
          if (!position) return null;
          return (
            <group key={node.id} position={position}>
              {revealed.has(node.id) ? (
                <>
                  <mesh position={[0, -0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
                    <ringGeometry args={[0.31, 0.42, 6]} />
                    <meshBasicMaterial color="#f0a16d" transparent opacity={0.32} depthWrite={false} />
                  </mesh>
                  <CrystalCluster
                    color={DISCOVERY_COLORS[node.discovery]}
                    dangerous={node.geologyCategory === 'danger'}
                  />
                  <pointLight
                    position={[0, 0.34, 0]}
                    color={DISCOVERY_COLORS[node.discovery]}
                    intensity={0.44}
                    distance={1.65}
                    decay={2}
                  />
                </>
              ) : (
                <SealedCavern index={index} />
              )}
            </group>
          );
        })}
        {extension.outposts.map((outpost) => {
          const position = nodePositions.get(outpost.nodeId);
          if (!position) return null;
          const owner = gameState.players.get(outpost.playerId);
          const color = playerColor(owner?.color, '#63e6dc');
          return (
            <group key={outpost.id} position={[position.x, position.y + 0.04, position.z]}>
              <mesh castShadow raycast={() => undefined}>
                <cylinderGeometry args={[0.16, 0.2, 0.18, 6]} />
                <meshPhysicalMaterial color={color} roughness={0.32} metalness={0.22} clearcoat={0.6} />
              </mesh>
              {outpost.upgradedExtractor && (
                <mesh position={[0, 0.19, 0]} castShadow raycast={() => undefined}>
                  <octahedronGeometry args={[0.09, 0]} />
                  <meshPhysicalMaterial color="#d8fffb" emissive="#55e4da" emissiveIntensity={0.65} />
                </mesh>
              )}
            </group>
          );
        })}
      </group>
    );
  }

  const revealedHubs = new Set(extension.revealedSkyHubIds);
  return (
    <group>
      <hemisphereLight color="#dceaff" groundColor="#51428d" intensity={1.1} />
      <directionalLight position={[-4, 8, 5]} color="#f3efff" intensity={1.25} />
      <pointLight position={[0, 4.5, 0]} color="#a889ff" intensity={0.72} distance={15} decay={2} />
      <SkyCloudField animate={animate} />
      <AetherVortex animate={animate} />
      {Object.values(extension.skyGraph.lanes).map((lane, index) => {
        const from = hubPositions.get(lane.from);
        const to = hubPositions.get(lane.to);
        if (!from || !to) return null;
        const visible = revealedHubs.has(lane.from) || revealedHubs.has(lane.to);
        return (
          <group key={lane.id}>
            <Segment
              from={from}
              to={to}
              color={visible ? '#d0c7ff' : '#83c8e2'}
              radius={visible ? 0.052 : 0.034}
              opacity={visible ? 0.94 : 0.7}
              emissive
            />
            <SkyLanePulse
              from={from}
              to={to}
              reverse={lane.currentDirection === 'reverse'}
              index={index}
              animate={animate}
            />
          </group>
        );
      })}
      {Object.values(extension.skyGraph.hubs).map((hub, index) => {
        const position = hubPositions.get(hub.id);
        if (!position) return null;
        const revealedHub = revealedHubs.has(hub.id);
        return (
          <group
            key={hub.id}
            position={position}
            scale={revealedHub ? 1.72 : 1.48}
          >
            <FloatingIsland color={SKY_SITE_COLORS[hub.site]} index={index} animate={animate} />
            {!revealedHub && (
              <mesh position={[0, 0.15, 0]} scale={[1.7, 0.68, 1.25]} raycast={() => undefined}>
                <sphereGeometry args={[0.48, 18, 10]} />
                <meshPhysicalMaterial color="#e8f4fb" transparent opacity={0.32} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
      {extension.beacons.map((beacon) => {
        const position = hubPositions.get(beacon.hubId);
        if (!position) return null;
        const owner = gameState.players.get(beacon.playerId);
        const color = playerColor(owner?.color, '#a889ff');
        return (
          <group key={beacon.id} position={[position.x, position.y + 0.28, position.z]}>
            <mesh raycast={() => undefined}>
              <cylinderGeometry args={[0.025, 0.055, 0.32, 10]} />
              <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.52} />
            </mesh>
            <pointLight color={color} intensity={0.55} distance={2.3} decay={2} />
          </group>
        );
      })}
      {extension.airships.map((airship, index) => {
        const routeHubId = airship.route?.hubPath[airship.route.pathIndex] ?? airship.currentHubId;
        let position = routeHubId ? hubPositions.get(routeHubId) : undefined;
        if (!position) {
          const airport = extension.airports.find((entry) => entry.id === airship.airportId);
          const point = airport ? topology.intersections[airport.intersectionId] : undefined;
          if (point) {
            const world = intersectionToWorld(point, HEX_SLAB_THICKNESS + 1.05);
            position = new THREE.Vector3(world.x, world.y, world.z);
          }
        }
        if (!position) return null;
        const owner = gameState.players.get(airship.playerId);
        const color = playerColor(owner?.color, airship.playerId === currentPlayerId ? '#a889ff' : '#dce5ef');
        return (
          <group key={airship.id} position={[position.x, position.y + 0.48, position.z]}>
            <PremiumAirship color={color} animate={animate} index={index} />
          </group>
        );
      })}
    </group>
  );
}

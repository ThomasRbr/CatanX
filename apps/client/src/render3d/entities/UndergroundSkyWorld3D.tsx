import * as THREE from 'three';
import type { GameState } from '@catanx/engine';
import { isUndergroundSkyEnabled } from '@catanx/engine';
import type { BoardLayer } from '../../components/Map/boardLayer';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { playerColor } from '../utils/playerColors';
import { buildWorldTopology, intersectionToWorld } from '../utils/topologyToWorld';
import { SkyLayer3D } from './SkyLayer3D';
import { UndergroundLayer3D } from './UndergroundLayer3D';

type WorldTopology = ReturnType<typeof buildWorldTopology>;

interface UndergroundSkyWorld3DProps {
  gameState: GameState;
  layer: BoardLayer;
  currentPlayerId: string;
  topology: WorldTopology;
  animate: boolean;
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

/**
 * Souterrain & Ciel: shaft / airport gates on the surface, and the dedicated
 * underground and sky layers (each in its own module).
 */
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

  if (layer === 'underground') {
    return (
      <UndergroundLayer3D
        gameState={gameState}
        currentPlayerId={currentPlayerId}
        topology={topology}
        animate={animate}
      />
    );
  }
  if (layer === 'sky') {
    return (
      <SkyLayer3D
        gameState={gameState}
        currentPlayerId={currentPlayerId}
        topology={topology}
        animate={animate}
      />
    );
  }

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

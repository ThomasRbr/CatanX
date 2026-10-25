import { useMemo } from 'react';
import type { GameState } from '@catanx/engine';
import { hexToId } from '@catanx/engine';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { playerColor } from '../utils/playerColors';
import { unitStackOffset } from '../utils/stackOffset';
import { resolveUnitKind, type UnitKind } from '../utils/unitKind';
import { HpBar3D } from './HpBar3D';

interface Units3DProps {
  gameState: GameState;
}

function UnitModel({ kind, color, status }: { kind: UnitKind; color: string; status: string }) {
  const aura =
    status === 'attacking' ? '#e16047' : status === 'moving' ? '#f6d587' : null;

  return (
    <group>
      {aura && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
          <ringGeometry args={[0.16, 0.2, 20]} />
          <meshBasicMaterial color={aura} transparent opacity={0.75} />
        </mesh>
      )}
      <mesh position={[0, 0.01, 0]} receiveShadow raycast={() => undefined}>
        <cylinderGeometry args={[0.12, 0.12, 0.03, 10]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0.08} flatShading={false} />
      </mesh>
      {kind === 'worker' && (
        <>
          <mesh position={[0, 0.12, 0]} castShadow raycast={() => undefined}>
            <boxGeometry args={[0.12, 0.16, 0.1]} />
            <meshStandardMaterial color="#cfc0a4" roughness={0.9} metalness={0.04} flatShading={false} />
          </mesh>
          <mesh position={[0.1, 0.14, 0]} castShadow raycast={() => undefined}>
            <boxGeometry args={[0.04, 0.14, 0.04]} />
            <meshStandardMaterial color="#6a5038" roughness={0.9} metalness={0.03} flatShading={false} />
          </mesh>
        </>
      )}
      {kind === 'scout' && (
        <>
          <mesh position={[0, 0.12, 0]} castShadow raycast={() => undefined}>
            <capsuleGeometry args={[0.05, 0.12, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} metalness={0.06} flatShading={false} />
          </mesh>
          <mesh position={[0, 0.26, 0]} castShadow raycast={() => undefined}>
            <coneGeometry args={[0.06, 0.08, 5]} />
            <meshStandardMaterial color="#d8cbb0" roughness={0.85} metalness={0.05} flatShading={false} />
          </mesh>
        </>
      )}
      {kind === 'ranged' && (
        <>
          <mesh position={[0, 0.14, 0]} castShadow raycast={() => undefined}>
            <cylinderGeometry args={[0.05, 0.06, 0.2, 6]} />
            <meshStandardMaterial color={color} roughness={0.8} metalness={0.08} flatShading={false} />
          </mesh>
          <mesh
            position={[0.1, 0.16, 0]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            raycast={() => undefined}
          >
            <boxGeometry args={[0.14, 0.025, 0.025]} />
            <meshStandardMaterial color="#5a4030" roughness={0.9} metalness={0.04} flatShading={false} />
          </mesh>
        </>
      )}
      {(kind === 'melee' || kind === 'fallback') && (
        <>
          <mesh position={[0, 0.14, 0]} castShadow raycast={() => undefined}>
            <cylinderGeometry args={[0.055, 0.07, 0.22, 6]} />
            <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} flatShading={false} />
          </mesh>
          <mesh position={[0.09, 0.2, 0]} castShadow raycast={() => undefined}>
            <boxGeometry args={[0.03, 0.22, 0.03]} />
            <meshStandardMaterial color="#2f2c29" roughness={0.85} metalness={0.15} flatShading={false} />
          </mesh>
          <mesh position={[0.09, 0.34, 0]} castShadow raycast={() => undefined}>
            <coneGeometry args={[0.04, 0.07, 4]} />
            <meshStandardMaterial color="#ddd5c6" roughness={0.7} metalness={0.2} flatShading={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

/**
 * Military / civilian units with stack offsets and status auras.
 */
export function Units3D({ gameState }: Units3DProps) {
  const surface = useSurfaceHeight();
  const items = useMemo(() => {
    const counters = new Map<string, number>();
    const out: Array<{
      id: string;
      kind: UnitKind;
      color: string;
      status: string;
      hpRatio: number;
      x: number;
      y: number;
      z: number;
    }> = [];

    for (const unit of gameState.units.values()) {
      if (unit.status === 'dead') continue;
      const tileKey = hexToId(unit.position);
      const index = counters.get(tileKey) ?? 0;
      counters.set(tileKey, index + 1);
      const origin = cubeToWorld(unit.position);
      const off = unitStackOffset(index);
      const player = gameState.players.get(unit.ownerId);
      const hpRatio = unit.stats.currentHealth / Math.max(1, unit.stats.health);
      out.push({
        id: unit.id,
        kind: resolveUnitKind(unit.type),
        color: playerColor(player?.color),
        status: unit.status,
        hpRatio,
        x: origin.x + off.x,
        y: Math.max(surface.sampleHeight(origin.x + off.x, origin.z + off.z), HEX_SLAB_THICKNESS) + 0.02,
        z: origin.z + off.z,
      });
    }
    return out;
  }, [gameState.players, gameState.units, surface]);

  if (items.length === 0) return null;

  return (
    <group>
      {items.map((u) => (
        <group key={u.id} position={[u.x, u.y, u.z]} userData={{ kind: 'unit', id: u.id }}>
          <UnitModel kind={u.kind} color={u.color} status={u.status} />
          <HpBar3D ratio={u.hpRatio} />
        </group>
      ))}
    </group>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CatanTopology, GameState } from '@catanx/engine';
import type { ClassicBuildMode } from '../../store/uiStore';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { playerColor } from '../utils/playerColors';
import { ROAD_PREVIEW_Y } from '../utils/resolveRoads';
import {
  intersectionToWorld,
  midpointWorld,
  yawBetween,
} from '../utils/topologyToWorld';
import { PlacementHitReporter, type PlacementHitTarget } from './PlacementHitReporter';

export interface ClassicBuildOverlay3DProps {
  gameState: GameState;
  topology: CatanTopology;
  mode: ClassicBuildMode;
  validIntersectionIds: string[];
  validEdgeIds: string[];
  enabled: boolean;
  onIntersectionClick?: (intersectionId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

const DRAG_SLOP_SQ = 10 * 10;
const VIS_NODE = 0.085;
const HIT_NODE = 0.26;
const VIS_EDGE_W = 0.1;
const HIT_EDGE_W = 0.3;

function usePlacementClick(enabled: boolean, onFire: () => void) {
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (!enabled || e.button !== 0) return;
      e.stopPropagation();
      pointerDown.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!enabled || e.button !== 0) return;
      e.stopPropagation();
      const down = pointerDown.current;
      pointerDown.current = null;
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (dx * dx + dy * dy > DRAG_SLOP_SQ) return;
      onFire();
    },
  };
}

function SettlementCandidate({
  intersectionId,
  x,
  y,
  z,
  hovered,
  enabled,
  accent,
  onClick,
  onHover,
}: {
  intersectionId: string;
  x: number;
  y: number;
  z: number;
  hovered: boolean;
  enabled: boolean;
  accent: 'settle' | 'city' | 'knight';
  onClick: () => void;
  onHover: (id: string | null) => void;
}) {
  const handlers = usePlacementClick(enabled, onClick);
  const scale = hovered ? 1.1 : 1;
  const color =
    accent === 'city'
      ? hovered
        ? '#fbbf24'
        : '#f59e0b'
      : accent === 'knight'
        ? hovered
          ? '#7ef0e6'
          : '#48d9cf'
        : hovered
          ? '#86efac'
          : '#7dd3b0';
  const emissive =
    accent === 'city' ? '#92400e' : accent === 'knight' ? '#0d6b66' : '#1f6b4e';

  return (
    <group position={[x, y, z]}>
      <mesh
        scale={[scale, scale, scale]}
        visible={false}
        userData={{ kind: 'intersection', id: intersectionId }}
        {...handlers}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          onHover(intersectionId);
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          onHover(null);
        }}
      >
        <sphereGeometry args={[HIT_NODE, 12, 10]} />
        <meshBasicMaterial />
      </mesh>
      <mesh scale={[scale, scale, scale]} raycast={() => undefined} castShadow>
        <sphereGeometry args={[VIS_NODE * (accent === 'city' ? 1.15 : 1), 12, 10]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={hovered ? 0.22 : 0.1}
          roughness={0.55}
          metalness={0.08}
          flatShading
          transparent
          opacity={hovered ? 0.9 : 0.75}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </group>
  );
}

function EdgeCandidate({
  edgeId,
  mid,
  len,
  yaw,
  hovered,
  enabled,
  onClick,
  onHover,
}: {
  edgeId: string;
  mid: { x: number; y: number; z: number };
  len: number;
  yaw: number;
  hovered: boolean;
  enabled: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
}) {
  const handlers = usePlacementClick(enabled, onClick);

  return (
    <group position={[mid.x, mid.y, mid.z]} rotation={[0, yaw, 0]}>
      <mesh
        visible={false}
        userData={{ kind: 'edge', id: edgeId }}
        {...handlers}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          onHover(edgeId);
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          onHover(null);
        }}
      >
        <boxGeometry args={[HIT_EDGE_W, 0.12, len]} />
        <meshBasicMaterial />
      </mesh>
      <mesh raycast={() => undefined} renderOrder={6}>
        <boxGeometry args={[hovered ? VIS_EDGE_W * 1.35 : VIS_EDGE_W, 0.07, len]} />
        <meshStandardMaterial
          color={hovered ? '#86efac' : '#6ee7b7'}
          emissive="#2a8a60"
          emissiveIntensity={hovered ? 0.32 : 0.22}
          roughness={0.55}
          metalness={0.08}
          flatShading
          depthWrite
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
    </group>
  );
}

/**
 * Overlay mid-game : candidats village / route / ville (mode classique).
 */
export function ClassicBuildOverlay3D({
  gameState,
  topology,
  mode,
  validIntersectionIds,
  validEdgeIds,
  enabled,
  onIntersectionClick,
  onEdgeClick,
}: ClassicBuildOverlay3DProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const validIntersectionSet = useMemo(
    () => new Set(validIntersectionIds),
    [validIntersectionIds],
  );

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  useEffect(() => {
    setHoveredId(null);
  }, [mode, validEdgeIds, validIntersectionIds]);

  const hitTargets = useMemo((): PlacementHitTarget[] => {
    const out: PlacementHitTarget[] = [];
    if (mode === 'road') {
      for (const edgeId of validEdgeIds) {
        const edge = topology.edges[edgeId];
        if (!edge) continue;
        const a = topology.intersections[edge.a];
        const b = topology.intersections[edge.b];
        if (!a || !b) continue;
        const mid = midpointWorld(
          intersectionToWorld(a),
          intersectionToWorld(b),
          ROAD_PREVIEW_Y,
        );
        out.push({ id: edgeId, kind: 'edge', ...mid });
      }
      return out;
    }
    for (const intersectionId of validIntersectionIds) {
      const intersection = topology.intersections[intersectionId];
      if (!intersection) continue;
      const w = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.08);
      out.push({ id: intersectionId, kind: 'intersection', ...w });
    }
    return out;
  }, [mode, topology, validEdgeIds, validIntersectionIds]);

  const occupiedEntries = useMemo(
    () => Object.entries(gameState.classicBoard?.occupiedIntersections ?? {}),
    [gameState.classicBoard?.occupiedIntersections],
  );

  return (
    <group>
      <PlacementHitReporter targets={hitTargets} />

      {(mode === 'settlement' || mode === 'city' || mode === 'ck_knight') &&
        validIntersectionIds.map((intersectionId) => {
          const intersection = topology.intersections[intersectionId];
          if (!intersection) return null;
          const w = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.08);
          return (
            <SettlementCandidate
              key={intersectionId}
              intersectionId={intersectionId}
              x={w.x}
              y={w.y}
              z={w.z}
              hovered={hoveredId === intersectionId}
              enabled={enabled}
              accent={
                mode === 'city' ? 'city' : mode === 'ck_knight' ? 'knight' : 'settle'
              }
              onClick={() => onIntersectionClick?.(intersectionId)}
              onHover={setHoveredId}
            />
          );
        })}

      {mode === 'road' &&
        validEdgeIds.map((edgeId) => {
          const edge = topology.edges[edgeId];
          if (!edge) return null;
          const a = topology.intersections[edge.a];
          const b = topology.intersections[edge.b];
          if (!a || !b) return null;
          const wa = intersectionToWorld(a);
          const wb = intersectionToWorld(b);
          const mid = midpointWorld(wa, wb, ROAD_PREVIEW_Y);
          const len = Math.hypot(wb.x - wa.x, wb.z - wa.z);
          return (
            <EdgeCandidate
              key={edgeId}
              edgeId={edgeId}
              mid={mid}
              len={Math.max(0.2, len * 0.92)}
              yaw={yawBetween(wa, wb)}
              hovered={hoveredId === edgeId}
              enabled={enabled}
              onClick={() => onEdgeClick?.(edgeId)}
              onHover={setHoveredId}
            />
          );
        })}

      {occupiedEntries.map(([intersectionId, ownerId]) => {
        if (validIntersectionSet.has(intersectionId)) return null;
        const intersection = topology.intersections[intersectionId];
        if (!intersection) return null;
        const w = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.015);
        const owner = gameState.players.get(ownerId);
        const color = owner ? playerColor(owner.color) : '#888888';
        return (
          <group key={`occ-${intersectionId}`} position={[w.x, w.y, w.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={() => undefined}>
              <ringGeometry args={[0.14, 0.18, 20]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.55}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { DoubleSide } from 'three';
import type { CatanTopology, GameState } from '@catanx/engine';
import { intersectionTouchesLand } from '@catanx/engine';
import type { InitialPlacementState } from '../../store/gameStore';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { playerColor } from '../utils/playerColors';
import { ROAD_PREVIEW_Y } from '../utils/resolveRoads';
import {
  distanceXZ,
  intersectionToWorld,
  midpointWorld,
  yawBetween,
} from '../utils/topologyToWorld';
import { PlacementHitReporter, type PlacementHitTarget } from './PlacementHitReporter';

interface PlacementOverlay3DProps {
  gameState: GameState;
  topology: CatanTopology;
  setup: InitialPlacementState;
  enabled: boolean;
  onIntersectionClick?: (intersectionId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

const DRAG_SLOP_SQ = 10 * 10;
const VIS_NODE = 0.085;
const HIT_NODE = 0.26;
const VIS_EDGE_W = 0.1;
const HIT_EDGE_W = 0.3;

const invalidNodeGeo = new THREE.SphereGeometry(0.08, 8, 6);
const invalidNodeMat = new THREE.MeshStandardMaterial({
  color: '#ef4444',
  emissive: '#7f1d1d',
  emissiveIntensity: 0.12,
  roughness: 0.7,
  metalness: 0.05,
  flatShading: false,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
});

function InvalidNodesInstanced({
  ids,
  topology,
}: {
  ids: string[];
  topology: CatanTopology;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < ids.length; i++) {
      const intersection = topology.intersections[ids[i]!];
      if (!intersection) continue;
      const w = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.05);
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = ids.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, ids, topology.intersections]);

  if (ids.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[invalidNodeGeo, invalidNodeMat, ids.length]}
      frustumCulled
      raycast={() => undefined}
    />
  );
}

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
  pending,
  hovered,
  enabled,
  onClick,
  onHover,
}: {
  intersectionId: string;
  x: number;
  y: number;
  z: number;
  pending: boolean;
  hovered: boolean;
  enabled: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
}) {
  const handlers = usePlacementClick(enabled, onClick);
  const scale = pending ? 1.15 : hovered ? 1.08 : 1;

  return (
    <group position={[x, y, z]}>
      <mesh
        scale={[scale, scale, scale]}
        // visible=false still raycasts (Three ≥ r114); keeps draw-call budget
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
        <sphereGeometry args={[pending ? VIS_NODE * 1.2 : VIS_NODE, 12, 10]} />
        <meshStandardMaterial
          color={pending ? '#f0c040' : hovered ? '#86efac' : '#7dd3b0'}
          emissive={pending ? '#c4a030' : '#1f6b4e'}
          emissiveIntensity={pending ? 0.32 : hovered ? 0.18 : 0.08}
          roughness={0.55}
          metalness={0.08}
          flatShading
          transparent
          opacity={pending ? 0.95 : hovered ? 0.85 : 0.72}
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
  pending,
  hovered,
  enabled,
  onClick,
  onHover,
}: {
  edgeId: string;
  mid: { x: number; y: number; z: number };
  len: number;
  yaw: number;
  pending: boolean;
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
        <boxGeometry args={[pending || hovered ? VIS_EDGE_W * 1.35 : VIS_EDGE_W, 0.07, len]} />
        <meshStandardMaterial
          color={pending ? '#f0c040' : hovered ? '#86efac' : '#6ee7b7'}
          emissive={pending ? '#c4a030' : '#2a8a60'}
          emissiveIntensity={pending ? 0.45 : hovered ? 0.32 : 0.22}
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
 * Interactive settlement nodes + road edges for classic initial placement.
 */
export function PlacementOverlay3D({
  gameState,
  topology,
  setup,
  enabled,
  onIntersectionClick,
  onEdgeClick,
}: PlacementOverlay3DProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  const landIntersections = useMemo(() => {
    const ids: string[] = [];
    for (const intersectionId of Object.keys(topology.intersections)) {
      if (intersectionTouchesLand(topology, gameState.map, intersectionId)) {
        ids.push(intersectionId);
      }
    }
    return ids;
  }, [gameState.map, topology]);

  const validSettlements = useMemo(() => {
    const ids = new Set<string>();
    if (setup.step !== 'settlement') return ids;
    for (const intersectionId of landIntersections) {
      if (setup.occupiedIntersections[intersectionId]) continue;
      const intersection = topology.intersections[intersectionId];
      if (!intersection) continue;
      const blocked = intersection.neighborIds.some((n) => Boolean(setup.occupiedIntersections[n]));
      if (!blocked) ids.add(intersectionId);
    }
    return ids;
  }, [landIntersections, setup.occupiedIntersections, setup.step, topology.intersections]);

  const candidateEdges = useMemo(() => {
    const ids = new Set<string>();
    if (setup.step !== 'road' || !setup.anchorIntersectionId) return ids;
    for (const [edgeId, edge] of Object.entries(topology.edges)) {
      if (setup.roadsByEdge[edgeId]) continue;
      if (edge.a === setup.anchorIntersectionId || edge.b === setup.anchorIntersectionId) {
        ids.add(edgeId);
      }
    }
    return ids;
  }, [setup.anchorIntersectionId, setup.roadsByEdge, setup.step, topology.edges]);

  const invalidSettlementIds = useMemo(
    () =>
      landIntersections.filter(
        (id) => !validSettlements.has(id) && !setup.occupiedIntersections[id],
      ),
    [landIntersections, setup.occupiedIntersections, validSettlements],
  );

  const hitTargets = useMemo((): PlacementHitTarget[] => {
    const out: PlacementHitTarget[] = [];
    if (setup.step === 'settlement') {
      for (const intersectionId of validSettlements) {
        const intersection = topology.intersections[intersectionId];
        if (!intersection) continue;
        const w = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.08);
        out.push({ id: intersectionId, kind: 'intersection', ...w });
      }
    } else if (setup.step === 'road') {
      for (const edgeId of candidateEdges) {
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
    }
    return out;
  }, [candidateEdges, setup.step, topology, validSettlements]);

  return (
    <group>
      <PlacementHitReporter targets={hitTargets} />

      {/* Invalid / blocked land nodes — instanced (Phase F) */}
      {setup.step === 'settlement' && (
        <InvalidNodesInstanced ids={invalidSettlementIds} topology={topology} />
      )}

      {setup.step === 'settlement' &&
        [...validSettlements].map((intersectionId) => {
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
              pending={setup.pendingIntersectionId === intersectionId}
              hovered={hoveredId === intersectionId}
              enabled={enabled}
              onClick={() => onIntersectionClick?.(intersectionId)}
              onHover={setHoveredId}
            />
          );
        })}

      {setup.step === 'road' &&
        setup.anchorIntersectionId &&
        topology.intersections[setup.anchorIntersectionId] && (
          <mesh
            position={[
              intersectionToWorld(topology.intersections[setup.anchorIntersectionId]!).x,
              HEX_SLAB_THICKNESS + 0.05,
              intersectionToWorld(topology.intersections[setup.anchorIntersectionId]!).z,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => undefined}
          >
            <ringGeometry args={[0.16, 0.24, 24]} />
            <meshBasicMaterial color="#f0c040" transparent opacity={0.9} side={DoubleSide} />
          </mesh>
        )}

      {setup.step === 'road' &&
        [...candidateEdges].map((edgeId) => {
          const edge = topology.edges[edgeId];
          if (!edge) return null;
          const a = topology.intersections[edge.a];
          const b = topology.intersections[edge.b];
          if (!a || !b) return null;
          const wa = intersectionToWorld(a);
          const wb = intersectionToWorld(b);
          const mid = midpointWorld(wa, wb, ROAD_PREVIEW_Y);
          const len = Math.max(0.08, distanceXZ(wa, wb) * 0.96);
          const yaw = yawBetween(wa, wb);
          return (
            <EdgeCandidate
              key={edgeId}
              edgeId={edgeId}
              mid={mid}
              len={len}
              yaw={yaw}
              pending={setup.pendingEdgeId === edgeId}
              hovered={hoveredId === edgeId}
              enabled={enabled}
              onClick={() => onEdgeClick?.(edgeId)}
              onHover={setHoveredId}
            />
          );
        })}

      {/* Occupied rings (always) — buildings sit on top */}
      {Object.entries(setup.occupiedIntersections).map(([intersectionId, ownerId]) => {
        const intersection = topology.intersections[intersectionId];
        if (!intersection) return null;
        const w = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.015);
        const player = gameState.players.get(ownerId);
        const hasBuilding = [...gameState.buildings.values()].some(
          (b) => b.placementIntersectionId === intersectionId,
        );
        return (
          <group key={`occ-${intersectionId}`} position={[w.x, w.y, w.z]}>
            {!hasBuilding && (
              <mesh raycast={() => undefined}>
                <cylinderGeometry args={[0.12, 0.12, 0.08, 8]} />
                <meshStandardMaterial
                  color={playerColor(player?.color)}
                  roughness={0.85}
                  metalness={0.05}
                  flatShading
                />
              </mesh>
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={() => undefined}>
              <ringGeometry args={[0.14, 0.18, 20]} />
              <meshBasicMaterial
                color={playerColor(player?.color)}
                transparent
                opacity={0.75}
                side={DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

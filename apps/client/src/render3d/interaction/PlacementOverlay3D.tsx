import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CatanTopology, GameState } from '@catanx/engine';
import { intersectionTouchesLand } from '@catanx/engine';
import type { InitialPlacementState } from '../../store/gameStore';
import { playerColor } from '../utils/playerColors';
import {
  edgeMarkerY,
  EdgeMarker,
  GroundRing,
  NodeMarker,
  nodeMarkerY,
  useSurfaceY,
  type MarkerState,
} from './placementMarkers';
import { PlacementHitReporter, type PlacementHitTarget } from './PlacementHitReporter';

interface PlacementOverlay3DProps {
  gameState: GameState;
  topology: CatanTopology;
  setup: InitialPlacementState;
  enabled: boolean;
  onIntersectionClick?: (intersectionId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

const invalidNodeGeo = new THREE.SphereGeometry(0.045, 12, 8);
const invalidNodeMat = new THREE.MeshBasicMaterial({
  color: '#ff6b5f',
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});

/** Blocked corners (too close to a village): small muted dots on the ground. */
function InvalidNodesInstanced({
  ids,
  topology,
}: {
  ids: string[];
  topology: CatanTopology;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const sample = useSurfaceY();

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < ids.length; i++) {
      const intersection = topology.intersections[ids[i]!];
      if (!intersection) continue;
      dummy.position.set(intersection.x, sample(intersection.x, intersection.y, 0.05), intersection.y);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = ids.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, ids, sample, topology.intersections]);

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

  const sample = useSurfaceY();

  const hitTargets = useMemo((): PlacementHitTarget[] => {
    const out: PlacementHitTarget[] = [];
    if (setup.step === 'settlement') {
      for (const intersectionId of validSettlements) {
        const intersection = topology.intersections[intersectionId];
        if (!intersection) continue;
        const x = intersection.x;
        const z = intersection.y;
        out.push({ id: intersectionId, kind: 'intersection', x, y: nodeMarkerY(sample, x, z), z });
      }
    } else if (setup.step === 'road') {
      for (const edgeId of candidateEdges) {
        const edge = topology.edges[edgeId];
        if (!edge) continue;
        const a = topology.intersections[edge.a];
        const b = topology.intersections[edge.b];
        if (!a || !b) continue;
        const pa = { x: a.x, z: a.y };
        const pb = { x: b.x, z: b.y };
        out.push({
          id: edgeId,
          kind: 'edge',
          x: (pa.x + pb.x) / 2,
          y: edgeMarkerY(sample, pa, pb),
          z: (pa.z + pb.z) / 2,
        });
      }
    }
    return out;
  }, [candidateEdges, sample, setup.step, topology, validSettlements]);

  const stateFor = (id: string, pendingId: string | null | undefined): MarkerState =>
    pendingId === id ? 'pending' : hoveredId === id ? 'hover' : 'idle';

  const anchor = setup.anchorIntersectionId
    ? topology.intersections[setup.anchorIntersectionId]
    : undefined;

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
          return (
            <NodeMarker
              key={intersectionId}
              id={intersectionId}
              x={intersection.x}
              z={intersection.y}
              state={stateFor(intersectionId, setup.pendingIntersectionId)}
              enabled={enabled}
              onClick={() => onIntersectionClick?.(intersectionId)}
              onHover={setHoveredId}
            />
          );
        })}

      {setup.step === 'road' && anchor && (
        <GroundRing x={anchor.x} z={anchor.y} color="#ffcd4a" inner={0.17} outer={0.24} opacity={0.95} />
      )}

      {setup.step === 'road' &&
        [...candidateEdges].map((edgeId) => {
          const edge = topology.edges[edgeId];
          if (!edge) return null;
          const a = topology.intersections[edge.a];
          const b = topology.intersections[edge.b];
          if (!a || !b) return null;
          return (
            <EdgeMarker
              key={edgeId}
              id={edgeId}
              a={{ x: a.x, z: a.y }}
              b={{ x: b.x, z: b.y }}
              state={stateFor(edgeId, setup.pendingEdgeId)}
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
        const player = gameState.players.get(ownerId);
        const hasBuilding = [...gameState.buildings.values()].some(
          (b) => b.placementIntersectionId === intersectionId,
        );
        return (
          <GroundRing
            key={`occ-${intersectionId}`}
            x={intersection.x}
            z={intersection.y}
            color={playerColor(player?.color)}
            opacity={0.75}
            peg={!hasBuilding}
          />
        );
      })}
    </group>
  );
}

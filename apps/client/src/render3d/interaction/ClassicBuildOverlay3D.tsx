import { useEffect, useMemo, useState } from 'react';
import type { CatanTopology, GameState } from '@catanx/engine';
import type { ClassicBuildMode } from '../../store/uiStore';
import { playerColor } from '../utils/playerColors';
import { PlacementHitReporter, type PlacementHitTarget } from './PlacementHitReporter';
import {
  edgeMarkerY,
  EdgeMarker,
  GroundRing,
  NodeMarker,
  nodeMarkerY,
  useSurfaceY,
  type MarkerAccent,
} from './placementMarkers';

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
  const sample = useSurfaceY();

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
      return out;
    }
    for (const intersectionId of validIntersectionIds) {
      const intersection = topology.intersections[intersectionId];
      if (!intersection) continue;
      const x = intersection.x;
      const z = intersection.y;
      out.push({ id: intersectionId, kind: 'intersection', x, y: nodeMarkerY(sample, x, z), z });
    }
    return out;
  }, [mode, sample, topology, validEdgeIds, validIntersectionIds]);

  const occupiedEntries = useMemo(
    () => Object.entries(gameState.classicBoard?.occupiedIntersections ?? {}),
    [gameState.classicBoard?.occupiedIntersections],
  );

  const accent: MarkerAccent = mode === 'city' ? 'city' : mode === 'ck_knight' ? 'knight' : 'settle';

  return (
    <group>
      <PlacementHitReporter targets={hitTargets} />

      {(mode === 'settlement' || mode === 'city' || mode === 'ck_knight') &&
        validIntersectionIds.map((intersectionId) => {
          const intersection = topology.intersections[intersectionId];
          if (!intersection) return null;
          return (
            <NodeMarker
              key={intersectionId}
              id={intersectionId}
              x={intersection.x}
              z={intersection.y}
              state={hoveredId === intersectionId ? 'hover' : 'idle'}
              accent={accent}
              enabled={enabled}
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
          return (
            <EdgeMarker
              key={edgeId}
              id={edgeId}
              a={{ x: a.x, z: a.y }}
              b={{ x: b.x, z: b.y }}
              state={hoveredId === edgeId ? 'hover' : 'idle'}
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
        const owner = gameState.players.get(ownerId);
        return (
          <GroundRing
            key={`occ-${intersectionId}`}
            x={intersection.x}
            z={intersection.y}
            color={owner ? playerColor(owner.color) : '#888888'}
            opacity={0.55}
          />
        );
      })}
    </group>
  );
}

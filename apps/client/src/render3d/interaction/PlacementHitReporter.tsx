import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemo, useRef } from 'react';

export interface PlacementHitTarget {
  id: string;
  kind: 'intersection' | 'edge';
  x: number;
  y: number;
  z: number;
}

interface PlacementHitReporterProps {
  targets: PlacementHitTarget[];
}

/**
 * Publishes projected screen hits on the board element for E2E (data-placement-hits).
 */
export function PlacementHitReporter({ targets }: PlacementHitReporterProps) {
  const { camera, gl } = useThree();
  const vec = useMemo(() => new THREE.Vector3(), []);
  const lastJson = useRef('');

  useFrame(() => {
    const board = gl.domElement.closest('.map-layer');
    if (!(board instanceof HTMLElement)) return;
    if (targets.length === 0) {
      if (lastJson.current !== '[]') {
        lastJson.current = '[]';
        board.dataset.placementHits = '[]';
      }
      return;
    }

    const rect = gl.domElement.getBoundingClientRect();
    const hits = targets.flatMap((t) => {
      vec.set(t.x, t.y, t.z).project(camera);
      // Only publish points that can actually be clicked. This matters with
      // the long-lens Diorama camera where a projected target may sit behind
      // the camera or just outside the canvas while the board is moving.
      if (
        !Number.isFinite(vec.x) ||
        !Number.isFinite(vec.y) ||
        !Number.isFinite(vec.z) ||
        vec.z < -1 ||
        vec.z > 1 ||
        vec.x < -0.98 ||
        vec.x > 0.98 ||
        vec.y < -0.98 ||
        vec.y > 0.98
      ) return [];
      return [{
        id: t.id,
        kind: t.kind,
        clientX: Math.round((vec.x * 0.5 + 0.5) * rect.width + rect.left),
        clientY: Math.round((-vec.y * 0.5 + 0.5) * rect.height + rect.top),
      }];
    });
    const json = JSON.stringify(hits);
    if (json !== lastJson.current) {
      lastJson.current = json;
      board.dataset.placementHits = json;
    }
  });

  return null;
}

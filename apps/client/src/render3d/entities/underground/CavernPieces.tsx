import { useMemo } from 'react';
import * as THREE from 'three';
import type { CavernLayout } from './cavernLayout';
import type { CavernMaterials } from './cavernMaterials';
import { getExtractorKit, getLiftKit, getOutpostKit, getShaftKit, kitMatrix } from './chamberKits';
import { KitInstances, type KitPlacement } from './KitInstances';

export interface PiecePlacement {
  id: string;
  x: number;
  z: number;
  color: THREE.Color;
  /** Yaw override (lifts face their surface edge); defaults to the camera. */
  yaw?: number;
  scale?: number;
}

interface CavernPiecesProps {
  layout: CavernLayout;
  outposts: PiecePlacement[];
  extractors: PiecePlacement[];
  shafts: PiecePlacement[];
  lifts: PiecePlacement[];
  materials: CavernMaterials;
  animate: boolean;
}

const CAMERA_YAW = Math.PI / 4;

function toPlacements(layout: CavernLayout, pieces: PiecePlacement[], fallbackScale: number): KitPlacement[] {
  return pieces.map((piece) => ({
    matrix: kitMatrix(
      piece.x,
      layout.heightAt(piece.x, piece.z),
      piece.z,
      piece.yaw ?? CAMERA_YAW,
      piece.scale ?? fallbackScale,
    ),
    owner: piece.color,
  }));
}

/** Player pieces of the underground: outposts, extractors, shaft feet, lifts. */
export function CavernPieces({ layout, outposts, extractors, shafts, lifts, materials, animate }: CavernPiecesProps) {
  const placements = useMemo(
    () => ({
      outposts: toPlacements(layout, outposts, 1.08),
      extractors: toPlacements(layout, extractors, 1),
      shafts: toPlacements(layout, shafts, 1),
      lifts: toPlacements(layout, lifts, 1),
    }),
    [extractors, layout, lifts, outposts, shafts],
  );
  return (
    <group>
      {placements.outposts.length > 0 && (
        <KitInstances kit={getOutpostKit()} placements={placements.outposts} materials={materials} animate={animate} />
      )}
      {placements.extractors.length > 0 && (
        <KitInstances kit={getExtractorKit()} placements={placements.extractors} materials={materials} animate={animate} />
      )}
      {placements.shafts.length > 0 && (
        <KitInstances kit={getShaftKit()} placements={placements.shafts} materials={materials} animate={animate} />
      )}
      {placements.lifts.length > 0 && (
        <KitInstances kit={getLiftKit()} placements={placements.lifts} materials={materials} animate={animate} />
      )}
    </group>
  );
}

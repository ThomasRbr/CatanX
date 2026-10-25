import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { HexTile, TerrainType } from '@catanx/engine';
import * as THREE from 'three';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { cubeToWorld } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { getTerrainTopSurface } from './terrainTopSurface';

interface SeasonalSnowCoverProps {
  tiles: readonly HexTile[];
  season?: string;
  climateId?: string | null;
}

function snowOpacity(terrain: TerrainType, climateId?: string | null): number {
  const harsh = climateId === 'winter_deep_snow' || climateId === 'winter_announced_blizzard';
  const base = terrain === 'forest' || terrain === 'jungle'
    ? 0.48
    : terrain === 'desert' || terrain === 'volcano'
      ? 0.38
      : terrain === 'glacier'
        ? 0.78
        : 0.6;
  return Math.min(0.84, base + (harsh ? 0.16 : 0));
}

/**
 * Keep only upward-facing triangles from the terrain slab. Rendering the
 * complete slab used to paint every vertical hex wall white, exposing a
 * bright honeycomb in winter. The snow is now a true surface layer.
 */
function SnowInstances({
  terrain,
  tiles,
  opacity,
}: {
  terrain: TerrainType;
  tiles: readonly HexTile[];
  opacity: number;
}) {
  const quality = useRenderQuality();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(
    () => getTerrainTopSurface(terrain).clone(),
    [terrain],
  );
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f4f7f7',
    transparent: true,
    opacity,
    depthWrite: false,
    roughness: 0.86,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    flatShading: false,
  }), [opacity, quality.id]);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    tiles.forEach((tile, index) => {
      const world = cubeToWorld(tile.coord);
      dummy.position.set(world.x, 0.014, world.z);
      dummy.rotation.set(0, ((hashString(tile.id) % 6) * Math.PI) / 3, 0);
      // Keep neighboring transparent layers from overlapping: double alpha
      // was the source of the bright white honeycomb visible in winter.
      // The detailed terrain itself is 1.5% oversized. Compensating here
      // makes adjacent snow surfaces meet instead of alpha-blending twice.
      dummy.scale.set(0.984, 1.001, 0.984);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.count = tiles.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [dummy, tiles]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, tiles.length]}
        material={material}
      receiveShadow
      castShadow={false}
      renderOrder={3}
      raycast={() => undefined}
    />
  );
}

/** Physical snow layer; unlike color grading it sits on the terrain geometry. */
export function SeasonalSnowCover({ tiles, season = 'summer', climateId = null }: SeasonalSnowCoverProps) {
  const byTerrain = useMemo(() => {
    const groups = new Map<TerrainType, HexTile[]>();
    if (season !== 'winter') return groups;
    for (const tile of tiles) {
      if (isWaterTerrain(tile.terrain)) continue;
      const group = groups.get(tile.terrain) ?? [];
      group.push(tile);
      groups.set(tile.terrain, group);
    }
    return groups;
  }, [season, tiles]);

  if (byTerrain.size === 0) return null;
  return (
    <group>
      {[...byTerrain.entries()].map(([terrain, group]) => (
        <SnowInstances
          key={terrain}
          terrain={terrain}
          tiles={group}
          opacity={snowOpacity(terrain, climateId)}
        />
      ))}
    </group>
  );
}

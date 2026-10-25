import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { useSurfaceHeight } from './SurfaceHeightContext';

interface SeasonalSnowDriftsProps {
  tiles: readonly HexTile[];
  season?: string;
  climateId?: string | null;
  mapSeed?: number;
}

interface DriftPlacement {
  x: number;
  z: number;
  scaleX: number;
  scaleZ: number;
  rotation: number;
}

/**
 * Perspective winter snow that follows the heightfield instead of painting a
 * uniform white wash. Soft irregular drifts accumulate on gentle slopes only.
 */
export function SeasonalSnowDrifts({
  tiles,
  season = 'summer',
  climateId = null,
  mapSeed = 0,
}: SeasonalSnowDriftsProps) {
  const quality = useRenderQuality();
  const surface = useSurfaceHeight();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  const placements = useMemo(() => {
    if (season !== 'winter' || quality.id === 'low') return [] as DriftPlacement[];
    const harsh = climateId === 'winter_deep_snow' || climateId === 'winter_announced_blizzard';
    const density = quality.id === 'ultra' ? 1.25 : quality.id === 'high' ? 0.95 : 0.6;
    const out: DriftPlacement[] = [];
    for (const tile of tiles) {
      if (isWaterTerrain(tile.terrain)) continue;
      if (tile.terrain === 'desert' || tile.terrain === 'volcano') continue;
      const origin = cubeToWorld(tile.coord);
      const count = Math.round(
        // Drifts pile up in forests and on heights; open farmland keeps only a
        // few so its own colour stays readable under the snow.
        (tile.terrain === 'mountain' || tile.terrain === 'goldmine' || tile.terrain === 'glacier'
          ? 6
          : tile.terrain === 'forest' || tile.terrain === 'tundra' || tile.terrain === 'jungle'
            ? 4
            : 1.5)
          * density
          + (harsh ? 1 : 0),
      );
      for (let i = 0; i < count; i++) {
        const seed = hashString(`${mapSeed}:drift:${tile.id}:${i}`);
        const angle = ((seed % 628) / 100);
        const radius = ((seed >> 6) % 100) / 100 * HEX_WORLD_RADIUS * 0.78;
        out.push({
          x: origin.x + Math.cos(angle) * radius,
          z: origin.z + Math.sin(angle) * radius,
          scaleX: 0.2 + ((seed >> 3) % 45) / 100,
          scaleZ: 0.14 + ((seed >> 9) % 38) / 100,
          rotation: ((seed % 314) / 100),
        });
      }
    }
    return out;
  }, [climateId, mapSeed, quality.id, season, tiles]);

  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(1, 22);
    const position = geo.getAttribute('position');
    for (let index = 1; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      const a = Math.atan2(y, x);
      const irregular = 1 + Math.sin(a * 3.7) * 0.14 + Math.sin(a * 7.1 + 1.2) * 0.07;
      position.setXY(index, x * irregular, y * irregular);
    }
    position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e8eeed',
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  }), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || placements.length === 0) return;
    let written = 0;
    for (const drift of placements) {
      surface.sampleNormal(drift.x, drift.z, normal);
      if (normal.y < 0.58) continue;
      const y = surface.sampleHeight(drift.x, drift.z) + 0.014;
      dummy.position.set(drift.x, y, drift.z);
      // CircleGeometry lives in XY; lay it onto the ground plane.
      dummy.rotation.set(-Math.PI / 2, 0, drift.rotation);
      dummy.scale.set(drift.scaleX, drift.scaleZ, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(written, dummy.matrix);
      written += 1;
    }
    mesh.count = written;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, normal, placements, surface]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (placements.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, placements.length]}
        material={material}
      receiveShadow
      castShadow={false}
      renderOrder={4}
      raycast={() => undefined}
      frustumCulled={false}
    />
  );
}

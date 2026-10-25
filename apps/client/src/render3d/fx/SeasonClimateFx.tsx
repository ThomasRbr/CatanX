import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { useRenderQuality } from '../quality/RenderQualityContext';
import type { WorldBounds } from '../camera/fitOrthographicCamera';
import { useMapLod } from '../camera/MapLodContext';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { getClimateVisualPreset } from '../utils/seasonVisuals';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { StormLightning, WeatherParticles } from './weatherParticles';

interface SeasonClimateFxProps {
  tiles: HexTile[];
  bounds: WorldBounds;
  climateId?: string | null;
  enabled: boolean;
  /**
   * Flat per-hex tint discs. Only for the flat board: on the relief board they
   * sank under hills and floated over valleys, and the continuous terrain
   * material already carries the climate tint.
   */
  groundVeil?: boolean;
}

function deterministicUnit(index: number, salt: number): number {
  const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function GroundClimateVeil({
  tiles,
  climateId,
}: {
  tiles: HexTile[];
  climateId?: string | null;
}) {
  const preset = getClimateVisualPreset(climateId);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const landTiles = useMemo(
    () => tiles.filter((tile) => !isWaterTerrain(tile.terrain)),
    [tiles],
  );
  const geometry = useMemo(
    () => new THREE.CircleGeometry(HEX_WORLD_RADIUS * 0.79, 6),
    [],
  );
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: preset?.terrainTint ?? '#ffffff',
        transparent: true,
        opacity: preset?.surfaceOpacity ?? 0,
        roughness: 0.96,
        metalness: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    [preset?.surfaceOpacity, preset?.terrainTint],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < landTiles.length; i++) {
      const tile = landTiles[i]!;
      const pos = cubeToWorld(tile.coord);
      const scale = 0.82 + deterministicUnit(i, 4) * 0.16;
      dummy.position.set(pos.x, HEX_SLAB_THICKNESS + 0.014, pos.z);
      dummy.rotation.set(-Math.PI / 2, 0, deterministicUnit(i, 7) * Math.PI);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = landTiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // A new material recreates the instanced mesh (it is in `args`): its
    // matrices must be written again, or every disc stacks upright at the
    // origin — the dark plate that appeared mid-board on each climate change.
  }, [dummy, landTiles, material]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (!preset || preset.surfaceOpacity <= 0 || landTiles.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, landTiles.length]}
      frustumCulled
      raycast={() => undefined}
      renderOrder={2}
    />
  );
}

/** Persistent, deterministic weather layer. It disappears completely with reduced animations. */
export function SeasonClimateFx({
  tiles,
  bounds,
  climateId = null,
  enabled,
  groundVeil = true,
}: SeasonClimateFxProps) {
  const quality = useRenderQuality();
  if (!climateId) return null;
  return (
    <group name="season-climate-fx">
      {groundVeil && <GroundClimateVeil tiles={tiles} climateId={climateId} />}
      {enabled && quality.atmosphericFx && (
        <WeatherParticles bounds={bounds} climateId={climateId} />
      )}
      {enabled && quality.atmosphericFx && (
        <StormLightning bounds={bounds} climateId={climateId} />
      )}
    </group>
  );
}

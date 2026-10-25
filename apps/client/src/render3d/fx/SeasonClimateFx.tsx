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

interface SeasonClimateFxProps {
  tiles: HexTile[];
  bounds: WorldBounds;
  climateId?: string | null;
  enabled: boolean;
}

function deterministicUnit(index: number, salt: number): number {
  const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function particleColor(kind: string): string {
  if (kind === 'rain') return '#8bc9ed';
  if (kind === 'snow' || kind === 'blizzard' || kind === 'frost') return '#f2f8ff';
  if (kind === 'dust') return '#d6a45f';
  if (kind === 'pollen') return '#f4dd82';
  if (kind === 'leaves') return '#dc7b3e';
  if (kind === 'wind') return '#d8e5eb';
  return '#d6e1e4';
}

function particleSize(kind: string): number {
  if (kind === 'rain') return 0.035;
  if (kind === 'snow' || kind === 'blizzard') return 0.075;
  if (kind === 'leaves') return 0.065;
  if (kind === 'pollen' || kind === 'frost') return 0.045;
  return 0.055;
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
  }, [dummy, landTiles]);

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

function ContinuousWeather({
  bounds,
  climateId,
}: {
  bounds: WorldBounds;
  climateId?: string | null;
}) {
  const lod = useMapLod();
  const preset = getClimateVisualPreset(climateId);
  const kind = preset?.particle ?? 'mist';
  const baseCount = lod === 0 ? 360 : lod === 1 ? 240 : 110;
  const count = Math.max(0, Math.round(baseCount * (preset?.weatherDensity ?? 0)));
  const spanX = Math.max(8, bounds.maxX - bounds.minX + 7);
  const spanZ = Math.max(8, bounds.maxZ - bounds.minZ + 7);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = centerX + (deterministicUnit(i, 1) - 0.5) * spanX;
      positions[i * 3 + 1] = 0.35 + deterministicUnit(i, 2) * 7.5;
      positions[i * 3 + 2] = centerZ + (deterministicUnit(i, 3) - 0.5) * spanZ;
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return result;
  }, [centerX, centerZ, count, spanX, spanZ]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (!preset || count === 0) return;
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const verticalSpeed =
      kind === 'rain' ? 5.8 : kind === 'blizzard' ? 1.5 : kind === 'snow' ? 0.72 :
        kind === 'leaves' ? 0.38 : kind === 'frost' ? 0.22 : kind === 'pollen' ? 0.12 : 0.04;
    const horizontalSpeed =
      (kind === 'wind' || kind === 'blizzard' || kind === 'dust' ? 1.25 : 0.28) *
      preset.windStrength;
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < count; i++) {
      const offset = i * 3;
      let x = attr.array[offset] as number;
      let y = attr.array[offset + 1] as number;
      let z = attr.array[offset + 2] as number;
      const phase = deterministicUnit(i, 9) * Math.PI * 2;
      x += horizontalSpeed * dt;
      z += Math.sin(phase + y * 0.85) * dt * (kind === 'snow' || kind === 'leaves' ? 0.35 : 0.12);
      y -= verticalSpeed * dt;
      if (x > centerX + spanX * 0.5) x -= spanX;
      if (z > centerZ + spanZ * 0.5) z -= spanZ;
      if (z < centerZ - spanZ * 0.5) z += spanZ;
      if (y < 0.18) y = 6.2 + deterministicUnit(i, 12) * 2.2;
      attr.array[offset] = x;
      attr.array[offset + 1] = y;
      attr.array[offset + 2] = z;
    }
    attr.needsUpdate = true;
  });

  if (!preset || count === 0) return null;
  return (
    <points geometry={geometry} frustumCulled={false} raycast={() => undefined} renderOrder={30}>
      <pointsMaterial
        color={particleColor(kind)}
        size={particleSize(kind)}
        transparent
        opacity={kind === 'mist' || kind === 'wind' ? 0.3 : 0.72}
        sizeAttenuation
        depthWrite={false}
        fog
      />
    </points>
  );
}

/** Persistent, deterministic weather layer. It disappears completely with reduced animations. */
export function SeasonClimateFx({
  tiles,
  bounds,
  climateId = null,
  enabled,
}: SeasonClimateFxProps) {
  const quality = useRenderQuality();
  if (!climateId) return null;
  return (
    <group name="season-climate-fx">
      <GroundClimateVeil tiles={tiles} climateId={climateId} />
      {enabled && quality.atmosphericFx && (
        <ContinuousWeather bounds={bounds} climateId={climateId} />
      )}
    </group>
  );
}

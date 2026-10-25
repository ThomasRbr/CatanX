import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { hexNeighbor, hexToId, type HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';

interface IceFloesProps {
  tiles: readonly HexTile[];
  mapSeed: number;
  season?: string;
}

interface FloePlacement {
  x: number;
  z: number;
  scale: number;
  stretch: number;
  rotation: number;
  tilt: number;
}

/** Floe top sits just above the calm ocean plane (-0.065); swell laps over it. */
const FLOE_Y = -0.048;

/**
 * Broken pack ice drifting off glacier coasts. Without it an edge glacier met
 * open blue water directly; floes (more of them in winter) carry the cold out
 * into the sea and replace the brown wet boulders on those shores.
 */
export function IceFloes({ tiles, mapSeed, season = 'summer' }: IceFloesProps) {
  const quality = useRenderQuality();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const placements = useMemo(() => {
    if (quality.id === 'low') return [] as FloePlacement[];
    const byId = new Map(tiles.map((tile) => [tile.id, tile]));
    const winter = season === 'winter';
    const out: FloePlacement[] = [];
    for (const tile of tiles) {
      if (tile.terrain !== 'glacier' && !(winter && tile.terrain === 'tundra')) continue;
      const origin = cubeToWorld(tile.coord);
      for (let direction = 0; direction < 6; direction++) {
        const neighbour = byId.get(hexToId(hexNeighbor(tile.coord, direction as 0 | 1 | 2 | 3 | 4 | 5)));
        if (neighbour && neighbour.terrain !== 'ocean' && neighbour.terrain !== 'coast') continue;
        // Same corner convention as the perimeter: E, NE, NW, W, SW, SE.
        const angle = THREE.MathUtils.degToRad(60 * ((6 - direction) % 6) - 30 + 30);
        const count = (winter ? 12 : 8) + (hashString(`${mapSeed}:floe:${tile.id}:${direction}`) % 4);
        // Independent hashes per attribute: bit-shifting one hash correlated
        // position and size and lined the floes up in a column.
        const unit = (i: number, key: string) =>
          (hashString(`${mapSeed}:floe:${tile.id}:${direction}:${i}:${key}`) % 10007) / 10007;
        for (let i = 0; i < count; i++) {
          const along = (unit(i, 'along') - 0.5) * HEX_WORLD_RADIUS * 1.5;
          // Fewer, smaller pieces the further they drift.
          const drift = unit(i, 'drift') ** 1.5;
          const distance = 1.36 + drift * 1.0;
          const x = origin.x + Math.cos(angle) * distance + Math.cos(angle + Math.PI / 2) * along;
          const z = origin.z + Math.sin(angle) * distance + Math.sin(angle + Math.PI / 2) * along;
          const size = 0.035 + unit(i, 'size') ** 2 * 0.11 * (1 - drift * 0.55);
          out.push({
            x,
            z,
            scale: size,
            stretch: 0.55 + unit(i, 'stretch') * 0.8,
            rotation: unit(i, 'rot') * Math.PI * 2,
            tilt: (unit(i, 'tilt') - 0.5) * 0.08,
          });
        }
      }
    }
    return out;
  }, [mapSeed, quality.id, season, tiles]);

  const geometry = useMemo(() => {
    // An irregular slab: a low prism with a jittered, faceted outline.
    const sides = 9;
    const geo = new THREE.CylinderGeometry(1, 0.92, 0.22, sides, 1);
    const position = geo.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const angle = Math.atan2(z, x);
      const jag = 1 + Math.sin(angle * 3 + 1.3) * 0.16 + Math.sin(angle * 7 - 0.4) * 0.07;
      position.setX(index, x * jag);
      position.setZ(index, z * jag);
    }
    position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: season === 'winter' ? '#f4f8fa' : '#e8f1f4',
        roughness: 0.38,
        metalness: 0,
        clearcoat: 0.45,
        clearcoatRoughness: 0.3,
        sheen: 0.4,
        sheenColor: new THREE.Color('#bfe3ef'),
        envMapIntensity: 1.1,
      }),
    [season],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || placements.length === 0) return;
    for (let index = 0; index < placements.length; index++) {
      const floe = placements[index]!;
      dummy.position.set(floe.x, FLOE_Y, floe.z);
      dummy.rotation.set(floe.tilt, floe.rotation, -floe.tilt * 0.6);
      dummy.scale.set(floe.scale, floe.scale * 0.18, floe.scale * floe.stretch);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, placements]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  if (placements.length === 0) return null;
  return (
    <instancedMesh
      key={placements.length}
      ref={meshRef}
      args={[geometry, material, placements.length]}
      receiveShadow
      raycast={() => undefined}
    />
  );
}

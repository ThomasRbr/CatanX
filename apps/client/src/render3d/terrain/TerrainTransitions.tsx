import { useEffect, useMemo } from 'react';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { TERRAIN_BASE_COLORS } from './TerrainCatalog';
import { useSurfaceHeight } from './SurfaceHeightContext';
import { hashString } from '../utils/seededVisualRandom';

interface TerrainTransitionsProps {
  tiles: readonly HexTile[];
}

function adjacent(a: HexTile, b: HexTile): boolean {
  return Math.max(
    Math.abs(a.coord.q - b.coord.q),
    Math.abs(a.coord.r - b.coord.r),
    Math.abs(a.coord.s - b.coord.s),
  ) === 1;
}

function buildTransitionGeometry(
  tiles: readonly HexTile[],
  sampleHeight: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const segments = 8;
  for (let ai = 0; ai < tiles.length; ai++) {
    const a = tiles[ai]!;
    if (isWaterTerrain(a.terrain)) continue;
    for (let bi = ai + 1; bi < tiles.length; bi++) {
      const b = tiles[bi]!;
      if (a.terrain === b.terrain || isWaterTerrain(b.terrain) || !adjacent(a, b)) continue;
      const aw = cubeToWorld(a.coord);
      const bw = cubeToWorld(b.coord);
      const dx = bw.x - aw.x;
      const dz = bw.z - aw.z;
      const distance = Math.max(0.001, Math.hypot(dx, dz));
      const normalX = dx / distance;
      const normalZ = dz / distance;
      const tangentX = -normalZ;
      const tangentZ = normalX;
      const midX = (aw.x + bw.x) * 0.5;
      const midZ = (aw.z + bw.z) * 0.5;
      const halfLength = HEX_WORLD_RADIUS * 0.49;
      const halfWidth = 0.11;
      const colorA = new THREE.Color(TERRAIN_BASE_COLORS[a.terrain]);
      const colorB = new THREE.Color(TERRAIN_BASE_COLORS[b.terrain]);
      const seed = hashString(`${a.id}|${b.id}`);
      const firstVertex = positions.length / 3;

      for (let segment = 0; segment <= segments; segment++) {
        const t = segment / segments;
        const along = THREE.MathUtils.lerp(-halfLength, halfLength, t);
        const meander = Math.sin(t * Math.PI * 2 + seed * 0.002) * 0.025;
        const centerX = midX + tangentX * along + normalX * meander;
        const centerZ = midZ + tangentZ * along + normalZ * meander;
        const ax = centerX - normalX * halfWidth;
        const az = centerZ - normalZ * halfWidth;
        const bx = centerX + normalX * halfWidth;
        const bz = centerZ + normalZ * halfWidth;
        positions.push(
          ax, sampleHeight(ax, az) + 0.008, az,
          bx, sampleHeight(bx, bz) + 0.008, bz,
        );
        colors.push(colorA.r, colorA.g, colorA.b, colorB.r, colorB.g, colorB.b);
        if (segment > 0) {
          const previous = firstVertex + (segment - 1) * 2;
          const current = firstVertex + segment * 2;
          indices.push(previous, current, previous + 1, current, current + 1, previous + 1);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Soft material bridge between neighboring biomes in the Diorama renderer. */
export function TerrainTransitions({ tiles }: TerrainTransitionsProps) {
  const surface = useSurfaceHeight();
  const geometry = useMemo(
    () => buildTransitionGeometry(tiles, (x, z) => surface.sampleHeight(x, z)),
    [surface, tiles],
  );
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.12,
    roughness: 0.96,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    flatShading: false,
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
      renderOrder={2}
      raycast={() => undefined}
    />
  );
}

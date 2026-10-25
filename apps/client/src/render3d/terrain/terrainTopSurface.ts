import type { TerrainType } from '@catanx/engine';
import * as THREE from 'three';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { getColoredHexSlab } from './coloredHexSlab';

const surfaceCache = new Map<TerrainType, THREE.BufferGeometry>();

/**
 * Extracts upward-facing triangles while preserving vertex colour and UV data.
 * Diorama uses these surfaces instead of six-sided board-game slabs; logical
 * hexes and invisible picking meshes remain unchanged.
 */
function extractUpwardSurface(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const uv = geometry.getAttribute('uv');
  const uv1 = geometry.getAttribute('uv1');

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const uv1s: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    if (normal.y < 0.42) continue;

    for (let vertex = 0; vertex < 3; vertex++) {
      const sourceIndex = index + vertex;
      positions.push(
        position.getX(sourceIndex),
        position.getY(sourceIndex),
        position.getZ(sourceIndex),
      );
      if (color) colors.push(color.getX(sourceIndex), color.getY(sourceIndex), color.getZ(sourceIndex));
      if (uv) uvs.push(uv.getX(sourceIndex), uv.getY(sourceIndex));
      if (uv1) uv1s.push(uv1.getX(sourceIndex), uv1.getY(sourceIndex));
    }
  }
  geometry.dispose();

  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors.length > 0) surface.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (uvs.length > 0) surface.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (uv1s.length > 0) surface.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1s, 2));
  surface.computeVertexNormals();
  surface.computeBoundingSphere();
  return surface;
}

export function getTerrainTopSurface(terrain: TerrainType): THREE.BufferGeometry {
  const cached = surfaceCache.get(terrain);
  if (cached) return cached;
  const slab = getColoredHexSlab(
    '#ffffff',
    '#746b5d',
    HEX_WORLD_RADIUS,
    HEX_SLAB_THICKNESS,
    terrain,
  );
  const surface = extractUpwardSurface(slab);
  surfaceCache.set(terrain, surface);
  return surface;
}

export function clearTerrainTopSurfaceCache(): void {
  for (const geometry of surfaceCache.values()) geometry.dispose();
  surfaceCache.clear();
}

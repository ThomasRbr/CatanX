import * as THREE from 'three';
import { HEX_WORLD_RADIUS } from './hexToWorld';

/**
 * Extruded pointy-top hex slab (Y up). Slight oversize avoids hairline gaps.
 */
export function createHexSlabGeometry(
  radius = HEX_WORLD_RADIUS,
  thickness = 0.14,
  oversize = 1.01,
): THREE.ExtrudeGeometry {
  const r = radius * oversize;
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  });
  // Shape in XY, extrude +Z → rotate so top faces +Y
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, thickness, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** Closed pointy-top ring on the slab top (for hover / grid), not full mesh edges. */
export function createHexRingGeometry(
  radius = HEX_WORLD_RADIUS,
  y = 0.145,
): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 180) * (60 * (i % 6) - 30);
    points.push(
      new THREE.Vector3(radius * 0.98 * Math.cos(angle), y, radius * 0.98 * Math.sin(angle)),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

export const HEX_SLAB_THICKNESS = 0.14;

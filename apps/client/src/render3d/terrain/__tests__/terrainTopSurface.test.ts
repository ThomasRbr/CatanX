import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getTerrainTopSurface } from '../terrainTopSurface';

describe('terrainTopSurface', () => {
  it('retire les parois verticales tout en conservant couleurs et UV', () => {
    const geometry = getTerrainTopSurface('pasture');
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');

    expect(position.count).toBeGreaterThan(100);
    expect(geometry.getAttribute('color')).toBeTruthy();
    expect(geometry.getAttribute('uv')).toBeTruthy();

    const n = new THREE.Vector3();
    for (let index = 0; index < normal.count; index++) {
      n.fromBufferAttribute(normal, index);
      expect(n.y).toBeGreaterThan(0.35);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  boundsCenter,
  computeIslandBounds,
  computeWorldBounds,
  fitOrthographicZoom,
} from '../../camera/fitOrthographicCamera';
import type { OrthographicCamera } from 'three';

describe('fitOrthographicCamera helpers', () => {
  it('computes padded world bounds from tile centers', () => {
    const bounds = computeWorldBounds(
      [
        { x: -2, y: 0, z: -1 },
        { x: 2, y: 0, z: 3 },
      ],
      1,
    );
    expect(bounds).toEqual({ minX: -3, maxX: 3, minZ: -2, maxZ: 4 });
    expect(boundsCenter(bounds)).toEqual({ x: 0, z: 1 });
  });

  it('frames land tiles tighter than full map with ocean', () => {
    const land = { terrain: 'forest' as const, position: { x: 0, y: 0, z: 0 } };
    const ocean = { terrain: 'ocean' as const, position: { x: 8, y: 0, z: 0 } };
    const island = computeIslandBounds([land, ocean], 1);
    const full = computeWorldBounds(
      [land.position, ocean.position],
      1,
    );
    expect(island.maxX - island.minX).toBeLessThan(full.maxX - full.minX);
  });

  it('returns a finite zoom that fits width and height', () => {
    const camera = { zoom: 1 } as OrthographicCamera;
    const zoom = fitOrthographicZoom(
      camera,
      { minX: -5, maxX: 5, minZ: -4, maxZ: 4 },
      800,
      600,
      1,
    );
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeGreaterThan(0);
  });

  it('reduces zoom so the island fits the HUD-safe viewport', () => {
    const camera = { zoom: 1 } as OrthographicCamera;
    const bounds = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
    const full = fitOrthographicZoom(camera, bounds, 1280, 720, 1.05);
    const inset = fitOrthographicZoom(camera, bounds, 1280, 720, {
      margin: 1.05,
      hudInsets: { top: 72, right: 200, bottom: 88, left: 180 },
    });
    expect(inset).toBeLessThan(full);
  });
});

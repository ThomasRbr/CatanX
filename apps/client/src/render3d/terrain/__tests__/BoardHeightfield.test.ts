import { describe, expect, it } from 'vitest';
import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { BoardHeightfield } from '../BoardHeightfield';
import { HEX_SLAB_THICKNESS } from '../../utils/createHexGeometry';
import { cubeToWorld } from '../../utils/hexToWorld';

function tile(id: string, terrain: HexTile['terrain'], x: number, z: number): HexTile {
  return {
    id,
    terrain,
    coord: { q: x, r: z, s: -x - z },
    number: 5,
  } as unknown as HexTile;
}

describe('BoardHeightfield', () => {
  it('is deterministic and raises a mountain centre above the common seam', () => {
    const tiles = [tile('mountain-a', 'mountain', 0, 0)];
    const a = new BoardHeightfield(tiles);
    const b = new BoardHeightfield(tiles);
    expect(a.sampleTileHeight('mountain-a')).toBe(b.sampleTileHeight('mountain-a'));
    expect(a.sampleTileHeight('mountain-a')).toBeGreaterThan(HEX_SLAB_THICKNESS - 0.03);
  });

  it('keeps the outer coast within a controlled macro-relief envelope', () => {
    const source = tile('forest-a', 'forest', 0, 0);
    const field = new BoardHeightfield([source]);
    const center = cubeToWorld(source.coord);
    const edge = field.sampleHeight(center.x + 0.86, center.z + 0.49);
    expect(Math.abs(edge - HEX_SLAB_THICKNESS)).toBeLessThan(0.12);
  });

  it('is continuous across the shared edge of adjacent terrains', () => {
    const field = new BoardHeightfield([
      tile('forest-a', 'forest', 0, 0),
      tile('hill-b', 'hill', 1, 0),
    ]);
    const a = field.sampleHeight(0.86 - 0.002, 0);
    const b = field.sampleHeight(0.86 + 0.002, 0);
    expect(Math.abs(a - b)).toBeLessThan(0.012);
  });

  it('returns a normalized surface normal', () => {
    const field = new BoardHeightfield([tile('hill-a', 'hill', 0, 0)]);
    expect(field.sampleNormal(0.1, 0.1).length()).toBeCloseTo(1, 5);
  });

  it('blends an alpine massif through broad foothills without cliff-sized jumps', () => {
    const mountain = tile('mountain-a', 'mountain', 0, 0);
    const pasture = tile('pasture-b', 'pasture', 1, 0);
    const field = new BoardHeightfield([mountain, pasture]);
    const mountainCenter = cubeToWorld(mountain.coord);
    const pastureCenter = cubeToWorld(pasture.coord);
    const foot = field.sampleHeight(pastureCenter.x, pastureCenter.z);
    // The centre of a massif is a col (the chit rests there); the summits ring
    // it. Measure against the highest point actually crossed.
    let previous = field.sampleHeight(mountainCenter.x, mountainCenter.z);
    let summit = previous;
    let maximumStep = 0;
    for (let index = 1; index <= 48; index++) {
      const t = index / 48;
      const x = THREE.MathUtils.lerp(mountainCenter.x, pastureCenter.x, t);
      const z = THREE.MathUtils.lerp(mountainCenter.z, pastureCenter.z, t);
      const next = field.sampleHeight(x, z);
      summit = Math.max(summit, next);
      maximumStep = Math.max(maximumStep, Math.abs(next - previous));
      previous = next;
    }
    expect(summit).toBeGreaterThan(foot);
    // Expressed against the massif's own relief rather than an absolute height,
    // so it keeps its meaning when the elevation table is re-scaled. What it
    // guards is continuity: no single 1/48th of the descent may swallow a large
    // share of the total drop, which is what a cliff or a seam would look like.
    expect(maximumStep).toBeLessThan((summit - foot) * 0.2);
  });

  it('carves dirt roads into the continuous land surface', () => {
    const source = tile('pasture-a', 'pasture', 0, 0);
    const center = cubeToWorld(source.coord);
    const plain = new BoardHeightfield([source]);
    const carved = new BoardHeightfield([source], [{
      ax: center.x - 0.4,
      az: center.z,
      bx: center.x + 0.4,
      bz: center.z,
      halfWidth: 0.12,
      depth: 0.04,
    }]);
    const midPlain = plain.sampleHeight(center.x, center.z);
    const midCarved = carved.sampleHeight(center.x, center.z);
    const shoulder = carved.sampleHeight(center.x, center.z + 0.22);
    expect(midCarved).toBeLessThan(midPlain - 0.012);
    expect(shoulder).toBeGreaterThan(midCarved + 0.008);
  });
});

import { describe, expect, it } from 'vitest';
import type { HexTile, TerrainType } from '@catanx/engine';
import { buildGroundScatter, buildMeadowFlowerScatter } from '../TerrainMicroScatter';

function tile(id: string, terrain: TerrainType, q = 0): HexTile {
  return { id, terrain, coord: { q, r: 0, s: -q } } as HexTile;
}

describe('terrain micro scatter', () => {
  it('is deterministic and only covers vegetation biomes', () => {
    const tiles = [tile('forest', 'forest'), tile('hill', 'hill', 1), tile('plains', 'plains', 2)];
    const first = buildGroundScatter(tiles, 77, 0.5);
    const second = buildGroundScatter(tiles, 77, 0.5);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(20);
    // Plains are golden wheat fields — no grass carpet instances there.
    expect(buildGroundScatter([tile('plains', 'plains')], 77, 1)).toHaveLength(0);
    expect(first.every((tuft) => Number.isFinite(tuft.x) && Number.isFinite(tuft.z))).toBe(true);
  });

  it('scales density without producing cover on stone terrain', () => {
    expect(buildGroundScatter([tile('mountain', 'mountain')], 2, 1)).toHaveLength(0);
    expect(buildGroundScatter([tile('pasture', 'pasture')], 2, 1).length)
      .toBeGreaterThan(buildGroundScatter([tile('pasture', 'pasture')], 2, 0.25).length);
  });

  it('adds deterministic wildflower clusters only to meadows and forest edges', () => {
    const meadow = buildMeadowFlowerScatter([tile('pasture', 'pasture')], 22, 1);
    expect(meadow.length).toBeGreaterThan(5);
    expect(meadow).toEqual(buildMeadowFlowerScatter([tile('pasture', 'pasture')], 22, 1));
    expect(buildMeadowFlowerScatter([tile('mountain', 'mountain')], 22, 1)).toHaveLength(0);
  });
});

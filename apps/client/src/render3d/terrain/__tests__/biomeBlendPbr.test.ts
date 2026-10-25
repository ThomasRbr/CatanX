import { describe, expect, it } from 'vitest';
import { terrainMaterialFamily } from '../ContinuousTerrainSurface';
import { BIOME_BLEND_ESTIMATED_TEXTURE_UNITS } from '../biomeBlendPbr';

describe('continuous terrain PBR families', () => {
  it('routes classic terrains to distinct material families', () => {
    expect(terrainMaterialFamily('pasture')).toBe(0);
    expect(terrainMaterialFamily('forest')).toBe(5);
    expect(terrainMaterialFamily('plains')).toBe(1);
    expect(terrainMaterialFamily('mountain')).toBe(2);
    expect(terrainMaterialFamily('hill')).toBe(3);
    expect(terrainMaterialFamily('desert')).toBe(4);
  });

  it('keeps exotic terrains in visually coherent material families', () => {
    expect(terrainMaterialFamily('glacier')).toBe(2);
    expect(terrainMaterialFamily('volcano')).toBe(3);
    expect(terrainMaterialFamily('ruins')).toBe(3);
    expect(terrainMaterialFamily('jungle')).toBe(5);
    expect(terrainMaterialFamily('swamp')).toBe(5);
  });

  it('stays within the WebGL2 fragment sampler guarantee', () => {
    expect(BIOME_BLEND_ESTIMATED_TEXTURE_UNITS).toBeLessThanOrEqual(16);
  });
});

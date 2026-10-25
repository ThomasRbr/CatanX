import { describe, expect, it } from 'vitest';
import {
  createCrossedConiferImpostorGeometry,
  createTreeCrownGeometry,
  createTreeSnowGeometry,
  createTreeTrunkGeometry,
  createUnderstoryGeometry,
  type TreeSpecies,
} from '../photorealTreeGeometry';
import { treeSpeciesForTerrain } from '../InstancedTrees';

const SPECIES: TreeSpecies[] = ['spruce', 'pine', 'deciduous', 'beech'];

describe('photoreal tree geometry', () => {
  it('builds a multi-plane conifer volume with UVs', () => {
    const geometry = createCrossedConiferImpostorGeometry();
    expect(geometry.getAttribute('position').count).toBe(20);
    expect(geometry.getAttribute('uv').count).toBe(20);
    expect(geometry.boundingBox?.min.y).toBeLessThan(0.05);
    expect(geometry.boundingBox?.max.y).toBeGreaterThan(1.0);
    expect(geometry.boundingBox?.max.x).toBeGreaterThan(0.3);
    geometry.dispose();

    const broadleaf = createCrossedConiferImpostorGeometry('beech');
    expect(broadleaf.getAttribute('position').count).toBe(16);
    expect(broadleaf.boundingBox?.max.y).toBeGreaterThan(1.0);
    broadleaf.dispose();
  });

  it.each(SPECIES)('builds a grounded, coloured %s tree', (species) => {
    const trunk = createTreeTrunkGeometry(species);
    const crown = createTreeCrownGeometry(species);
    const snow = createTreeSnowGeometry(species);

    for (const geometry of [trunk, crown, snow]) {
      expect(geometry.getAttribute('position').count).toBeGreaterThan(20);
      expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count);
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingSphere).not.toBeNull();
      geometry.dispose();
    }
  });

  it('keeps cold biomes evergreen and gives forests a mixed canopy', () => {
    expect(treeSpeciesForTerrain('glacier', 1)).toBe('spruce');
    expect(treeSpeciesForTerrain('tundra', 4)).toBe('pine');
    const forest = new Set(Array.from({ length: 8 }, (_, variant) => treeSpeciesForTerrain('forest', variant)));
    expect(forest).toEqual(new Set(['spruce', 'pine', 'beech', 'deciduous']));
  });

  it('builds a low coloured understory mesh for the naturalized renderer', () => {
    const geometry = createUnderstoryGeometry();
    expect(geometry.getAttribute('position').count).toBeGreaterThan(200);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.boundingBox?.min.y).toBeGreaterThanOrEqual(0);
    expect(geometry.boundingBox?.max.y).toBeLessThan(0.24);
    geometry.dispose();
  });
});

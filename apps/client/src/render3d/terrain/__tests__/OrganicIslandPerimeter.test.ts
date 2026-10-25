import { describe, expect, it } from 'vitest';
import type { HexTile, TerrainType } from '@catanx/engine';
import { buildOrganicPerimeterGeometry } from '../OrganicIslandPerimeter';

function tile(id: string, terrain: TerrainType, q: number, r: number): HexTile {
  return { id, terrain, coord: { q, r, s: -q - r }, number: 5 } as unknown as HexTile;
}

describe('OrganicIslandPerimeter', () => {
  it('produit une boucle fermée et déterministe autour de terrains adjacents', () => {
    const tiles = [tile('a', 'pasture', 0, 0), tile('b', 'forest', 1, 0)];
    const a = buildOrganicPerimeterGeometry(tiles, 42);
    const b = buildOrganicPerimeterGeometry(tiles, 42);
    expect(a.getAttribute('position').count).toBeGreaterThan(40);
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
    expect(a.index?.count ?? 0).toBeGreaterThan(60);
    a.dispose();
    b.dispose();
  });
});

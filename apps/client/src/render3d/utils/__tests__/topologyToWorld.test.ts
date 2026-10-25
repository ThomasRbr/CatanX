import { describe, expect, it } from 'vitest';
import { buildCatanTopology, hexToId, type HexTile } from '@catanx/engine';
import { HEX_WORLD_RADIUS } from '../hexToWorld';
import {
  buildWorldTopology,
  intersectionToWorld,
  yawAlignLocalX,
  yawBetween,
} from '../topologyToWorld';

function fakeTile(q: number, r: number, terrain: HexTile['terrain'] = 'plains'): HexTile {
  const coord = { q, r, s: -q - r };
  return {
    id: hexToId(coord),
    coord,
    terrain,
    elevation: 'lowland',
    climate: 'temperate',
    diceValue: 6,
    baseProduction: {},
    modifiers: [],
    features: [],
    owner: null,
    building: null,
    units: [],
    robber: false,
    port: null,
    ...({} as Partial<HexTile>),
  } as unknown as HexTile;
}

describe('topologyToWorld', () => {
  it('builds stable intersection ids across a small map', () => {
    const map = new Map<string, HexTile>();
    for (const t of [fakeTile(0, 0), fakeTile(1, 0), fakeTile(0, 1)]) {
      map.set(t.id, t);
    }
    const topology = buildWorldTopology(map);
    expect(Object.keys(topology.intersections).length).toBeGreaterThan(6);
    expect(Object.keys(topology.edges).length).toBeGreaterThan(6);

    for (const intersection of Object.values(topology.intersections)) {
      const w = intersectionToWorld(intersection);
      expect(Number.isFinite(w.x)).toBe(true);
      expect(Number.isFinite(w.z)).toBe(true);
      expect(Math.hypot(w.x, w.z)).toBeLessThan(HEX_WORLD_RADIUS * 8);
    }
  });

  it('matches canonical setup topology ids while using world-scale positions', () => {
    const map = new Map<string, HexTile>();
    for (const t of [fakeTile(0, 0), fakeTile(1, 0), fakeTile(0, -1)]) {
      map.set(t.id, t);
    }
    const setup = buildCatanTopology(map);
    const world = buildWorldTopology(map);
    expect(Object.keys(world.intersections).sort()).toEqual(Object.keys(setup.intersections).sort());
    expect(Object.keys(world.edges).sort()).toEqual(Object.keys(setup.edges).sort());

    const sampleId = Object.keys(setup.intersections)[0]!;
    const setupPt = setup.intersections[sampleId]!;
    const worldPt = world.intersections[sampleId]!;
    // World layout size is 1 vs canonical 100 → positions scale ~1/100
    expect(Math.abs(worldPt.x)).toBeLessThan(Math.abs(setupPt.x) || 1);
    expect(Math.hypot(worldPt.x, worldPt.y)).toBeLessThan(HEX_WORLD_RADIUS * 6);
  });

  it('aligns local +X / +Z with edge directions under Three.js Y rotation', () => {
    // Edge along +X
    expect(yawAlignLocalX(0, 0, 1, 0)).toBeCloseTo(0, 5);
    // Edge along +Z: local +X must map to (0,0,1) → θ = −π/2
    expect(yawAlignLocalX(0, 0, 0, 1)).toBeCloseTo(-Math.PI / 2, 5);
    // yawBetween aligns +Z: edge along +Z → 0
    expect(yawBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(0, 5);
    expect(yawBetween({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(Math.PI / 2, 5);
  });
});

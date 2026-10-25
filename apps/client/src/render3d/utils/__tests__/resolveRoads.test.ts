import { describe, expect, it } from 'vitest';
import { hexToId, type HexTile, type GameState } from '@catanx/engine';
import { buildWorldTopology } from '../topologyToWorld';
import {
  collectEdgeRoads,
  resolveRoadsForRender,
  roadYForType,
  ROAD_PREVIEW_Y,
} from '../resolveRoads';
import { HEX_SLAB_THICKNESS } from '../createHexGeometry';

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
  } as unknown as HexTile;
}

function minimalState(map: Map<string, HexTile>): GameState {
  return {
    map,
    players: new Map([
      [
        'p1',
        {
          id: 'p1',
          color: 'red',
          roads: [],
        } as never,
      ],
    ]),
    actionLog: [
      {
        id: 'a1',
        turn: 0,
        playerId: 'p1',
        type: 'system',
        description: 'route',
        data: { edgeId: '' },
        timestamp: 0,
      },
    ],
  } as unknown as GameState;
}

describe('resolveRoads', () => {
  it('collects edge roads from classicBoard, setup and action log', () => {
    const map = new Map<string, HexTile>();
    map.set('c', fakeTile(0, 0));
    const topology = buildWorldTopology(map);
    const edgeId = Object.keys(topology.edges)[0]!;

    const state = minimalState(map);
    state.actionLog[0]!.data = { edgeId };

    const fromLog = collectEdgeRoads(state, null);
    expect(fromLog[edgeId]).toBe('p1');

    const fromSetup = collectEdgeRoads(state, {
      active: true,
      roadsByEdge: { [edgeId]: 'p1' },
    } as never);
    expect(fromSetup[edgeId]).toBe('p1');

    const boardOnly = minimalState(map);
    boardOnly.actionLog = [];
    (boardOnly as { classicBoard?: { roadsByEdge: Record<string, string> } }).classicBoard = {
      roadsByEdge: { [edgeId]: 'p1' },
    };
    expect(collectEdgeRoads(boardOnly, null)[edgeId]).toBe('p1');
  });

  it('resolves render segments on topology endpoints, not tile centers', () => {
    const map = new Map<string, HexTile>();
    for (const t of [fakeTile(0, 0), fakeTile(1, 0)]) map.set(t.id, t);
    const topology = buildWorldTopology(map);
    const edgeId = Object.keys(topology.edges).find((id) => {
      const e = topology.edges[id]!;
      return e.tileIds.length >= 1;
    })!;
    const edge = topology.edges[edgeId]!;
    const a = topology.intersections[edge.a]!;
    const b = topology.intersections[edge.b]!;

    const state = minimalState(map);
    state.actionLog[0]!.data = { edgeId };
    // Misleading tile-center roads that would look wrong if used
    const player = state.players.get('p1') as {
      roads: Array<{ from: unknown; to: unknown; type: string; level: number }>;
    };
    player.roads = [
      {
        from: { q: 0, r: 0, s: 0 },
        to: { q: 1, r: 0, s: -1 },
        type: 'road',
        level: 1,
      },
    ];

    const roads = resolveRoadsForRender(state, topology, null);
    const edgeRoad = roads.find((r) => r.key === `edge-${edgeId}`);
    expect(edgeRoad).toBeTruthy();
    expect(edgeRoad!.ax).toBeCloseTo(a.x, 5);
    expect(edgeRoad!.az).toBeCloseTo(a.y, 5);
    expect(edgeRoad!.bx).toBeCloseTo(b.x, 5);
    expect(edgeRoad!.bz).toBeCloseTo(b.y, 5);
  });

  it('ignore les routes legacy centre-à-centre quand roadsByEdge est disponible', () => {
    const map = new Map<string, HexTile>();
    for (const tile of [fakeTile(0, 0), fakeTile(1, 0)]) map.set(tile.id, tile);
    const topology = buildWorldTopology(map);
    const edgeId = Object.keys(topology.edges)[0]!;
    const state = minimalState(map);
    state.actionLog = [];
    (state as { classicBoard?: { roadsByEdge: Record<string, string> } }).classicBoard = {
      roadsByEdge: { [edgeId]: 'p1' },
    };
    const player = state.players.get('p1') as {
      roads: Array<{ from: unknown; to: unknown; type: string; level: number }>;
    };
    player.roads = [
      {
        from: { q: 0, r: 0, s: 0 },
        to: { q: 1, r: 0, s: -1 },
        type: 'road',
        level: 1,
      },
    ];

    const roads = resolveRoadsForRender(state, topology, null);
    expect(roads).toHaveLength(1);
    expect(roads[0]?.key).toBe(`edge-${edgeId}`);
  });

  it('keeps roads visible above lifted hexes and their placement preview', () => {
    expect(roadYForType('road')).toBeGreaterThan(HEX_SLAB_THICKNESS + 0.05);
    expect(roadYForType('road')).toBeLessThan(HEX_SLAB_THICKNESS + 0.085);
    expect(ROAD_PREVIEW_Y).toBeGreaterThan(roadYForType('road'));
    expect(ROAD_PREVIEW_Y).toBeLessThan(HEX_SLAB_THICKNESS + 0.11);
  });

  it('marks coastal edges as bridges and city-adjacent as paved', () => {
    const land = fakeTile(0, 0, 'pasture');
    const ocean = fakeTile(1, 0, 'ocean');
    const map = new Map<string, HexTile>();
    map.set(land.id, land);
    map.set(ocean.id, ocean);
    const topology = buildWorldTopology(map);
    const coastalEdge = Object.keys(topology.edges).find((id) => {
      const e = topology.edges[id]!;
      return e.tileIds.includes(land.id) && e.tileIds.includes(ocean.id);
    });
    expect(coastalEdge).toBeTruthy();

    const state = minimalState(map);
    state.actionLog[0]!.data = { edgeId: coastalEdge! };
    const roads = resolveRoadsForRender(state, topology, null);
    const seg = roads.find((r) => r.key === `edge-${coastalEdge}`);
    expect(seg?.type).toBe('bridge');
    expect(seg?.surface).toBe('dirt');
  });

  it('does not treat coast-land inland edges as bridges', () => {
    const coast = fakeTile(0, 0, 'coast');
    const forest = fakeTile(1, 0, 'forest');
    const map = new Map<string, HexTile>();
    map.set(coast.id, coast);
    map.set(forest.id, forest);
    const topology = buildWorldTopology(map);
    const inland = Object.keys(topology.edges).find((id) => {
      const e = topology.edges[id]!;
      return e.tileIds.includes(coast.id) && e.tileIds.includes(forest.id);
    });
    expect(inland).toBeTruthy();
    const state = minimalState(map);
    state.actionLog[0]!.data = { edgeId: inland! };
    const seg = resolveRoadsForRender(state, topology, null).find(
      (r) => r.key === `edge-${inland}`,
    );
    expect(seg?.type).toBe('road');
  });
});

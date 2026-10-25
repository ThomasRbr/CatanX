import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  refreshTrophiesAndVictory,
  updateLargestArmy,
  updateLongestRoad,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createPlayingClassic(seed = 11): {
  state: GameState;
  ctx: ReturnType<typeof makeContext>;
} {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', { mapSeed: seed, playerCount: 2 });
  const result = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'ai' },
      ],
    },
    ctx,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('create failed');
  autoCompleteClassicSetup(result.state);
  result.state.turnPhase = 'player_action';
  return { state: result.state, ctx };
}

describe('Trophées classiques', () => {
  it('attribue la route la plus longue dès 5 arêtes continues', () => {
    const { state } = createPlayingClassic(15);
    const playerId = state.turnOrder[0];
    const board = state.classicBoard!;

    // Construire une chaîne continue de 5 arêtes en partant d'une route existante
    board.roadsByEdge = {};
    board.occupiedIntersections = {};
    const edges = Object.entries(board.topology.edges);
    const findPath = (node: string, used: Set<string>, path: string[]): string[] | null => {
      if (path.length >= 5) return path;
      for (const [edgeId, edge] of edges) {
        if (used.has(edgeId) || (edge.a !== node && edge.b !== node)) continue;
        used.add(edgeId);
        const found = findPath(edge.a === node ? edge.b : edge.a, used, [...path, edgeId]);
        if (found) return found;
        used.delete(edgeId);
      }
      return null;
    };
    const start = edges[0]?.[1].a;
    const chain = start ? (findPath(start, new Set(), []) ?? []) : [];
    for (const edgeId of chain) board.roadsByEdge[edgeId] = playerId;

    expect(chain.length).toBeGreaterThanOrEqual(5);
    updateLongestRoad(state);
    expect(state.longestRoadOwner).toBe(playerId);
    expect(state.longestRoadLength).toBeGreaterThanOrEqual(5);

    refreshTrophiesAndVictory(state);
    const player = state.players.get(playerId)!;
    expect(player.stats.vpBreakdown.longestRoad).toBe(2);
  });

  it('attribue l’armée la plus grande dès 3 chevaliers', () => {
    const { state } = createPlayingClassic(17);
    const playerId = state.turnOrder[0];
    const player = state.players.get(playerId)!;
    player.militaryCards = ['k1', 'k2', 'k3'];
    updateLargestArmy(state);
    expect(state.largestArmyOwner).toBe(playerId);
    expect(state.largestArmySize).toBe(3);
    refreshTrophiesAndVictory(state);
    expect(player.stats.vpBreakdown.largestArmy).toBe(2);
  });

  it('détecte une victoire immédiate quand le seuil est atteint', () => {
    const { state } = createPlayingClassic(19);
    const playerId = state.turnOrder[0];
    state.config.victoryPointTarget = 2;
    // Setup place déjà 2 villages (= 2 VP) → seuil atteint dès le refresh
    refreshTrophiesAndVictory(state);
    expect(state.phase).toBe('finished');
    expect(state.winner).toBe(playerId);
  });
});

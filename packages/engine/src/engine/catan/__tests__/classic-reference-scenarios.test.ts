import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  runHeadlessSimulation,
  SeededRandom,
  CLASSIC_BEGINNER_TERRAINS,
  CLASSIC_PIECE_LIMITS,
  classicBoardHasRedNumberConflict,
} from '@catanx/engine';
import type { GameState } from '../../../types/game';
import type { CivilizationType } from '../../../types/player';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

const CIVS: CivilizationType[] = ['empire', 'merchants', 'scholars', 'nomads'];

function createClassicPlaying(playerCount: 3 | 4, seed: number, layout: 'fixed' | 'random' = 'fixed'): GameState {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: seed,
    playerCount,
    classicBoardLayout: layout,
  });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: Array.from({ length: playerCount }, (_value, index) => ({
        name: `P${index + 1}`,
        civilization: CIVS[index % CIVS.length]!,
        type: 'human' as const,
      })),
    },
    ctx,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('create failed');
  autoCompleteClassicSetup(created.state);
  return created.state;
}

describe('Classic reference scenarios (3–4 joueurs)', () => {
  it.each([3, 4] as const)(
    '%i joueurs : setup complet + topologie + inventaire',
    (playerCount) => {
      const state = createClassicPlaying(playerCount, 100 + playerCount);
      expect(state.phase).toBe('playing');
      expect(state.players.size).toBe(playerCount);
      expect(state.turnOrder).toHaveLength(playerCount);
      expect(state.map.size).toBe(19);
      expect(state.classicBoard).toBeTruthy();

      for (const playerId of state.turnOrder) {
        const stock = state.classicBoard!.piecesRemaining[playerId]!;
        // Après setup : 2 villages + 2 routes placés
        expect(stock.settlements).toBe(CLASSIC_PIECE_LIMITS.settlements - 2);
        expect(stock.roads).toBe(CLASSIC_PIECE_LIMITS.roads - 2);
        expect(stock.cities).toBe(CLASSIC_PIECE_LIMITS.cities);
      }

      const occupied = Object.keys(state.classicBoard!.occupiedIntersections);
      expect(occupied).toHaveLength(playerCount * 2);
    },
  );

  it('plateau variable : composition officielle et 6/8 non adjacents', () => {
    const random = createClassicPlaying(3, 91, 'random');

    const terrains = [...random.map.values()].map((tile) => tile.terrain);
    const count = (list: string[]) =>
      [...list].sort().reduce<Record<string, number>>((acc, terrain) => {
        acc[terrain] = (acc[terrain] ?? 0) + 1;
        return acc;
      }, {});

    expect(count(terrains)).toEqual(count([...CLASSIC_BEGINNER_TERRAINS]));
    expect(classicBoardHasRedNumberConflict(random)).toBe(false);

    const desert = [...random.map.values()].find((tile) => tile.terrain === 'desert');
    expect(desert?.diceValue ?? null).toBeNull();
    expect(random.robberPosition).toBe(desert?.id);
  });

  it.each([3, 4] as const)(
    '%i joueurs : simulation headless avance sans blocage',
    (playerCount) => {
      const result = runHeadlessSimulation({
        seed: 200 + playerCount,
        playerCount,
        maxTurns: 12,
        maxSteps: 400,
        aiDifficulty: 'medium',
      });
      expect(result.blocked).toBe(false);
      expect(result.turns).toBeGreaterThanOrEqual(2);
      expect(result.players).toHaveLength(playerCount);
    },
  );
});

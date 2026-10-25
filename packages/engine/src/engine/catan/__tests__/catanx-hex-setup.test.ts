import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  usesTopologicalPlacement,
} from '@catanx/engine';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

describe('CatanX setup (hex path retired)', () => {
  it('rejette setup_placement tuile : CatanX utilise les intersections', () => {
    const ctx = makeContext(81);
    const config = buildGameConfigFromPreset('catanx', { mapSeed: 81, playerCount: 2 });
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'human' },
          { name: 'B', civilization: 'merchants', type: 'human' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(usesTopologicalPlacement(created.state)).toBe(true);
    const playerId = created.state.turnOrder[0]!;
    const tileId = [...created.state.map.keys()][0]!;
    const placed = applyCommand(
      created.state,
      { type: 'setup_placement', playerId, tileId },
      ctx,
    );
    expect(placed.ok).toBe(false);
  });
});

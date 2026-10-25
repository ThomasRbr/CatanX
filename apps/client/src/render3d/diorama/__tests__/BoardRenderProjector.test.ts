import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
} from '@catanx/engine';
import { projectBoardRenderSnapshot } from '../BoardRenderProjector';

function createState() {
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: 707,
    playerCount: 2,
    classicBoardLayout: 'fixed',
  });
  const result = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'empire', type: 'human' },
      ],
    },
    createEngineContext(
      new SeededRandom(707),
      new FixedClock(1_700_000_000_000),
      new IncrementalIdGenerator(),
    ),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe('BoardRenderProjector', () => {
  it('produces a stable, frozen and rules-free scene snapshot', () => {
    const state = createState();
    const snapshot = projectBoardRenderSnapshot(state, 'surface');

    expect(snapshot.mapSeed).toBe(707);
    expect(snapshot.tiles).toHaveLength(state.map.size);
    expect(snapshot.nodes.length).toBeGreaterThan(30);
    expect(snapshot.edges.length).toBeGreaterThan(40);
    expect(snapshot.productionTokens.length).toBeGreaterThan(0);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tiles)).toBe(true);
    expect(Object.isFrozen(snapshot.tiles[0])).toBe(true);
    expect(snapshot).not.toHaveProperty('bank');
    expect(snapshot).not.toHaveProperty('players');
    expect(snapshot).not.toHaveProperty('devDeck');
  });

  it('keeps layer selection visual and deterministic', () => {
    const state = createState();
    const surface = projectBoardRenderSnapshot(state, 'surface');
    const sky = projectBoardRenderSnapshot(state, 'sky');
    expect(surface.revision).toBe(sky.revision);
    expect(surface.tiles).toEqual(sky.tiles);
    expect(sky.layer).toBe('sky');
  });
});


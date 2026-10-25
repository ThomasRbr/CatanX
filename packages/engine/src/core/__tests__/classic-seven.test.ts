import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  discardResources,
  moveRobber,
  stealResource,
  acknowledgeCollection,
} from '@catanx/engine';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

describe('classic seven flow', () => {
  it('runs discard, robber move and steal commands', () => {
    const ctx = makeContext(42);
    const config = buildGameConfigFromPreset('classic', { playerCount: 2 });

    const create = applyCommand(
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
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const state = create.state;
    const playerA = state.players.get(state.turnOrder[0])!;
    playerA.resources = { wood: 4, clay: 4, wheat: 4, sheep: 0, ore: 0 };

    state.turnPhase = 'discard_resources';
    state.sevenFlow = {
      playersToDiscard: [playerA.id],
      playersDiscarded: [],
      robberTileId: null,
      stealCandidates: [],
    };

    const discard = discardResources(playerA.id, { wood: 4, clay: 2 }, state);
    expect(discard.success).toBe(true);
    expect(state.turnPhase).toBe('move_robber');

    state.currentPlayerIndex = 0;
    const nextTile = [...state.map.values()].find(
      (tile) =>
        tile.id !== state.robberPosition &&
        tile.terrain !== 'ocean' &&
        tile.terrain !== 'glacier',
    )!.id;
    const moved = moveRobber(playerA.id, nextTile, state);
    expect(moved.success).toBe(true);

    if (state.sevenFlow && state.sevenFlow.stealCandidates.length > 0) {
      const target = state.sevenFlow.stealCandidates[0] ?? null;
      const stolen = stealResource(playerA.id, target, state);
      expect(stolen.success).toBe(true);
    }

    expect(state.turnPhase).toBe('player_action');
    expect(state.sevenFlow).toBeNull();
  });

  it('acknowledges resource collection after dice', () => {
    const ctx = makeContext(7);
    const config = buildGameConfigFromPreset('classic', { playerCount: 2 });
    const create = applyCommand(
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
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const state = create.state;
    state.turnPhase = 'resource_collect';
    acknowledgeCollection(state);
    expect(state.turnPhase).toBe('player_action');
  });

  it('rejects duplicate dice roll and end turn in wrong phase', () => {
    const ctx = makeContext(11);
    const config = buildGameConfigFromPreset('classic', { playerCount: 2 });
    const create = applyCommand(
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
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const state = create.state;
    const playerId = state.turnOrder[0];
    state.lastDiceRoll = {
      turn: state.currentTurn,
      player: playerId,
      die1: 3,
      die2: 4,
      total: 7,
    };
    state.turnPhase = 'discard_resources';

    const secondRoll = applyCommand(state, { type: 'roll_dice', playerId }, ctx);
    expect(secondRoll.ok).toBe(false);

    const endTurn = applyCommand(state, { type: 'end_turn', playerId }, ctx);
    expect(endTurn.ok).toBe(false);
  });
});

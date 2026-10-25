import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../../../core/applyCommand';
import { createDefaultEngineContext } from '../../../../core/session';
import { buildGameConfigFromPreset } from '../../../../core/presets';
import {
  evaluatePosition,
  extractPositionFeatures,
  getDifficultyPolicy,
  snapshotTrophyThreat,
  scoreRobberTile,
  playersTouchingTile,
} from '../../shared';
import { autoCompleteClassicSetup } from '../../../../sim/prepareClassicSetup';

function makeClassicState(seed = 42) {
  const ctx = createDefaultEngineContext(seed);
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: seed,
    playerCount: 3,
    maxTurns: 80,
    classicBoardLayout: 'fixed',
  });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'hard' },
        { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'hard' },
        { name: 'C', civilization: 'empire', type: 'ai', aiDifficulty: 'hard' },
      ],
    },
    ctx,
  );
  if (!created.ok) throw new Error('create failed');
  autoCompleteClassicSetup(created.state);
  return created.state;
}

describe('AI shared foundations', () => {
  it('difficulty policy: medium uses L1; legendary uses L2', () => {
    const medium = getDifficultyPolicy('medium');
    const hard = getDifficultyPolicy('hard');
    const legendary = getDifficultyPolicy('legendary');
    expect(medium.useTurnPlanner).toBe(true);
    expect(medium.plannerDepth).toBeGreaterThanOrEqual(3);
    expect(hard.useTurnPlanner).toBe(true);
    expect(hard.useBoundedSearch).toBe(false);
    expect(hard.plannerDepth).toBeGreaterThanOrEqual(5);
    expect(legendary.useBoundedSearch).toBe(true);
    expect(legendary.plannerDepth).toBeGreaterThan(hard.plannerDepth);
  });

  it('evaluatePosition is deterministic for a fixed state', () => {
    const state = makeClassicState(7);
    const playerId = state.turnOrder[0]!;
    const a = evaluatePosition(state, playerId);
    const b = evaluatePosition(state, playerId);
    expect(a).toBe(b);
    expect(Number.isFinite(a)).toBe(true);
  });

  it('extractPositionFeatures exposes vp, production, sevenRisk et roadNetwork', () => {
    const state = makeClassicState(11);
    const playerId = state.turnOrder[0]!;
    const f = extractPositionFeatures(state, playerId);
    expect(f.vp).toBeGreaterThanOrEqual(2);
    expect(f.production).toBeGreaterThan(0);
    expect(typeof f.sevenRisk).toBe('number');
    expect(typeof f.contested).toBe('number');
    expect(f.roadNetwork).toBeGreaterThanOrEqual(2);
    expect(f.undergroundSky).toBe(0);
  });

  it('trophy threat tracks victory target', () => {
    const state = makeClassicState(13);
    const playerId = state.turnOrder[0]!;
    const snap = snapshotTrophyThreat(state, playerId);
    expect(snap.victoryTarget).toBeGreaterThanOrEqual(10);
    expect(snap.vpGapToWin).toBe(snap.victoryTarget - snap.myVp);
  });

  it('robber scoring uses topological touchers', () => {
    const state = makeClassicState(17);
    const playerId = state.turnOrder[0]!;
    const board = state.classicBoard!;
    const someIid = Object.keys(board.occupiedIntersections)[0];
    expect(someIid).toBeTruthy();
    const tileId = board.topology.intersections[someIid!]!.tileIds.find((id) => {
      const t = state.map.get(id);
      return t && t.terrain !== 'desert' && t.terrain !== 'ocean';
    });
    expect(tileId).toBeTruthy();
    const touchers = playersTouchingTile(state, tileId!, playerId);
    const score = scoreRobberTile(state, playerId, tileId!);
    expect(Number.isFinite(score)).toBe(true);
    // If opponents touch it, score should not be the empty penalty
    if (touchers.length > 0) {
      expect(score).toBeGreaterThan(-50);
    }
  });
});

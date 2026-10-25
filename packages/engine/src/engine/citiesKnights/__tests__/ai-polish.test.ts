import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../../core/applyCommand';
import { createDefaultEngineContext } from '../../../core/session';
import { buildGameConfigFromPreset } from '../../../core/presets';
import { decideClassicAI } from '../../ai/classic/ClassicAI';
import { autoCompleteClassicSetup } from '../../../sim/prepareClassicSetup';
import { chooseProgressDiscardCardId, decidePlayProgressCard } from '../ai/progressPolicy';
import { decideCitiesKnightsPending } from '../CitiesKnightsAI';
import type { CkProgressCardType } from '../../../types/citiesKnights';
import type { GameState } from '../../../types/game';
import { CLASSIC_RESOURCE_TYPES } from '../../catan/ClassicBoard';

function makeCkState(seed = 99) {
  const ctx = createDefaultEngineContext(seed);
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: seed,
    playerCount: 3,
    maxTurns: 80,
    classicBoardLayout: 'fixed',
    extensions: {
      citiesKnights: {
        enabled: true,
        ruleset: 'catanx-essential-v1',
        victoryPointBonus: 3,
        adaptiveBarbarianTrack: true,
      },
    },
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
  return { state: created.state, ctx };
}

describe('AI polish regressions', () => {
  it('seven discard offers exact half of classic+commodity hand', () => {
    const { state } = makeCkState(101);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 4, clay: 2, wheat: 2, sheep: 0, ore: 0 };
    const ck = state.extensions!.citiesKnights!;
    ck.playerCommodities[playerId] = { ck_paper: 2 };
    state.turnPhase = 'discard_resources';
    state.sevenFlow = {
      playersToDiscard: [playerId],
      playersDiscarded: [],
      stealCandidates: [],
      robberTileId: state.robberPosition,
    };

    const decision = decideClassicAI(state, playerId, { difficulty: 'hard' });
    expect(decision?.kind).toBe('command');
    if (decision?.kind !== 'command' || decision.command.type !== 'discard_resources') {
      throw new Error('expected discard_resources');
    }
    const resCount = Object.values(decision.command.resources).reduce(
      (s, n) => s + (n ?? 0),
      0,
    );
    const commCount = Object.values(decision.command.commodities ?? {}).reduce(
      (s, n) => s + (n ?? 0),
      0,
    );
    // hand = 4+2+2+2 = 10 → discard 5
    expect(resCount + commCount).toBe(5);
  });

  it('spy targets via publicProgressCounts only', () => {
    const { state } = makeCkState(102);
    const playerId = state.turnOrder[0]!;
    const oppId = state.turnOrder[1]!;
    const ck = state.extensions!.citiesKnights!;
    ck.progressHands[playerId] = [
      { id: 'spy1', type: 'spy' as CkProgressCardType, deck: 'politics' },
    ];
    ck.progressHands[oppId] = [];
    ck.publicProgressCounts[oppId] = 2;
    ck.publicProgressCounts[playerId] = 1;
    state.turnPhase = 'player_action';
    state.currentPlayerIndex = state.turnOrder.indexOf(playerId);

    const decision = decidePlayProgressCard(state, playerId);
    expect(decision?.command.type).toBe('ck_play_progress');
    if (decision?.command.type === 'ck_play_progress') {
      expect(decision.command.targetPlayerId).toBe(oppId);
    }
  });

  it('aqueduct pending returns null when bank is empty (no state mutation)', () => {
    const { state } = makeCkState(103);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    ck.pendingResolutions = [
      { id: 'aq1', kind: 'aqueduct', playerId, data: { turn: 1 } },
    ];
    if (state.bank) {
      for (const r of CLASSIC_RESOURCE_TYPES) {
        state.bank[r] = 0;
      }
    }
    const before = ck.pendingResolutions.length;
    const decision = decideCitiesKnightsPending(state, playerId);
    expect(decision).toBeNull();
    expect(ck.pendingResolutions.length).toBe(before);
  });

  it('discard progress prefers lowest-value card', () => {
    const state = {
      extensions: {
        citiesKnights: {
          progressHands: {
            p1: [
              { id: 'a', type: 'merchant' as CkProgressCardType },
              { id: 'b', type: 'crane' as CkProgressCardType },
            ],
          },
        },
      },
    } as unknown as GameState;
    expect(chooseProgressDiscardCardId(state, 'p1')).toBe('b');
  });
});

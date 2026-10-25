import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../../../core/applyCommand';
import { createDefaultEngineContext } from '../../../../core/session';
import { buildGameConfigFromPreset } from '../../../../core/presets';
import { autoCompleteClassicSetup } from '../../../../sim/prepareClassicSetup';
import { projectHorizon, expectedProductionPerTurn } from '../HorizonPlan';
import { victoryRaceBuildBonus } from '../VictoryRace';
import { CLASSIC_RESOURCE_TYPES } from '../../../catan/ClassicBoard';

function makePlayingState(seed = 42) {
  const ctx = createDefaultEngineContext(seed);
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: seed,
    playerCount: 2,
    classicBoardLayout: 'fixed',
  });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
        { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
      ],
    },
    ctx,
  );
  if (!created.ok) throw new Error('create failed');
  autoCompleteClassicSetup(created.state);
  created.state.phase = 'playing';
  created.state.turnPhase = 'player_action';
  return created.state;
}

describe('HorizonPlan', () => {
  it('projette une production attendue non nulle après setup', () => {
    const state = makePlayingState(19);
    const playerId = state.turnOrder[0]!;
    const perTurn = expectedProductionPerTurn(state, playerId);
    let sum = 0;
    for (const r of CLASSIC_RESOURCE_TYPES) sum += perTurn[r] ?? 0;
    expect(sum).toBeGreaterThan(0);
  });

  it('projectHorizon renvoie un focus et un horizon cohérents', () => {
    const state = makePlayingState(27);
    const playerId = state.turnOrder[0]!;
    const h = projectHorizon(state, playerId, 3);
    expect(h.horizonTurns).toBe(3);
    expect(h.focus).toBeTruthy();
    expect(typeof h.rationale).toBe('string');
  });

  it('victoryRaceBuildBonus favorise la ville en fin de course', () => {
    const state = makePlayingState(31);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.stats.victoryPoints = 9;
    const h = projectHorizon(state, playerId, 3);
    h.focus = 'city';
    const cityBonus = victoryRaceBuildBonus(state, playerId, 'city', h);
    const roadBonus = victoryRaceBuildBonus(state, playerId, 'road', h);
    expect(cityBonus).toBeGreaterThan(roadBonus);
  });
});

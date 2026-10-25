import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../../../core/applyCommand';
import { createDefaultEngineContext } from '../../../../core/session';
import { buildGameConfigFromPreset } from '../../../../core/presets';
import { autoCompleteClassicSetup } from '../../../../sim/prepareClassicSetup';
import {
  computeExpansionPlan,
  roadPlanBonus,
  shortestBuildPathTo,
  playerNetworkIntersections,
} from '../ExpansionPlan';
import { listClassicRoadCandidates } from '../../../catan/ClassicCommands';

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
        { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'hard' },
        { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'hard' },
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

describe('ExpansionPlan', () => {
  it('calcule un réseau non vide après setup', () => {
    const state = makePlayingState(21);
    const playerId = state.turnOrder[0]!;
    const net = playerNetworkIntersections(state, playerId);
    expect(net.size).toBeGreaterThan(0);
  });

  it('pénalise une route hors chemin vs la prochaine étape du plan', () => {
    const state = makePlayingState(33);
    const playerId = state.turnOrder[0]!;
    const plan = computeExpansionPlan(state, playerId);
    expect(plan.targetIntersectionId).toBeTruthy();

    const roads = listClassicRoadCandidates(state, playerId);
    expect(roads.length).toBeGreaterThan(0);

    if (plan.nextEdgeId) {
      const onPath = roadPlanBonus(state, playerId, plan.nextEdgeId, plan);
      const off = roads.find((r) => r.edgeId !== plan.nextEdgeId);
      if (off) {
        const offBonus = roadPlanBonus(state, playerId, off.edgeId, plan);
        expect(onPath).toBeGreaterThan(offBonus);
      }
    }
  });

  it('shortestBuildPathTo renvoie [] si la cible est déjà sur le réseau', () => {
    const state = makePlayingState(44);
    const playerId = state.turnOrder[0]!;
    const net = [...playerNetworkIntersections(state, playerId)];
    const path = shortestBuildPathTo(state, playerId, net[0]!);
    expect(path).toEqual([]);
  });

  it('ne planifie pas d’expansion sans stock de villages', () => {
    const state = makePlayingState(66);
    const playerId = state.turnOrder[0]!;
    const stock = state.classicBoard!.piecesRemaining[playerId]!;
    stock.settlements = 0;
    const plan = computeExpansionPlan(state, playerId);
    expect(plan.targetIntersectionId).toBeNull();
  });

  it('focusSettlement quand le chemin est court', () => {
    const state = makePlayingState(55);
    const playerId = state.turnOrder[0]!;
    const plan = computeExpansionPlan(state, playerId);
    if (plan.pathLength <= 2 && plan.targetIntersectionId) {
      expect(plan.focusSettlement).toBe(true);
    }
  });

  it('ne met pas focusSettlement si le chemin est long', () => {
    const state = makePlayingState(77);
    const playerId = state.turnOrder[0]!;
    // Forcer un plan avec chemin long via ressources abondantes / réseau
    const plan = computeExpansionPlan(state, playerId);
    if (plan.pathLength > 2) {
      expect(plan.focusSettlement).toBe(false);
    }
  });

  it('conserve la cible sticky entre deux appels', () => {
    const state = makePlayingState(88);
    const playerId = state.turnOrder[0]!;
    const first = computeExpansionPlan(state, playerId);
    expect(first.targetIntersectionId).toBeTruthy();
    const second = computeExpansionPlan(state, playerId);
    expect(second.targetIntersectionId).toBe(first.targetIntersectionId);
  });
});

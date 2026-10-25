import type { GameCommand } from '@catanx/protocol';
import type { BuildingId } from '../../types/buildings';
import type { GameState } from '../../types/game';
import type { AIDifficulty } from '../../types/player';
import {
  applyClassicBuildDecision,
  chooseClassicRecoveryCommand,
  decideClassicAI,
} from './classic/ClassicAI';
import { decideCitiesKnightsPending } from '../citiesKnights/CitiesKnightsAI';

function activePlayerId(state: GameState): string | null {
  if (state.phase === 'setup') {
    return state.setupPlayerOrder[state.setupPlacementIndex] ?? null;
  }
  return state.turnOrder[state.currentPlayerIndex] ?? null;
}

function difficultyOf(state: GameState, playerId: string): AIDifficulty {
  return state.players.get(playerId)?.aiDifficulty ?? 'medium';
}

function isAi(state: GameState, playerId: string): boolean {
  return state.players.get(playerId)?.type === 'ai';
}

export type AIStepAction =
  | { kind: 'command'; command: GameCommand }
  | { kind: 'build'; playerId: string; tileId: string; buildingId: BuildingId };

/**
 * Prochaine action IA pour un état autoritaire (serveur / headless).
 * Retourne `null` si aucun siège IA n’a besoin d’agir (tour humain, partie finie…).
 */
export function pickNextAIStep(state: GameState): AIStepAction | null {
  if (state.phase === 'finished') return null;

  const ck = state.extensions?.citiesKnights;
  if (ck?.pendingResolutions.length) {
    for (const pending of ck.pendingResolutions) {
      if (!isAi(state, pending.playerId)) continue;
      const decision = decideCitiesKnightsPending(state, pending.playerId);
      if (decision?.kind === 'command') return decision;
      const classic = decideClassicAI(state, pending.playerId, {
        difficulty: difficultyOf(state, pending.playerId),
      });
      if (classic?.kind === 'command') return classic;
      const recovery = chooseClassicRecoveryCommand(state, pending.playerId, {
        difficulty: difficultyOf(state, pending.playerId),
      });
      if (recovery) return { kind: 'command', command: recovery };
    }
  }

  const trade = state.pendingPlayerTrade;
  if (trade) {
    const rejected = new Set(trade.rejectedBy ?? []);
    const responders =
      trade.toPlayerId === null
        ? state.turnOrder.filter((id) => {
            if (id === trade.fromPlayerId || rejected.has(id)) return false;
            const p = state.players.get(id);
            return Boolean(p && !p.isEliminated);
          })
        : [trade.toPlayerId];

    const nextAi = responders.find((id) => isAi(state, id));
    if (nextAi) {
      const decision = decideClassicAI(state, nextAi, {
        difficulty: difficultyOf(state, nextAi),
      });
      if (decision?.kind === 'command') return decision;
      return {
        kind: 'command',
        command: {
          type: 'reject_player_trade',
          playerId: nextAi,
          tradeId: trade.id,
        },
      };
    }
    // Offre en attente d’un humain : l’IA active ne doit pas avancer.
    if (responders.length > 0 || isAi(state, trade.fromPlayerId)) return null;
  }

  if (state.turnPhase === 'discard_resources' && state.sevenFlow) {
    const nextToDiscard = state.sevenFlow.playersToDiscard.find(
      (playerId) => !state.sevenFlow!.playersDiscarded.includes(playerId),
    );
    if (nextToDiscard) {
      if (!isAi(state, nextToDiscard)) return null;
      const decision = decideClassicAI(state, nextToDiscard, {
        difficulty: difficultyOf(state, nextToDiscard),
      });
      if (decision?.kind === 'command') return decision;
      const recovery = chooseClassicRecoveryCommand(state, nextToDiscard, {
        difficulty: difficultyOf(state, nextToDiscard),
      });
      if (recovery) return { kind: 'command', command: recovery };
      return null;
    }
  }

  const playerId = activePlayerId(state);
  if (!playerId || !isAi(state, playerId)) return null;

  const opts = { difficulty: difficultyOf(state, playerId) } as const;
  const decision = decideClassicAI(state, playerId, opts);

  if (!decision) {
    const recovery = chooseClassicRecoveryCommand(state, playerId, opts);
    if (recovery) return { kind: 'command', command: recovery };
    if (state.turnPhase === 'player_action') {
      return { kind: 'command', command: { type: 'end_turn', playerId } };
    }
    return null;
  }

  if (decision.kind === 'build') {
    return {
      kind: 'build',
      playerId,
      tileId: decision.tileId,
      buildingId: decision.buildingId,
    };
  }

  if (decision.kind === 'setup_intersection' || decision.kind === 'setup_road') {
    const recovery = chooseClassicRecoveryCommand(state, playerId, opts);
    return recovery ? { kind: 'command', command: recovery } : null;
  }

  return { kind: 'command', command: decision.command };
}

/** Applique un step `build` (placement tuile hors topologie) directement sur l’état. */
export function applyAIBuildStep(
  state: GameState,
  step: Extract<AIStepAction, { kind: 'build' }>,
): boolean {
  return applyClassicBuildDecision(state, step.playerId, step.tileId, step.buildingId).success;
}

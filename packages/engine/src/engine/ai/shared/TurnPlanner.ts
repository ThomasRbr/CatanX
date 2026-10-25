import type { GameCommand } from '@catanx/protocol';
import type { GameState } from '../../../types/game';
import type { AIDifficulty, AIPersonality } from '../../../types/player';
import { applyCommand } from '../../../core/applyCommand';
import { createDefaultEngineContext } from '../../../core/session';
import { evaluatePosition } from './PositionEvaluator';
import { listLegalScoredActions, type ScoredAction } from './CandidateGen';
import { getDifficultyPolicy } from './DifficultyPolicy';

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}

function tryApply(state: GameState, command: GameCommand, seed: number): GameState | null {
  const ctx = createDefaultEngineContext(seed);
  const result = applyCommand(state, command, ctx);
  return result.ok ? result.state : null;
}

export interface TurnPlanResult {
  command: GameCommand;
  sequenceScore: number;
  depth: number;
  label: string;
}

/**
 * L1 beam search over short action sequences within the current turn.
 * Returns the first command of the best sequence (caller re-invokes AI each step).
 */
export function planTurnAction(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty,
  personality?: AIPersonality | null,
): TurnPlanResult | null {
  const policy = getDifficultyPolicy(difficulty);
  if (!policy.useTurnPlanner || state.turnPhase !== 'player_action') return null;

  const depth = policy.plannerDepth;
  const beam = policy.plannerBeam;
  if (depth <= 0) return null;

  type Node = {
    state: GameState;
    first: GameCommand | null;
    firstLabel: string;
    score: number;
    steps: number;
  };

  let frontier: Node[] = [
    {
      state: cloneGameState(state),
      first: null,
      firstLabel: '',
      score: evaluatePosition(state, playerId, { personality }),
      steps: 0,
    },
  ];

  let best: TurnPlanResult | null = null;

  for (let d = 0; d < depth; d++) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (node.state.turnPhase !== 'player_action') {
        const finalScore = evaluatePosition(node.state, playerId, { personality }) + node.steps;
        if (node.first && (!best || finalScore > best.sequenceScore)) {
          best = {
            command: node.first,
            sequenceScore: finalScore,
            depth: node.steps,
            label: node.firstLabel,
          };
        }
        continue;
      }

      const actions = listLegalScoredActions(node.state, playerId, difficulty)
        // Limiter le fan-out extensions pour rester dans le budget client
        .filter((a, i, arr) => {
          if (!a.label.startsWith('us:') && !a.label.startsWith('ck:')) return true;
          const extCount = arr
            .slice(0, i)
            .filter((x) => x.label.startsWith('us:') || x.label.startsWith('ck:')).length;
          return extCount < Math.max(2, Math.floor(beam / 2));
        })
        .slice(0, beam);
      for (const action of actions) {
        const applied = tryApply(cloneGameState(node.state), action.command, 9000 + d * 17 + next.length);
        if (!applied) continue;
        const builtBonus =
          action.command.type === 'build_settlement' ||
          action.command.type === 'upgrade_city' ||
          action.command.type === 'build_road'
            ? 8
            : action.command.type.startsWith('us_') || action.command.type.startsWith('ck_')
              ? 5
              : action.command.type === 'end_turn'
                ? 0
                : 2;
        const score =
          evaluatePosition(applied, playerId, { personality }) + builtBonus + node.steps * 0.1;
        const first = node.first ?? action.command;
        const firstLabel = node.firstLabel || action.label;
        next.push({
          state: applied,
          first,
          firstLabel,
          score,
          steps: node.steps + 1,
        });

        if (action.command.type === 'end_turn') {
          if (!best || score > best.sequenceScore) {
            best = {
              command: first,
              sequenceScore: score,
              depth: node.steps + 1,
              label: firstLabel,
            };
          }
        }
      }
    }

    next.sort((a, b) => b.score - a.score);
    frontier = next.slice(0, beam);
    for (const node of frontier) {
      if (node.first && (!best || node.score > best.sequenceScore)) {
        best = {
          command: node.first,
          sequenceScore: node.score,
          depth: node.steps,
          label: node.firstLabel,
        };
      }
    }
    if (frontier.length === 0) break;
  }

  return best;
}

/** Quick 1-step greedy among scored actions (fallback). */
export function pickBestImmediateAction(
  state: GameState,
  playerId: string,
): ScoredAction | null {
  const actions = listLegalScoredActions(state, playerId);
  return actions[0] ?? null;
}

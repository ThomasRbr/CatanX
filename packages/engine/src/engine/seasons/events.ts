/**
 * File d’événements saisonniers émis pendant une mutation moteur,
 * drainée par applyCommand (évite de casser les signatures processTurn/rollDice).
 */
import type { GameState } from '../../types/game';

export type SeasonEmittedEvent = {
  type: string;
  payload: Record<string, unknown>;
};

const queues = new WeakMap<GameState, SeasonEmittedEvent[]>();

export function queueSeasonEvents(
  state: GameState,
  events: readonly SeasonEmittedEvent[],
): void {
  if (events.length === 0) return;
  const existing = queues.get(state) ?? [];
  queues.set(state, [...existing, ...events]);
}

export function drainSeasonEvents(state: GameState): SeasonEmittedEvent[] {
  const events = queues.get(state) ?? [];
  queues.delete(state);
  return events;
}

/** Caravane / Mobilisation : auto-consommer si l'engagement est encore disponible. */
export function shouldAutoUseSeasonPreparation(
  state: GameState,
  playerId: string,
  kind: 'commerce' | 'works',
): boolean {
  const seasons = state.extensions?.seasons;
  if (!seasons) return false;
  if (seasons.preparations[playerId] !== kind) return false;
  const uses = seasons.preparationUses[playerId];
  if (!uses) return false;
  return kind === 'commerce' ? !uses.commerceUsed : !uses.worksUsed;
}

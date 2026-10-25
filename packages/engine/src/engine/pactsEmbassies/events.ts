/**
 * File d’événements Pactes & Ambassades.
 */
import type { GameState } from '../../types/game';

export type PactsEmbassiesEmittedEvent = {
  type: string;
  payload: Record<string, unknown>;
};

const queues = new WeakMap<GameState, PactsEmbassiesEmittedEvent[]>();

export function queuePeEvents(
  state: GameState,
  events: readonly PactsEmbassiesEmittedEvent[],
): void {
  if (events.length === 0) return;
  const existing = queues.get(state) ?? [];
  queues.set(state, [...existing, ...events]);
}

export function drainPactsEmbassiesEvents(
  state: GameState,
): PactsEmbassiesEmittedEvent[] {
  const events = queues.get(state) ?? [];
  queues.delete(state);
  return events;
}

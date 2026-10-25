/**
 * File d’événements Souterrain & Ciel émis pendant une mutation moteur.
 */
import type { GameState } from '../../types/game';

export type UndergroundSkyEmittedEvent = {
  type: string;
  payload: Record<string, unknown>;
};

const queues = new WeakMap<GameState, UndergroundSkyEmittedEvent[]>();

export function queueUndergroundSkyEvents(
  state: GameState,
  events: readonly UndergroundSkyEmittedEvent[],
): void {
  if (events.length === 0) return;
  const existing = queues.get(state) ?? [];
  queues.set(state, [...existing, ...events]);
}

export function drainUndergroundSkyEvents(
  state: GameState,
): UndergroundSkyEmittedEvent[] {
  const events = queues.get(state) ?? [];
  queues.delete(state);
  return events;
}

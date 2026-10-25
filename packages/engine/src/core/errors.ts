export interface GameError {
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CommandEmittedEvent {
  type: string;
  payload: Record<string, unknown>;
  turn?: number;
  playerId?: string;
}

export type CommandResult =
  | { ok: true; state: import('../types/game').GameState; events: CommandEmittedEvent[] }
  | { ok: false; error: GameError };

export function commandError(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): CommandResult {
  return { ok: false, error: { code, message, data } };
}

export function commandSuccess(
  state: import('../types/game').GameState,
  events: CommandEmittedEvent[] = [],
): CommandResult {
  return { ok: true, state, events };
}

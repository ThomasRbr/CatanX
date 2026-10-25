import type { GameCommand } from '@catanx/protocol';
import {
  applyCommand,
  createDefaultEngineContext,
  createSnapshot,
  dispatchCommand,
  EngineContext,
  migrateLegacySave,
  snapshotFromJSON,
  snapshotToGameState,
  snapshotToJSON,
} from '@catanx/engine';
import { isRemoteSession, submitRemoteCommand } from '../network/remoteSession';

export class ClientEngineSession {
  private context: EngineContext;
  private commandLog: GameCommand[] = [];

  constructor(seed: number) {
    this.context = createDefaultEngineContext(seed);
  }

  getContext(): EngineContext {
    return this.context;
  }

  getCommandLog(): GameCommand[] {
    return [...this.commandLog];
  }

  setCommandLog(commands: GameCommand[]): void {
    this.commandLog = [...commands];
  }

  reset(seed: number): void {
    this.context = createDefaultEngineContext(seed);
    this.commandLog = [];
  }

  dispatch(state: import('@catanx/engine').GameState | null, command: GameCommand) {
    if (isRemoteSession()) {
      const remote = submitRemoteCommand(command);
      if (!remote.ok) {
        return {
          ok: false as const,
          error: {
            code: 'remote_rejected',
            message: remote.reason ?? 'Commande rejetée par le serveur.',
          },
          command,
        };
      }
      // L'état autoritatif arrivera via state_sync.
      return {
        ok: true as const,
        state: state!,
        events: [],
        command,
      };
    }

    const result = dispatchCommand(state, command, this.context);
    if (result.ok) {
      this.commandLog.push(command);
    }
    return result;
  }

  save(state: import('@catanx/engine').GameState): string {
    return snapshotToJSON(createSnapshot(state, this.commandLog, state.config.mapSeed));
  }

  load(raw: string): { state: import('@catanx/engine').GameState; commandLog: GameCommand[] } {
    try {
      const snapshot = snapshotFromJSON(raw);
      const seed = snapshot.randomSeed ?? snapshot.config?.mapSeed ?? 0;
      this.reset(seed);
      this.commandLog = [...(snapshot.commandLog ?? [])];
      return {
        state: snapshotToGameState(snapshot),
        commandLog: this.commandLog,
      };
    } catch {
      const migrated = migrateLegacySave(raw);
      const seed = migrated.randomSeed ?? migrated.config?.mapSeed ?? 0;
      this.reset(seed);
      this.commandLog = migrated.commandLog ?? [];
      return {
        state: snapshotToGameState(migrated),
        commandLog: this.commandLog,
      };
    }
  }
}

export function loadGameStateFromStorage(raw: string): import('@catanx/engine').GameState | null {
  try {
    const session = new ClientEngineSession(0);
    return session.load(raw).state;
  } catch {
    return null;
  }
}

export { applyCommand };

import type { GameRoom } from './RoomManager';

/** Délai entre deux actions IA visibles (ms). */
export const SERVER_AI_STEP_MS = 900;

/** Après N échecs consécutifs, on arrête la boucle pour éviter un spin. */
export const SERVER_AI_MAX_FAILS = 8;

export type AISyncCallback = (room: GameRoom) => void;

/**
 * Planifie la boucle IA serveur tant qu’un siège IA doit agir.
 * Chaque step réussi déclenche un `state_sync` via `onSync`.
 */
export function scheduleRoomAI(room: GameRoom, onSync: AISyncCallback): void {
  if (!room.needsAIStep()) return;
  if (room.aiFailCount() >= SERVER_AI_MAX_FAILS) {
    console.warn(
      `[CatanX Server] Boucle IA stoppée (${SERVER_AI_MAX_FAILS} échecs) salon ${room.id}`,
    );
    return;
  }

  room.scheduleAI(SERVER_AI_STEP_MS, (active) => {
    const result = active.applyServerAIStep();
    const acted = Boolean(result.ok && 'acted' in result && result.acted);
    active.noteAIStepResult(acted);
    if (acted) {
      onSync(active);
    }
    if (active.needsAIStep() && active.aiFailCount() < SERVER_AI_MAX_FAILS) {
      scheduleRoomAI(active, onSync);
    }
  });
}

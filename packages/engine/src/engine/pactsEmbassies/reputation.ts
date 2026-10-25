/**
 * Réputation diplomatique (0–6).
 */

import type { PactsEmbassiesState } from '../../types/pactsEmbassies';
import { PE_REPUTATION_MAX, maxClausesForReputation } from '../../types/pactsEmbassies';

export function getReputation(pe: PactsEmbassiesState, playerId: string): number {
  return pe.players[playerId]?.reputation ?? 3;
}

export function addReputation(
  pe: PactsEmbassiesState,
  playerId: string,
  delta: number,
): number {
  const p = pe.players[playerId];
  if (!p || delta === 0) return p?.reputation ?? 3;
  p.reputation = Math.max(0, Math.min(PE_REPUTATION_MAX, p.reputation + delta));
  return p.reputation;
}

export function clauseLimitForPlayer(
  pe: PactsEmbassiesState,
  playerId: string,
): number {
  return maxClausesForReputation(getReputation(pe, playerId));
}

export function canClaimAdvancedMandate(
  pe: PactsEmbassiesState,
  playerId: string,
): boolean {
  return getReputation(pe, playerId) >= 5;
}

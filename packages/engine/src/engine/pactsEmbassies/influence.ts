/**
 * Influence diplomatique (0–12) — distincte de ResourceType influence.
 */

import type { PactsEmbassiesState } from '../../types/pactsEmbassies';
import { PE_INFLUENCE_MAX } from '../../types/pactsEmbassies';

export function getInfluence(pe: PactsEmbassiesState, playerId: string): number {
  return pe.players[playerId]?.influence ?? 0;
}

export function addInfluence(
  pe: PactsEmbassiesState,
  playerId: string,
  amount: number,
): number {
  const p = pe.players[playerId];
  if (!p || amount === 0) return p?.influence ?? 0;
  p.influence = Math.max(0, Math.min(PE_INFLUENCE_MAX, p.influence + amount));
  return p.influence;
}

export function spendInfluence(
  pe: PactsEmbassiesState,
  playerId: string,
  amount: number,
): boolean {
  const p = pe.players[playerId];
  if (!p || p.influence < amount) return false;
  p.influence -= amount;
  return true;
}

export function canSpendInfluence(
  pe: PactsEmbassiesState,
  playerId: string,
  amount: number,
): boolean {
  return getInfluence(pe, playerId) >= amount;
}

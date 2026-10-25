/**
 * Helpers de clauses actives (hooks commerce / routes / US).
 */

import type { GameState } from '../../types/game';
import type { PactClauseKind, PePact } from '../../types/pactsEmbassies';
import { getPe } from './state';
import { findActivePactWithClause, markClauseUsed } from './pacts';
import { addInfluence } from './influence';

export function getActivePactClause(
  state: GameState,
  playerId: string,
  clause: PactClauseKind,
  partnerId?: string | null,
): PePact | null {
  const pe = getPe(state);
  if (!pe) return null;
  return findActivePactWithClause(pe, playerId, partnerId ?? null, clause) ?? null;
}

export function listPartnersWithClause(
  state: GameState,
  playerId: string,
  clause: PactClauseKind,
): string[] {
  const pe = getPe(state);
  if (!pe) return [];
  const partners: string[] = [];
  for (const p of pe.pacts) {
    if (p.status !== 'active') continue;
    if (!p.clauses.includes(clause)) continue;
    if (p.partnerA === playerId) partners.push(p.partnerB);
    else if (p.partnerB === playerId) partners.push(p.partnerA);
  }
  return partners;
}

/** Accord commercial : +1 Influence aux deux sur premier échange valide de la ronde. */
export function onValidPlayerTrade(
  state: GameState,
  playerA: string,
  playerB: string,
  pactId?: string,
): void {
  const pe = getPe(state);
  if (!pe) return;

  let pact = pactId
    ? pe.pacts.find((p) => p.id === pactId && p.status === 'active')
    : findActivePactWithClause(pe, playerA, playerB, 'trade_accord');

  if (!pact || !pact.clauses.includes('trade_accord')) return;

  const keyA = `${playerA}`;
  const keyB = `${playerB}`;
  if (pe.roundUsage.firstValidPlayerTrade[keyA] && pe.roundUsage.firstValidPlayerTrade[keyB]) {
    return;
  }

  // Premier échange P2P de la ronde pour chaque joueur
  const grantA = !pe.roundUsage.firstValidPlayerTrade[keyA];
  const grantB = !pe.roundUsage.firstValidPlayerTrade[keyB];
  if (grantA) {
    pe.roundUsage.firstValidPlayerTrade[keyA] = true;
    addInfluence(pe, playerA, 1);
  }
  if (grantB) {
    pe.roundUsage.firstValidPlayerTrade[keyB] = true;
    addInfluence(pe, playerB, 1);
  }

  // Bonus clause : +1 aux deux si accord commercial
  const pairKey = [playerA, playerB].sort().join(':');
  if (!pe.roundUsage.playerTradeBonusUsed[pairKey]) {
    pe.roundUsage.playerTradeBonusUsed[pairKey] = true;
    addInfluence(pe, playerA, 1);
    addInfluence(pe, playerB, 1);
    markClauseUsed(pe, pact.id, playerA);
    markClauseUsed(pe, pact.id, playerB);
  }
}

/** Charte portuaire : usage port générique 3:1 allié, 1×/ronde. */
export function tryUsePortCharter(
  state: GameState,
  playerId: string,
  allyOwnerId: string,
): boolean {
  const pe = getPe(state);
  if (!pe) return false;
  const pact = findActivePactWithClause(pe, playerId, allyOwnerId, 'port_charter');
  if (!pact) return false;
  if (pe.roundUsage.portCharterUsed[playerId]) return false;
  pe.roundUsage.portCharterUsed[playerId] = true;
  markClauseUsed(pe, pact.id, playerId);
  if (!pe.roundUsage.alliedInfraInfluenceGained[allyOwnerId]) {
    pe.roundUsage.alliedInfraInfluenceGained[allyOwnerId] = true;
    addInfluence(pe, allyOwnerId, 1);
  }
  return true;
}

/** Aperçu : ratio 3 si charte disponible (sans consommer). */
export function peekPortCharterAlly(
  state: GameState,
  playerId: string,
): string | null {
  const pe = getPe(state);
  if (!pe) return null;
  if (pe.roundUsage.portCharterUsed[playerId]) return null;
  const partners = listPartnersWithClause(state, playerId, 'port_charter');
  for (const allyId of partners) {
    const ally = state.players.get(allyId);
    if (!ally) continue;
    if (allyHasGenericPort(ally, state)) return allyId;
  }
  return null;
}

function allyHasGenericPort(
  ally: import('../../types/player').Player,
  state: GameState,
): boolean {
  for (const entry of ally.ports) {
    if (entry === 'generic_3:1') return true;
    const tile = state.map.get(entry);
    if (tile?.port === 'generic_3:1') return true;
  }
  return false;
}

/** Après un échange banque à 3:1 obtenu via charte, consomme l’usage. */
export function consumePortCharterIfNeeded(
  state: GameState,
  playerId: string,
  ratioUsed: number,
  ownBestRatio: number,
): void {
  if (ratioUsed > 3) return;
  if (ownBestRatio <= 3) return; // déjà couvert par ports propres / résolutions
  const allyId = peekPortCharterAlly(state, playerId);
  if (!allyId) return;
  tryUsePortCharter(state, playerId, allyId);
}

/** Réserve commune : +1 seuil de main. */
export function sharedReserveHandBonus(state: GameState, playerId: string): number {
  const pe = getPe(state);
  if (!pe) return 0;
  const has = pe.pacts.some(
    (p) =>
      p.status === 'active' &&
      p.clauses.includes('shared_reserve') &&
      (p.partnerA === playerId || p.partnerB === playerId),
  );
  return has ? 1 : 0;
}

/** Frontières ouvertes : partenaires permettant de traverser. */
export function openBordersPartners(state: GameState, playerId: string): string[] {
  return listPartnersWithClause(state, playerId, 'open_borders');
}

export function undergroundPassagePartners(state: GameState, playerId: string): string[] {
  return listPartnersWithClause(state, playerId, 'underground_passage');
}

export function tradeWindsPartners(state: GameState, playerId: string): string[] {
  return listPartnersWithClause(state, playerId, 'trade_winds');
}

export function noteAlliedInfraUse(
  state: GameState,
  userId: string,
  ownerId: string,
  clause: PactClauseKind,
): void {
  const pe = getPe(state);
  if (!pe) return;
  const pact = findActivePactWithClause(pe, userId, ownerId, clause);
  if (!pact) return;
  markClauseUsed(pe, pact.id, userId);
  if (!pe.roundUsage.alliedInfraInfluenceGained[ownerId]) {
    pe.roundUsage.alliedInfraInfluenceGained[ownerId] = true;
    addInfluence(pe, ownerId, 1);
  }
}

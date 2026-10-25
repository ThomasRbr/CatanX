/**
 * Cycle de vie des pactes (offres, acceptation, rupture, dissolution).
 */

import type { GameState } from '../../types/game';
import type {
  PactClauseKind,
  PactsEmbassiesState,
  PePact,
  PePactOffer,
} from '../../types/pactsEmbassies';
import {
  PE_OFFER_DURATION_ROUNDS,
  PE_PACT_DURATION_ROUNDS,
} from '../../types/pactsEmbassies';
import { nextId } from '../../core/ids';
import { addInfluence, canSpendInfluence, spendInfluence } from './influence';
import { addReputation, clauseLimitForPlayer } from './reputation';
import { assignConsulate, clearConsulatesForPact, getPactCapacity } from './embassies';
import { queuePeEvents } from './events';
import { markDormantForPact } from './dormantNetworks';

const VALID_CLAUSES: ReadonlySet<PactClauseKind> = new Set([
  'trade_accord',
  'port_charter',
  'open_borders',
  'shared_reserve',
  'underground_passage',
  'trade_winds',
]);

export function findActivePactBetween(
  pe: PactsEmbassiesState,
  a: string,
  b: string,
): PePact | undefined {
  return pe.pacts.find(
    (p) =>
      p.status === 'active' &&
      ((p.partnerA === a && p.partnerB === b) || (p.partnerA === b && p.partnerB === a)),
  );
}

export function activePactsForPlayer(
  pe: PactsEmbassiesState,
  playerId: string,
): PePact[] {
  return pe.pacts.filter(
    (p) =>
      p.status === 'active' &&
      (p.partnerA === playerId || p.partnerB === playerId),
  );
}

export function validateClauses(
  pe: PactsEmbassiesState,
  playerId: string,
  partnerId: string,
  clauses: PactClauseKind[],
): { ok: true } | { ok: false; reason: string } {
  if (clauses.length < 1 || clauses.length > 2) {
    return { ok: false, reason: 'Un pacte a une ou deux clauses.' };
  }
  for (const c of clauses) {
    if (!VALID_CLAUSES.has(c)) return { ok: false, reason: `Clause inconnue : ${c}` };
  }
  const limA = clauseLimitForPlayer(pe, playerId);
  const limB = clauseLimitForPlayer(pe, partnerId);
  const maxClauses = Math.min(limA, limB);
  if (clauses.length > maxClauses) {
    return {
      ok: false,
      reason: `Réputation insuffisante : maximum ${maxClauses} clause(s).`,
    };
  }
  return { ok: true };
}

export function proposePact(
  state: GameState,
  pe: PactsEmbassiesState,
  fromPlayerId: string,
  toPlayerId: string,
  clauses: PactClauseKind[],
): { ok: true; offer: PePactOffer } | { ok: false; reason: string } {
  if (fromPlayerId === toPlayerId) {
    return { ok: false, reason: 'Impossible de proposer un pacte à soi-même.' };
  }
  if (!state.players.has(toPlayerId)) {
    return { ok: false, reason: 'Joueur inconnu.' };
  }
  if (findActivePactBetween(pe, fromPlayerId, toPlayerId)) {
    return { ok: false, reason: 'Un pacte existe déjà entre vous.' };
  }
  const cap = getPactCapacity(pe, fromPlayerId);
  if (activePactsForPlayer(pe, fromPlayerId).length >= cap.maxPacts) {
    return { ok: false, reason: 'Capacité de pactes atteinte.' };
  }
  const partnerCap = getPactCapacity(pe, toPlayerId);
  if (activePactsForPlayer(pe, toPlayerId).length >= partnerCap.maxPacts) {
    return { ok: false, reason: 'Le partenaire a atteint sa capacité de pactes.' };
  }
  const clauseCheck = validateClauses(pe, fromPlayerId, toPlayerId, clauses);
  if (!clauseCheck.ok) return clauseCheck;
  if (!canSpendInfluence(pe, fromPlayerId, 1)) {
    return { ok: false, reason: 'Influence insuffisante pour le dépôt (1).' };
  }

  spendInfluence(pe, fromPlayerId, 1);
  const offer: PePactOffer = {
    id: nextId('pe_offer'),
    fromPlayerId,
    toPlayerId,
    clauses: [...clauses],
    expiresAtRound: pe.globalRound + PE_OFFER_DURATION_ROUNDS,
    status: 'pending',
  };
  pe.pactOffers.push(offer);
  pe.pendingChoices.push({
    id: nextId('pe_pending'),
    kind: 'pact_offer',
    playerId: toPlayerId,
    expiresAtRound: offer.expiresAtRound,
    payload: { offerId: offer.id },
  });
  queuePeEvents(state, [
    {
      type: 'pe_pact_proposed',
      payload: { offerId: offer.id, fromPlayerId, toPlayerId, clauses },
    },
  ]);
  return { ok: true, offer };
}

export function counterPact(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  offerId: string,
  clauses: PactClauseKind[],
): { ok: true; offer: PePactOffer } | { ok: false; reason: string } {
  const offer = pe.pactOffers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'pending') {
    return { ok: false, reason: 'Offre introuvable.' };
  }
  if (offer.toPlayerId !== playerId) {
    return { ok: false, reason: 'Cette offre ne vous est pas destinée.' };
  }
  const clauseCheck = validateClauses(pe, playerId, offer.fromPlayerId, clauses);
  if (!clauseCheck.ok) return clauseCheck;
  if (!canSpendInfluence(pe, playerId, 1)) {
    return { ok: false, reason: 'Influence insuffisante pour le dépôt (1).' };
  }

  // Rembourser le déposant original et basculer
  addInfluence(pe, offer.fromPlayerId, 1);
  spendInfluence(pe, playerId, 1);
  offer.status = 'countered';

  const counter: PePactOffer = {
    id: nextId('pe_offer'),
    fromPlayerId: playerId,
    toPlayerId: offer.fromPlayerId,
    clauses: [...clauses],
    expiresAtRound: pe.globalRound + PE_OFFER_DURATION_ROUNDS,
    status: 'pending',
    parentOfferId: offer.id,
  };
  pe.pactOffers.push(counter);
  pe.pendingChoices = pe.pendingChoices.filter(
    (c) => !(c.kind === 'pact_offer' && c.payload.offerId === offerId),
  );
  pe.pendingChoices.push({
    id: nextId('pe_pending'),
    kind: 'pact_offer',
    playerId: counter.toPlayerId,
    expiresAtRound: counter.expiresAtRound,
    payload: { offerId: counter.id },
  });
  queuePeEvents(state, [
    {
      type: 'pe_pact_countered',
      payload: { offerId: counter.id, parentOfferId: offer.id, fromPlayerId: playerId },
    },
  ]);
  return { ok: true, offer: counter };
}

export function acceptPact(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  offerId: string,
): { ok: true; pact: PePact } | { ok: false; reason: string } {
  const offer = pe.pactOffers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'pending') {
    return { ok: false, reason: 'Offre introuvable.' };
  }
  if (offer.toPlayerId !== playerId) {
    return { ok: false, reason: 'Cette offre ne vous est pas destinée.' };
  }
  if (!canSpendInfluence(pe, playerId, 1)) {
    return { ok: false, reason: 'Influence insuffisante pour le dépôt (1).' };
  }
  if (findActivePactBetween(pe, offer.fromPlayerId, playerId)) {
    return { ok: false, reason: 'Un pacte existe déjà entre vous.' };
  }

  spendInfluence(pe, playerId, 1);
  offer.status = 'accepted';

  const pact: PePact = {
    id: nextId('pe_pact'),
    partnerA: offer.fromPlayerId,
    partnerB: playerId,
    clauses: [...offer.clauses],
    status: 'active',
    createdRound: pe.globalRound,
    expiresAtRound: pe.globalRound + PE_PACT_DURATION_ROUNDS,
    depositHeld: { [offer.fromPlayerId]: true, [playerId]: true },
    clauseUsedBy: {},
  };
  pe.pacts.push(pact);
  assignConsulate(pe, offer.fromPlayerId, pact.id);
  assignConsulate(pe, playerId, pact.id);

  pe.pendingChoices = pe.pendingChoices.filter(
    (c) => !(c.kind === 'pact_offer' && c.payload.offerId === offerId),
  );

  pe.history.push({
    turn: state.currentTurn,
    round: pe.globalRound,
    kind: 'pact_accepted',
    message: 'Pacte signé.',
    data: { pactId: pact.id, partners: [pact.partnerA, pact.partnerB] },
  });
  queuePeEvents(state, [
    {
      type: 'pe_pact_signed',
      payload: { pactId: pact.id, partnerA: pact.partnerA, partnerB: pact.partnerB },
    },
  ]);
  return { ok: true, pact };
}

export function rejectPact(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  offerId: string,
): { ok: true } | { ok: false; reason: string } {
  const offer = pe.pactOffers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'pending') {
    return { ok: false, reason: 'Offre introuvable.' };
  }
  if (offer.toPlayerId !== playerId) {
    return { ok: false, reason: 'Cette offre ne vous est pas destinée.' };
  }
  offer.status = 'rejected';
  addInfluence(pe, offer.fromPlayerId, 1);
  pe.pendingChoices = pe.pendingChoices.filter(
    (c) => !(c.kind === 'pact_offer' && c.payload.offerId === offerId),
  );
  queuePeEvents(state, [
    { type: 'pe_pact_rejected', payload: { offerId, playerId } },
  ]);
  return { ok: true };
}

export function breakPact(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  pactId: string,
): { ok: true } | { ok: false; reason: string } {
  const pact = pe.pacts.find((p) => p.id === pactId);
  if (!pact || pact.status !== 'active') {
    return { ok: false, reason: 'Pacte introuvable.' };
  }
  if (pact.partnerA !== playerId && pact.partnerB !== playerId) {
    return { ok: false, reason: 'Vous n’êtes pas partenaire de ce pacte.' };
  }
  const partner = pact.partnerA === playerId ? pact.partnerB : pact.partnerA;
  pact.status = 'broken';
  // Dépôt du responsable perdu ; partenaire remboursé +1 Influence
  pact.depositHeld[playerId] = false;
  if (pact.depositHeld[partner]) {
    addInfluence(pe, partner, 1);
    pact.depositHeld[partner] = false;
  }
  addInfluence(pe, partner, 1);
  addReputation(pe, playerId, -2);
  clearConsulatesForPact(pe, pactId);
  markDormantForPact(state, pe, pactId);
  queuePeEvents(state, [
    { type: 'pe_pact_broken', payload: { pactId, by: playerId, partner } },
  ]);
  return { ok: true };
}

export function proposeMutualDissolution(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  pactId: string,
): { ok: true } | { ok: false; reason: string } {
  const pact = pe.pacts.find((p) => p.id === pactId);
  if (!pact || pact.status !== 'active') {
    return { ok: false, reason: 'Pacte introuvable.' };
  }
  if (pact.partnerA !== playerId && pact.partnerB !== playerId) {
    return { ok: false, reason: 'Vous n’êtes pas partenaire de ce pacte.' };
  }
  pact.mutualDissolutionProposedBy = playerId;
  const partner = pact.partnerA === playerId ? pact.partnerB : pact.partnerA;
  pe.pendingChoices.push({
    id: nextId('pe_pending'),
    kind: 'mutual_dissolution',
    playerId: partner,
    expiresAtRound: pe.globalRound + PE_OFFER_DURATION_ROUNDS,
    payload: { pactId },
  });
  queuePeEvents(state, [
    { type: 'pe_mutual_dissolution_proposed', payload: { pactId, by: playerId } },
  ]);
  return { ok: true };
}

export function acceptMutualDissolution(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  pactId: string,
): { ok: true } | { ok: false; reason: string } {
  const pact = pe.pacts.find((p) => p.id === pactId);
  if (!pact || pact.status !== 'active') {
    return { ok: false, reason: 'Pacte introuvable.' };
  }
  if (pact.partnerA !== playerId && pact.partnerB !== playerId) {
    return { ok: false, reason: 'Vous n’êtes pas partenaire de ce pacte.' };
  }
  if (!pact.mutualDissolutionProposedBy || pact.mutualDissolutionProposedBy === playerId) {
    return { ok: false, reason: 'Aucune proposition de dissolution en attente.' };
  }
  completeDissolution(state, pe, pact);
  return { ok: true };
}

function completeDissolution(
  state: GameState,
  pe: PactsEmbassiesState,
  pact: PePact,
): void {
  pact.status = 'dissolved';
  for (const pid of [pact.partnerA, pact.partnerB]) {
    if (pact.depositHeld[pid]) {
      addInfluence(pe, pid, 1);
      pact.depositHeld[pid] = false;
    }
  }
  clearConsulatesForPact(pe, pact.id);
  markDormantForPact(state, pe, pact.id);
  pe.pendingChoices = pe.pendingChoices.filter(
    (c) => !(c.kind === 'mutual_dissolution' && c.payload.pactId === pact.id),
  );
  queuePeEvents(state, [{ type: 'pe_pact_dissolved', payload: { pactId: pact.id } }]);
}

/** Fin normale / inutilisé à l’expiration. */
export function expirePact(
  state: GameState,
  pe: PactsEmbassiesState,
  pact: PePact,
): void {
  const usedA = Boolean(pact.clauseUsedBy[pact.partnerA]);
  const usedB = Boolean(pact.clauseUsedBy[pact.partnerB]);
  const anyUsed = usedA || usedB;

  for (const pid of [pact.partnerA, pact.partnerB]) {
    if (pact.depositHeld[pid]) {
      addInfluence(pe, pid, 1);
      pact.depositHeld[pid] = false;
    }
  }

  if (!anyUsed) {
    pact.status = 'unused';
  } else {
    pact.status = 'completed';
    if (usedA) addInfluence(pe, pact.partnerA, 1);
    if (usedB) addInfluence(pe, pact.partnerB, 1);
    if (usedA && usedB) {
      addReputation(pe, pact.partnerA, 1);
      addReputation(pe, pact.partnerB, 1);
      const pa = pe.players[pact.partnerA];
      const pb = pe.players[pact.partnerB];
      if (pa) pa.pactsHonored += 1;
      if (pb) pb.pactsHonored += 1;
    }
  }
  clearConsulatesForPact(pe, pact.id);
  markDormantForPact(state, pe, pact.id);
  queuePeEvents(state, [
    { type: 'pe_pact_expired', payload: { pactId: pact.id, status: pact.status } },
  ]);
}

export function expireOffer(
  pe: PactsEmbassiesState,
  offer: PePactOffer,
): void {
  if (offer.status !== 'pending') return;
  offer.status = 'expired';
  addInfluence(pe, offer.fromPlayerId, 1);
  pe.pendingChoices = pe.pendingChoices.filter(
    (c) => !(c.kind === 'pact_offer' && c.payload.offerId === offer.id),
  );
}

export function markClauseUsed(
  pe: PactsEmbassiesState,
  pactId: string,
  playerId: string,
): void {
  const pact = pe.pacts.find((p) => p.id === pactId && p.status === 'active');
  if (!pact) return;
  if (pact.partnerA !== playerId && pact.partnerB !== playerId) return;
  pact.clauseUsedBy[playerId] = true;
}

export function findActivePactWithClause(
  pe: PactsEmbassiesState,
  playerId: string,
  partnerId: string | null,
  clause: PactClauseKind,
): PePact | undefined {
  return pe.pacts.find((p) => {
    if (p.status !== 'active') return false;
    if (!p.clauses.includes(clause)) return false;
    const isPartner =
      p.partnerA === playerId || p.partnerB === playerId;
    if (!isPartner) return false;
    if (partnerId) {
      return (
        (p.partnerA === playerId && p.partnerB === partnerId) ||
        (p.partnerA === partnerId && p.partnerB === playerId)
      );
    }
    return true;
  });
}

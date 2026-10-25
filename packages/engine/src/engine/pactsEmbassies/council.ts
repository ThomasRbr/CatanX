/**
 * Conseil mondial — sessions, votes secrets, cités neutres.
 */

import type { GameState } from '../../types/game';
import type {
  PactsEmbassiesState,
  PeCouncilProposal,
  PeCouncilVote,
  PeNeutralDelegation,
  PeActiveResolution,
} from '../../types/pactsEmbassies';
import { PE_MAX_ACTIVE_RESOLUTIONS, PE_RESOLUTION_DURATION_ROUNDS } from '../../types/pactsEmbassies';
import { nextId } from '../../core/ids';
import { getResolutionById, RESOLUTION_CATALOG } from './catalog/resolutions';
import { getCrisisById } from './catalog/crises';
import { canSpendInfluence, spendInfluence, addInfluence } from './influence';
import { getDelegates } from './embassies';
import { queuePeEvents } from './events';

function activePlayerIds(state: GameState): string[] {
  return [...state.players.values()]
    .filter((p) => !p.isEliminated)
    .map((p) => p.id);
}

export function buildNeutralDelegations(
  state: GameState,
  proposals: PeCouncilProposal[],
): PeNeutralDelegation[] {
  const n = activePlayerIds(state).length;
  const first = proposals[0];
  if (!first) return [];
  const natural = {
    proposalId: first.id,
    variantId: first.variants.find((v) => v.kind === 'moderate')?.id ?? first.variants[0]!.id,
  };

  if (n === 2) {
    return [1, 2, 3].map((i) => ({
      id: `neutral_${i}`,
      label: `Cité neutre ${i}`,
      naturalPreference: { ...natural },
      votes: 1,
    }));
  }
  if (n === 3) {
    return [
      {
        id: 'neutral_1',
        label: 'Cité neutre',
        naturalPreference: { ...natural },
        votes: 2,
      },
    ];
  }
  return [];
}

function drawProposals(pe: PactsEmbassiesState, count: number): PeCouncilProposal[] {
  const out: PeCouncilProposal[] = [];
  let guard = 0;
  const maxGuard = Math.max(RESOLUTION_CATALOG.length * 2, 8);
  while (out.length < count && guard < maxGuard) {
    guard += 1;
    const deck = pe._secret.resolutionDeckOrder;
    if (deck.length === 0) break;
    const resId = deck[0]!;
    pe._secret.resolutionDeckOrder = [...deck.slice(1), resId];
    const def = getResolutionById(resId);
    if (!def) continue;
    if (out.some((p) => p.resolutionId === def.id)) continue;
    const proposalId = nextId('pe_prop');
    out.push({
      id: proposalId,
      resolutionId: def.id,
      category: def.category,
      title: def.title,
      ambitiousConfirmed: false,
      variants: [
        {
          id: `${proposalId}_sq`,
          label: 'Statu quo',
          kind: 'status_quo',
          effectId: 'status_quo',
        },
        {
          id: `${proposalId}_mod`,
          label: 'Variante modérée',
          kind: 'moderate',
          effectId: def.moderateEffect,
        },
        {
          id: `${proposalId}_amb`,
          label: 'Variante ambitieuse',
          kind: 'ambitious',
          effectId: def.ambitiousEffect,
        },
      ],
    });
  }
  return out;
}

/** Démarre / rafraîchit les propositions en phase reveal. */
export function beginCouncilSession(state: GameState, pe: PactsEmbassiesState): void {
  pe.council.sessionIndex += 1;
  pe.council.phase = 'reveal';
  pe.council.roundInSession = 1;
  pe.council.votes = [];
  pe.council.lobbyBids = [];
  pe.council.votesRevealed = false;

  const replaceWithCrisis = pe.council.sessionIndex % 2 === 0;
  let proposals = drawProposals(pe, replaceWithCrisis ? 1 : 2);

  if (replaceWithCrisis) {
    const crisisId = pe._secret.crisisDeckOrder[0];
    if (crisisId) {
      pe._secret.crisisDeckOrder = [
        ...pe._secret.crisisDeckOrder.slice(1),
        pe._secret.crisisDeckOrder[0]!,
      ];
      const def = getCrisisById(crisisId);
      if (def) {
        const objective = 3 * activePlayerIds(state).length;
        pe.crisis = {
          id: nextId('pe_crisis'),
          crisisId: def.id,
          title: def.title,
          objective,
          contributions: [],
          resolved: false,
          announcedSession: pe.council.sessionIndex,
        };
      }
    }
  } else {
    pe.crisis = null;
  }

  // Si crise remplace une proposition, on a déjà 1 ; sinon 2
  if (!replaceWithCrisis && proposals.length < 2) {
    proposals = drawProposals(pe, 2);
  }

  pe.council.proposals = proposals;
  pe.council.neutralDelegations = buildNeutralDelegations(state, proposals);

  queuePeEvents(state, [
    {
      type: 'pe_council_session_start',
      payload: {
        sessionIndex: pe.council.sessionIndex,
        proposalIds: proposals.map((p) => p.id),
        hasCrisis: Boolean(pe.crisis),
      },
    },
  ]);
}

export function sponsorResolution(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  proposalId: string,
): { ok: true } | { ok: false; reason: string } {
  if (pe.council.phase !== 'negotiate' && pe.council.phase !== 'reveal') {
    return { ok: false, reason: 'Parrainage hors phase.' };
  }
  const proposal = pe.council.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: 'Proposition introuvable.' };
  if (proposal.sponsorId) return { ok: false, reason: 'Déjà parrainée.' };
  if (pe.council.proposals.some((p) => p.sponsorId === playerId)) {
    return { ok: false, reason: 'Vous ne parrainez qu’une proposition par session.' };
  }
  if (!canSpendInfluence(pe, playerId, 1)) {
    return { ok: false, reason: 'Influence insuffisante.' };
  }
  spendInfluence(pe, playerId, 1);
  proposal.sponsorId = playerId;
  queuePeEvents(state, [
    { type: 'pe_resolution_sponsored', payload: { proposalId, playerId } },
  ]);
  return { ok: true };
}

export function castCouncilVote(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  proposalId: string,
  variantId: string,
  extraVotes = 0,
): { ok: true } | { ok: false; reason: string } {
  if (pe.council.phase !== 'vote' && pe.council.phase !== 'confirm_ambitious') {
    return { ok: false, reason: 'Vote hors phase.' };
  }

  const proposal = pe.council.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: 'Proposition introuvable.' };
  const variant = proposal.variants.find((v) => v.id === variantId);
  if (!variant) return { ok: false, reason: 'Variante introuvable.' };
  if (variant.kind === 'ambitious' && !proposal.sponsorId) {
    return { ok: false, reason: 'Variante ambitieuse non parrainée.' };
  }
  if (
    variant.kind === 'ambitious' &&
    pe.council.phase === 'vote' &&
    !proposal.ambitiousConfirmed
  ) {
    return { ok: false, reason: 'Variante ambitieuse non confirmée.' };
  }

  const extras = Math.max(0, Math.min(2, Math.floor(extraVotes)));
  const existing = pe.council.votes.find((v) => v.playerId === playerId);
  const prevExtras = existing?.extraVotes ?? 0;
  const delta = extras - prevExtras;
  if (delta > 0 && !canSpendInfluence(pe, playerId, delta)) {
    return { ok: false, reason: 'Influence insuffisante pour voix supplémentaires.' };
  }
  if (delta > 0) spendInfluence(pe, playerId, delta);
  if (delta < 0) addInfluence(pe, playerId, -delta);

  const vote: PeCouncilVote = {
    playerId,
    proposalId,
    variantId,
    extraVotes: extras,
    deposited: true,
  };
  pe.council.votes = pe.council.votes.filter((v) => v.playerId !== playerId);
  pe.council.votes.push(vote);

  // Confirmer ambitieuse si sponsor vote pour elle en phase confirm
  if (variant.kind === 'ambitious' && proposal.sponsorId === playerId) {
    proposal.ambitiousConfirmed = true;
  }

  queuePeEvents(state, [
    { type: 'pe_vote_deposited', payload: { playerId, proposalId } },
  ]);
  return { ok: true };
}

export function lobbyNeutralDelegation(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  delegationId: string,
  amount: number,
): { ok: true } | { ok: false; reason: string } {
  if (
    pe.council.phase !== 'negotiate' &&
    pe.council.phase !== 'confirm_ambitious' &&
    pe.council.phase !== 'vote'
  ) {
    return { ok: false, reason: 'Lobbying hors phase.' };
  }
  const del = pe.council.neutralDelegations.find((d) => d.id === delegationId);
  if (!del) return { ok: false, reason: 'Délégation neutre introuvable.' };
  const amt = Math.max(0, Math.min(2, Math.floor(amount)));
  if (amt < 1) return { ok: false, reason: 'Mise invalide.' };

  // Rembourser une mise précédente du même joueur (escrow)
  const prev = pe.council.lobbyBids.find((b) => b.playerId === playerId);
  if (prev) {
    addInfluence(pe, playerId, prev.amount);
  }

  if (!canSpendInfluence(pe, playerId, amt)) {
    // Restaurer la mise précédente si on ne peut pas
    if (prev) {
      spendInfluence(pe, playerId, prev.amount);
    }
    return { ok: false, reason: 'Influence insuffisante.' };
  }
  spendInfluence(pe, playerId, amt);
  pe.council.lobbyBids = pe.council.lobbyBids.filter((b) => b.playerId !== playerId);
  pe.council.lobbyBids.push({ playerId, delegationId, amount: amt });
  queuePeEvents(state, [
    { type: 'pe_lobby_bid', payload: { playerId, delegationId } },
  ]);
  return { ok: true };
}

function resolveLobbyBids(pe: PactsEmbassiesState): void {
  for (const del of pe.council.neutralDelegations) {
    const bids = pe.council.lobbyBids.filter((b) => b.delegationId === del.id);
    if (bids.length === 0) continue;
    const max = Math.max(...bids.map((b) => b.amount));
    const winners = bids.filter((b) => b.amount === max);
    if (winners.length === 1) {
      const w = winners[0]!;
      // Influence déjà débitée à la mise (escrow) — seuls les perdants sont remboursés
      del.directedBy = w.playerId;
      const vote = pe.council.votes.find((v) => v.playerId === w.playerId);
      if (vote) {
        del.directedPreference = {
          proposalId: vote.proposalId,
          variantId: vote.variantId,
        };
      }
    }
    // égalité → préférence naturelle ; rembourser tout le monde sur cette délégation
    if (winners.length !== 1) {
      for (const b of bids) {
        addInfluence(pe, b.playerId, b.amount);
      }
    } else {
      // Rembourser les perdants
      for (const b of bids) {
        if (b.playerId !== winners[0]!.playerId) {
          addInfluence(pe, b.playerId, b.amount);
        }
      }
    }
  }
  pe.council.lobbyBids = [];
}

/**
 * Décompte des votes et adoption.
 * Chaque joueur vote sur une seule option (proposition+variante).
 */
export function resolveCouncilVotes(state: GameState, pe: PactsEmbassiesState): void {
  resolveLobbyBids(pe);
  pe.council.votesRevealed = true;
  pe.council.phase = 'reveal_votes';

  const active = activePlayerIds(state);
  const quorum = Math.ceil(active.length / 2);
  const voters = pe.council.votes.filter((v) => v.deposited);
  if (voters.length < quorum) {
    // Statu quo global
    queuePeEvents(state, [
      { type: 'pe_council_quorum_failed', payload: { voters: voters.length, quorum } },
    ]);
    pe.council.phase = 'idle';
    return;
  }

  // Score par (proposalId, variantId)
  const scores = new Map<string, number>();
  const bump = (proposalId: string, variantId: string, n: number) => {
    const key = `${proposalId}::${variantId}`;
    scores.set(key, (scores.get(key) ?? 0) + n);
  };

  for (const vote of voters) {
    const power = getDelegates(pe, vote.playerId) + vote.extraVotes;
    bump(vote.proposalId, vote.variantId, power);
  }

  for (const del of pe.council.neutralDelegations) {
    const pref = del.directedPreference ?? del.naturalPreference;
    bump(pref.proposalId, pref.variantId, del.votes);
  }

  // Meilleur score unique par proposition
  for (const proposal of pe.council.proposals) {
    const entries = [...scores.entries()]
      .filter(([k]) => k.startsWith(`${proposal.id}::`))
      .map(([k, score]) => ({
        variantId: k.split('::')[1]!,
        score,
      }));
    if (entries.length === 0) continue;
    const maxScore = Math.max(...entries.map((e) => e.score));
    const leaders = entries.filter((e) => e.score === maxScore);
    if (leaders.length !== 1) continue; // égalité → statu quo
    const winner = leaders[0]!;
    const variant = proposal.variants.find((v) => v.id === winner.variantId);
    if (!variant || variant.kind === 'status_quo') continue;
    if (variant.kind === 'ambitious' && !proposal.ambitiousConfirmed) {
      // Ambitieuse non confirmée → ignorer (statu quo)
      continue;
    }

    adoptResolution(
      state,
      pe,
      proposal,
      variant.kind === 'ambitious' ? 'ambitious' : 'moderate',
      variant.effectId,
    );
  }

  pe.council.phase = 'idle';
  queuePeEvents(state, [{ type: 'pe_council_resolved', payload: {} }]);
}

function adoptResolution(
  state: GameState,
  pe: PactsEmbassiesState,
  proposal: PeCouncilProposal,
  kind: 'moderate' | 'ambitious',
  effectId: string,
): void {
  while (pe.activeResolutions.length >= PE_MAX_ACTIVE_RESOLUTIONS) {
    pe.activeResolutions.shift();
  }
  const active: PeActiveResolution = {
    id: nextId('pe_ares'),
    resolutionId: proposal.resolutionId,
    effectId,
    variantKind: kind,
    sponsoredBy: proposal.sponsorId,
    adoptedRound: pe.globalRound,
    expiresAtRound: pe.globalRound + PE_RESOLUTION_DURATION_ROUNDS,
  };
  pe.activeResolutions.push(active);

  if (proposal.sponsorId && kind === 'ambitious') {
    addInfluence(pe, proposal.sponsorId, 1);
    const ps = pe.players[proposal.sponsorId];
    if (ps) ps.resolutionsSponsoredAdopted += 1;
  }

  pe.history.push({
    turn: state.currentTurn,
    round: pe.globalRound,
    kind: 'resolution_adopted',
    message: `Résolution adoptée : ${proposal.title}`,
    data: { resolutionId: proposal.resolutionId, effectId, kind },
  });
  queuePeEvents(state, [
    {
      type: 'pe_resolution_adopted',
      payload: {
        resolutionId: proposal.resolutionId,
        effectId,
        kind,
        sponsoredBy: proposal.sponsorId,
      },
    },
  ]);
}

export function advanceCouncilPhase(state: GameState, pe: PactsEmbassiesState): void {
  const maxRounds = pe.council.roundsPerSession;
  pe.council.roundInSession += 1;

  if (pe.council.roundInSession === 2) pe.council.phase = 'negotiate';
  else if (pe.council.roundInSession === 3) pe.council.phase = 'confirm_ambitious';
  else if (pe.council.roundInSession === 4) pe.council.phase = 'vote';
  else if (pe.council.roundInSession > maxRounds) {
    // Auto-abstention : joueurs sans vote
    resolveCouncilVotes(state, pe);
    // Prochaine session au prochain cycle
    pe.council.roundInSession = 0;
  }
}

/** Effet d’une résolution active (hand limit, etc.). */
export function peHandLimitBonus(state: GameState, _playerId: string): number {
  const pe = state.extensions?.pactsEmbassies;
  if (!pe) return 0;
  let bonus = 0;
  for (const r of pe.activeResolutions) {
    if (r.effectId === 'hand_limit_plus_1' || r.effectId === 'hand_limit_plus_1_all') {
      bonus += 1;
    }
    if (r.effectId === 'hand_limit_plus_2') bonus += 2;
  }
  for (const pen of pe.mildPenalties) {
    if (pen.effectId === 'crisis_penalty_hand_limit_minus_1') bonus -= 1;
  }
  return bonus;
}

export function peBankTradeRatioCap(state: GameState): number | null {
  const pe = state.extensions?.pactsEmbassies;
  if (!pe) return null;
  let best: number | null = null;
  for (const r of pe.activeResolutions) {
    if (r.effectId === 'trade_ratio_bank_3') best = best === null ? 3 : Math.min(best, 3);
    if (r.effectId === 'trade_ratio_bank_2') best = best === null ? 2 : Math.min(best, 2);
  }
  return best;
}

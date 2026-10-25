/**
 * Horloge Pactes & Ambassades — expiration offres/pactes, sessions conseil.
 */

import type { GameState } from '../../types/game';
import { emptyPeRoundUsage } from '../../types/pactsEmbassies';
import { getPe } from './state';
import { expireOffer, expirePact } from './pacts';
import {
  advanceCouncilPhase,
  beginCouncilSession,
  resolveCouncilVotes,
} from './council';
import { resolveCrisisIfReady } from './crises';
import { updateHighChancellor } from './mandates';
import { queuePeEvents } from './events';
import { isSeasonsEnabled } from '../../core/extensions';

/**
 * Appelé en fin de tour global (retour joueur 0).
 * Non bloquant : refus/abstention auto à expiration.
 */
export function tickPactsEmbassiesClock(state: GameState): void {
  const pe = getPe(state);
  if (!pe) return;

  pe.globalRound += 1;
  pe.roundUsage = emptyPeRoundUsage();

  // Expiration offres
  for (const offer of pe.pactOffers) {
    if (offer.status === 'pending' && offer.expiresAtRound <= pe.globalRound) {
      expireOffer(pe, offer);
    }
  }

  // Expiration pactes
  for (const pact of pe.pacts) {
    if (pact.status === 'active' && pact.expiresAtRound <= pe.globalRound) {
      expirePact(state, pe, pact);
    }
  }

  // Expiration résolutions / pénalités
  pe.activeResolutions = pe.activeResolutions.filter(
    (r) => r.expiresAtRound > pe.globalRound,
  );
  pe.mildPenalties = pe.mildPenalties.filter(
    (p) => p.expiresAtRound > pe.globalRound,
  );

  // Pending choices expirés → auto-refus
  const expired = pe.pendingChoices.filter((c) => c.expiresAtRound <= pe.globalRound);
  for (const choice of expired) {
    if (choice.kind === 'pact_offer') {
      const offer = pe.pactOffers.find((o) => o.id === choice.payload.offerId);
      if (offer && offer.status === 'pending') expireOffer(pe, offer);
    }
    if (choice.kind === 'mutual_dissolution') {
      const pact = pe.pacts.find((p) => p.id === choice.payload.pactId);
      if (pact) delete pact.mutualDissolutionProposedBy;
    }
  }
  pe.pendingChoices = pe.pendingChoices.filter(
    (c) => c.expiresAtRound > pe.globalRound,
  );

  const seasons = isSeasonsEnabled(state);

  // Conseil : démarrage / avance de phase
  if (pe.council.proposals.length === 0 && pe.council.phase === 'idle') {
    // Première session (ou après idle) : sans Saisons on démarre ici ;
    // avec Saisons, onSeasonChanged gère le calendrier.
    if (!seasons || pe.council.sessionIndex === 0) {
      beginCouncilSession(state, pe);
    }
  } else if (pe.council.phase !== 'idle' && pe.council.proposals.length > 0) {
    const before = pe.council.roundInSession;
    advanceCouncilPhase(state, pe);
    const phaseAfter = pe.council.phase as string;
    if (phaseAfter === 'idle' && before > 0) {
      resolveCrisisIfReady(state, pe);
      // Nouvelle session immédiate hors Saisons uniquement
      if (!seasons) {
        beginCouncilSession(state, pe);
      }
    }
  }

  updateHighChancellor(state, pe);
  queuePeEvents(state, [
    { type: 'pe_round_tick', payload: { globalRound: pe.globalRound } },
  ]);
}

/**
 * Alignement Saisons : voter après ronde 4/5, avant transition.
 */
export function resolveCouncilBeforeSeasonTransition(state: GameState): void {
  const pe = getPe(state);
  if (!pe) return;
  if (
    pe.council.phase === 'vote' ||
    pe.council.phase === 'confirm_ambitious' ||
    pe.council.phase === 'negotiate'
  ) {
    if (!pe.council.votesRevealed) {
      resolveCouncilVotes(state, pe);
    }
    resolveCrisisIfReady(state, pe);
  }
}

/**
 * Démarre une session alignée sur une nouvelle saison.
 */
export function onSeasonChanged(state: GameState): void {
  const pe = getPe(state);
  if (!pe) return;
  if (pe.council.phase !== 'idle' && pe.council.proposals.length > 0) {
    if (!pe.council.votesRevealed) {
      resolveCouncilVotes(state, pe);
    }
    resolveCrisisIfReady(state, pe);
  }
  beginCouncilSession(state, pe);
}

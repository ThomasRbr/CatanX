/**
 * Mandats diplomatiques et Haut Chancelier.
 */

import type { GameState } from '../../types/game';
import type { PactsEmbassiesState, PeMandate } from '../../types/pactsEmbassies';
import {
  PE_CHANCELLOR_THRESHOLD,
  PE_MAX_MANDATES,
} from '../../types/pactsEmbassies';
import { activeEmbassyCount } from './state';
import { getReputation, canClaimAdvancedMandate } from './reputation';
import { addInfluence } from './influence';
import { queuePeEvents } from './events';
import { listAvailableMandates } from './catalog/mandates';
import {
  isCitiesKnightsEnabled,
  isSeasonsEnabled,
  isUndergroundSkyEnabled,
} from '../../core/extensions';

export function evaluateMandateCondition(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  mandate: PeMandate,
): boolean {
  const ps = pe.players[playerId];
  if (!ps) return false;
  const data = mandate.conditionData ?? {};
  const count = Number(data.count ?? 1);

  switch (mandate.conditionKind) {
    case 'pacts_honored':
      return ps.pactsHonored >= count;
    case 'resolutions_adopted':
      return ps.resolutionsSponsoredAdopted >= count;
    case 'embassy_count':
      return activeEmbassyCount(pe, playerId) >= count;
    case 'reputation_min':
      return getReputation(pe, playerId) >= Number(data.min ?? 5);
    case 'crisis_contributions':
      return ps.crisisContributionsSufficient >= Number(data.successfulCrises ?? count);
    case 'council_votes': {
      const votes = pe.history.filter(
        (h) => h.kind === 'vote_counted' && h.data?.playerId === playerId,
      ).length;
      // Fallback: count deposited votes in history via pe_vote — use sessions
      const sessionsVoted = pe.council.votes.filter((v) => v.playerId === playerId).length;
      return Math.max(votes, sessionsVoted > 0 ? 1 : 0) >= count || ps.resolutionsSponsoredAdopted >= 0 && pe.history.filter((h) => h.kind === 'resolution_adopted').length >= count;
    }
    case 'allied_infra_usage':
      return Object.keys(pe.roundUsage.alliedInfraInfluenceGained).length >= 0 &&
        pe.history.filter(
          (h) =>
            (h.kind === 'allied_infra' || h.kind === 'pact_expired') &&
            (h.data?.playerId === playerId || h.data?.partners),
        ).length >= count;
    case 'first_trades':
      return pe.history.filter(
        (h) => h.kind === 'pact_accepted' && (
          (h.data?.partners as string[] | undefined)?.includes(playerId)
        ),
      ).length >= count;
    default:
      return false;
  }
}

export function claimMandate(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  mandateSlotId: string,
): { ok: true } | { ok: false; reason: string } {
  const ps = pe.players[playerId];
  if (!ps) return { ok: false, reason: 'Joueur inconnu.' };
  if (ps.mandatesClaimed.length >= PE_MAX_MANDATES) {
    return { ok: false, reason: 'Maximum deux mandats par joueur.' };
  }

  const mandate = pe.mandates.find((m) => m.id === mandateSlotId || m.mandateId === mandateSlotId);
  if (!mandate) return { ok: false, reason: 'Mandat introuvable.' };
  if (mandate.claimedBy) return { ok: false, reason: 'Mandat déjà revendiqué.' };

  // Mandats avancés (réputation)
  if (
    mandate.conditionKind === 'reputation_min' ||
    Number(mandate.conditionData?.requiresReputation ?? 0) >= 5
  ) {
    if (!canClaimAdvancedMandate(pe, playerId)) {
      return { ok: false, reason: 'Réputation insuffisante (5 requise).' };
    }
  }

  if (!evaluateMandateCondition(state, pe, playerId, mandate)) {
    return { ok: false, reason: 'Conditions du mandat non remplies.' };
  }

  mandate.claimedBy = playerId;
  ps.mandatesClaimed.push(mandate.mandateId);
  addInfluence(pe, playerId, 1);

  // Remplacer par un nouveau mandat visible
  refillMandates(state, pe);

  pe.history.push({
    turn: state.currentTurn,
    round: pe.globalRound,
    kind: 'mandate_claimed',
    message: `Mandat revendiqué : ${mandate.title}`,
    data: { playerId, mandateId: mandate.mandateId },
  });
  queuePeEvents(state, [
    {
      type: 'pe_mandate_claimed',
      payload: { playerId, mandateId: mandate.mandateId },
    },
  ]);

  updateHighChancellor(state, pe);
  return { ok: true };
}

function refillMandates(state: GameState, pe: PactsEmbassiesState): void {
  const visible = pe.mandates.filter((m) => !m.claimedBy);
  if (visible.length >= 3) {
    pe.mandates = visible.slice(0, 3);
    return;
  }
  const ext = {
    citiesKnights: isCitiesKnightsEnabled(state),
    seasons: isSeasonsEnabled(state),
    undergroundSky: isUndergroundSkyEnabled(state),
  };
  const available = listAvailableMandates(ext);
  const claimed = new Set(
    Object.values(pe.players).flatMap((p) => p.mandatesClaimed),
  );
  const showing = new Set(visible.map((m) => m.mandateId));
  for (const id of pe._secret.mandateDeckOrder) {
    if (visible.length >= 3) break;
    if (claimed.has(id) || showing.has(id)) continue;
    const def = available.find((m) => m.id === id);
    if (!def) continue;
    visible.push({
      id: `mandate_${def.id}_${pe.globalRound}`,
      mandateId: def.id,
      title: def.title,
      description: def.description,
      conditionKind: def.conditionKind,
      conditionData: def.conditionData,
    });
    showing.add(id);
  }
  pe.mandates = visible.slice(0, 3);
}

export function chancellorScore(
  pe: PactsEmbassiesState,
  playerId: string,
): number {
  const ps = pe.players[playerId];
  if (!ps) return 0;
  const embassies = activeEmbassyCount(pe, playerId);
  return (
    2 * embassies +
    ps.reputation +
    ps.pactsHonored +
    2 * ps.resolutionsSponsoredAdopted +
    ps.mandatesClaimed.length
  );
}

export function updateHighChancellor(state: GameState, pe: PactsEmbassiesState): void {
  const scores = [...state.players.keys()]
    .filter((id) => !state.players.get(id)?.isEliminated)
    .map((id) => ({ id, score: chancellorScore(pe, id) }));

  const eligible = scores.filter((s) => s.score >= PE_CHANCELLOR_THRESHOLD);
  if (eligible.length === 0) return;

  const max = Math.max(...eligible.map((s) => s.score));
  const leaders = eligible.filter((s) => s.score === max);
  if (leaders.length !== 1) {
    // Égalité : conserve le détenteur s’il est toujours à égalité
    if (
      pe.highChancellorId &&
      leaders.some((l) => l.id === pe.highChancellorId)
    ) {
      pe.highChancellorScore = max;
      return;
    }
    return;
  }

  const winner = leaders[0]!;
  if (pe.highChancellorId !== winner.id) {
    pe.highChancellorId = winner.id;
    pe.highChancellorScore = winner.score;
    queuePeEvents(state, [
      {
        type: 'pe_high_chancellor_changed',
        payload: { playerId: winner.id, score: winner.score },
      },
    ]);
  } else {
    pe.highChancellorScore = winner.score;
  }
}

export function peVictoryPoints(state: GameState, playerId: string): number {
  const pe = state.extensions?.pactsEmbassies;
  if (!pe) return 0;
  let vp = 0;
  const ps = pe.players[playerId];
  if (ps) vp += ps.mandatesClaimed.length; // 1 PV permanent chacun
  if (pe.highChancellorId === playerId) vp += 1; // 1 PV transférable
  return vp;
}

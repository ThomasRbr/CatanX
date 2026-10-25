/**
 * IA Pactes & Ambassades — projection publique uniquement.
 *
 * Principes :
 * - phases conseil respectées (vote / confirm / lobby) ;
 * - clauses contextuelles (ports, US, main, réputation) ;
 * - anti-kingmaking ;
 * - difficulté : seuil + pick suboptimal + skip investissement (easy) ;
 * - urgences : offres, votes, mandats, rupture critique.
 */

import type { GameCommand } from '@catanx/protocol';
import type { GameState } from '../../types/game';
import type { AIDifficulty } from '../../types/player';
import type { PactClauseKind, PeCouncilProposal } from '../../types/pactsEmbassies';
import {
  isPactsEmbassiesEnabled,
  isUndergroundSkyEnabled,
} from '../../core/extensions';
import {
  getDifficultyPolicy,
  pickSuboptimal,
  shouldTakeRiskyAction,
} from '../ai/shared/DifficultyPolicy';
import { getPe, activeEmbassyCount } from './state';
import { getInfluence } from './influence';
import { getReputation, clauseLimitForPlayer } from './reputation';
import { getDelegates, getPactCapacity } from './embassies';
import { activePactsForPlayer, findActivePactBetween } from './pacts';
import { evaluateMandateCondition, chancellorScore } from './mandates';

export type PeScoredAction = {
  command: GameCommand;
  score: number;
  label: string;
};

const ALL_CLAUSES: PactClauseKind[] = [
  'trade_accord',
  'port_charter',
  'open_borders',
  'shared_reserve',
  'underground_passage',
  'trade_winds',
];

function asDifficulty(raw?: string): AIDifficulty {
  if (raw === 'easy' || raw === 'medium' || raw === 'hard' || raw === 'legendary') {
    return raw;
  }
  return 'medium';
}

function scoreThreshold(difficulty: AIDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 48;
    case 'medium':
      return 42;
    case 'hard':
      return 36;
    case 'legendary':
      return 32;
    default:
      return 42;
  }
}

function opponentVpThreat(state: GameState, selfId: string, otherId: string): number {
  const self = state.players.get(selfId)?.stats.victoryPoints ?? 0;
  const other = state.players.get(otherId)?.stats.victoryPoints ?? 0;
  const target = state.config.victoryPointTarget;
  if (other >= target - 2 && other > self) return 100;
  return Math.max(0, other - self);
}

function playerHasPorts(state: GameState, playerId: string): boolean {
  const ports = state.players.get(playerId)?.ports ?? [];
  return ports.length > 0;
}

function classicHandSize(state: GameState, playerId: string): number {
  const res = state.players.get(playerId)?.resources;
  if (!res) return 0;
  return (
    (res.wood ?? 0) +
    (res.clay ?? 0) +
    (res.wheat ?? 0) +
    (res.sheep ?? 0) +
    (res.ore ?? 0)
  );
}

function usFootprint(state: GameState, playerId: string): { ug: boolean; sky: boolean } {
  const us = state.extensions?.undergroundSky;
  if (!us || !isUndergroundSkyEnabled(state)) return { ug: false, sky: false };
  return {
    ug:
      us.shafts.some((s) => s.playerId === playerId) ||
      us.tunnels.some((t) => t.playerId === playerId) ||
      us.outposts.some((o) => o.playerId === playerId),
    sky:
      us.airports.some((a) => a.playerId === playerId) ||
      us.airships.some((a) => a.playerId === playerId) ||
      us.beacons.some((b) => b.playerId === playerId),
  };
}

/** Valeur d’une clause pour `self` face à `other` (vue publique). */
function clauseValue(
  state: GameState,
  selfId: string,
  otherId: string,
  clause: PactClauseKind,
): number {
  const selfPorts = playerHasPorts(state, selfId);
  const otherPorts = playerHasPorts(state, otherId);
  const hand = classicHandSize(state, selfId);
  const selfUs = usFootprint(state, selfId);
  const otherUs = usFootprint(state, otherId);

  switch (clause) {
    case 'trade_accord':
      return 12;
    case 'port_charter':
      if (!selfPorts && otherPorts) return 22;
      if (selfPorts && !otherPorts) return 6; // on leur offre plus qu’on gagne
      return 8;
    case 'shared_reserve':
      return hand >= 6 ? 16 : hand >= 4 ? 11 : 7;
    case 'open_borders':
      return 10;
    case 'underground_passage':
      if (!isUndergroundSkyEnabled(state)) return -5;
      if (selfUs.ug || otherUs.ug) return 18;
      return 9;
    case 'trade_winds':
      if (!isUndergroundSkyEnabled(state)) return -5;
      if (selfUs.sky || otherUs.sky) return 18;
      return 9;
    default:
      return 0;
  }
}

function pickBestClauses(
  state: GameState,
  pe: NonNullable<ReturnType<typeof getPe>>,
  selfId: string,
  otherId: string,
): PactClauseKind[] {
  const maxClauses = Math.min(
    clauseLimitForPlayer(pe, selfId),
    clauseLimitForPlayer(pe, otherId),
    2,
  );
  const ranked = ALL_CLAUSES.map((c) => ({
    c,
    v: clauseValue(state, selfId, otherId, c),
  }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || a.c.localeCompare(b.c));

  if (ranked.length === 0) return ['trade_accord'];
  const picked: PactClauseKind[] = [ranked[0]!.c];
  if (maxClauses >= 2 && ranked.length > 1 && ranked[1]!.v >= 8) {
    picked.push(ranked[1]!.c);
  }
  return picked;
}

function offerValue(
  state: GameState,
  selfId: string,
  fromId: string,
  clauses: PactClauseKind[],
): number {
  return clauses.reduce((s, c) => s + clauseValue(state, selfId, fromId, c), 0);
}

function partnerAffinity(state: GameState, selfId: string, otherId: string): number {
  const threat = opponentVpThreat(state, selfId, otherId);
  if (threat >= 100) return -100;
  let score = 20 - threat * 1.5;
  // Préférer allier un milieu de tableau contre un leader
  const vps = [...state.players.values()]
    .filter((p) => !p.isEliminated)
    .map((p) => p.stats.victoryPoints);
  const leader = Math.max(...vps, 0);
  const otherVp = state.players.get(otherId)?.stats.victoryPoints ?? 0;
  if (otherVp < leader - 1) score += 6;
  if (!playerHasPorts(state, selfId) && playerHasPorts(state, otherId)) score += 8;
  const selfUs = usFootprint(state, selfId);
  const otherUs = usFootprint(state, otherId);
  if (selfUs.ug !== otherUs.ug || selfUs.sky !== otherUs.sky) score += 5;
  return score;
}

function pickCouncilVariant(
  state: GameState,
  playerId: string,
  proposal: PeCouncilProposal,
  phase: string,
): { variantId: string; score: number } | null {
  const influence = getInfluence(state.extensions!.pactsEmbassies!, playerId);
  const hand = classicHandSize(state, playerId);
  const selfVp = state.players.get(playerId)?.stats.victoryPoints ?? 0;
  const target = state.config.victoryPointTarget;

  let best: { variantId: string; score: number } | null = null;
  for (const variant of proposal.variants) {
    if (variant.kind === 'ambitious') {
      if (phase === 'confirm_ambitious' && proposal.sponsorId === playerId) {
        // Confirmer sa propre ambitieuse
        const score = 70;
        if (!best || score > best.score) best = { variantId: variant.id, score };
        continue;
      }
      if (!proposal.ambitiousConfirmed || !proposal.sponsorId) continue;
    }

    let score = 20;
    const effect = variant.effectId;
    if (variant.kind === 'status_quo') score = 18;
    if (variant.kind === 'moderate') score = 34;
    if (variant.kind === 'ambitious') score = 42;

    if (effect.includes('trade_ratio') || effect.includes('port')) score += 10;
    if (effect.includes('hand_limit')) score += hand >= 5 ? 12 : 4;
    if (effect.includes('embassy')) score += 6;
    if (effect.includes('tunnel') || effect.includes('aliz') || effect.includes('crystal')) {
      score += isUndergroundSkyEnabled(state) ? 10 : -8;
    }
    if (effect.includes('civil_cost') || effect.includes('road_cost')) score += 7;
    // En fin de partie, éviter d’offrir trop d’aide collective si on mène
    if (selfVp >= target - 3 && variant.kind === 'ambitious') score -= 8;

    // Parrain : pousser sa proposition
    if (proposal.sponsorId === playerId && variant.kind !== 'status_quo') score += 8;

    if (influence < 1 && variant.kind === 'ambitious') score -= 5;

    if (!best || score > best.score) best = { variantId: variant.id, score };
  }
  return best;
}

function classicBuildPressure(state: GameState, playerId: string): number {
  const player = state.players.get(playerId);
  if (!player) return 0;
  const r = player.resources;
  let pressure = 0;
  // Ville presque payée → garder minerai/blé
  if ((r.ore ?? 0) >= 2 && (r.wheat ?? 0) >= 1) pressure += 6;
  if ((r.wood ?? 0) >= 1 && (r.clay ?? 0) >= 1 && (r.wheat ?? 0) >= 1 && (r.sheep ?? 0) >= 1) {
    pressure += 5;
  }
  return pressure;
}

function isUrgentLabel(label: string): boolean {
  return (
    label.startsWith('accept_') ||
    label.startsWith('reject_') ||
    label === 'council_vote' ||
    label === 'confirm_ambitious' ||
    label === 'claim_mandate' ||
    label === 'break_pact_anti_kingmake'
  );
}

export function listPactsEmbassiesScoredActions(
  state: GameState,
  playerId: string,
  difficultyRaw?: string,
): PeScoredAction[] {
  if (!isPactsEmbassiesEnabled(state)) return [];
  const pe = getPe(state);
  if (!pe) return [];
  const player = state.players.get(playerId);
  if (!player || player.isEliminated) return [];

  const difficulty = asDifficulty(difficultyRaw);
  const actions: PeScoredAction[] = [];
  const influence = getInfluence(pe, playerId);
  const reputation = getReputation(pe, playerId);
  const delegates = getDelegates(pe, playerId);
  const pressure = classicBuildPressure(state, playerId);
  const push = (command: GameCommand, score: number, label: string) => {
    actions.push({ command, score: score - pressure, label });
  };

  // --- Offres reçues : accept / reject / counter ---
  for (const offer of pe.pactOffers) {
    if (offer.status !== 'pending' || offer.toPlayerId !== playerId) continue;
    const threat = opponentVpThreat(state, playerId, offer.fromPlayerId);
    const value = offerValue(state, playerId, offer.fromPlayerId, offer.clauses);

    if (threat >= 100 || influence < 1) {
      push(
        { type: 'pe_reject_pact', playerId, offerId: offer.id },
        52,
        threat >= 100 ? 'reject_pact_kingmaking' : 'reject_pact_no_influence',
      );
      continue;
    }

    const ideal = pickBestClauses(state, pe, playerId, offer.fromPlayerId);
    const idealValue = offerValue(state, playerId, offer.fromPlayerId, ideal);
    const canCounter =
      influence >= 1 &&
      difficulty !== 'easy' &&
      idealValue >= value + 10 &&
      ideal.some((c) => !offer.clauses.includes(c));

    if (canCounter) {
      push(
        {
          type: 'pe_counter_pact',
          playerId,
          offerId: offer.id,
          clauses: ideal,
        },
        48 + (idealValue - value) * 0.4,
        'counter_pact',
      );
    }

    if (value >= 10) {
      push(
        { type: 'pe_accept_pact', playerId, offerId: offer.id },
        56 + value * 0.35 - threat * 0.4,
        'accept_pact',
      );
    } else if (!canCounter) {
      push(
        { type: 'pe_reject_pact', playerId, offerId: offer.id },
        38,
        'reject_pact_weak',
      );
    }
  }

  // --- Dissolution mutuelle (répondre) ---
  for (const choice of pe.pendingChoices) {
    if (choice.kind !== 'mutual_dissolution' || choice.playerId !== playerId) continue;
    const pactId = String(choice.payload.pactId);
    const pact = pe.pacts.find((p) => p.id === pactId);
    const partner = pact
      ? pact.partnerA === playerId
        ? pact.partnerB
        : pact.partnerA
      : '';
    const threat = partner ? opponentVpThreat(state, playerId, partner) : 0;
    push(
      { type: 'pe_accept_mutual_dissolution', playerId, pactId },
      threat >= 40 ? 50 : 28,
      'accept_dissolution',
    );
  }

  // --- Ambassade ---
  const board = state.classicBoard;
  const embassyCount = pe.embassies.filter((e) => e.playerId === playerId && !e.suspended)
    .length;
  if (
    board &&
    (player.resources.sheep ?? 0) >= 1 &&
    (player.resources.wheat ?? 0) >= 1 &&
    (player.resources.ore ?? 0) >= 1 &&
    pe.embassies.filter((e) => e.playerId === playerId).length < 3
  ) {
    for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      const def = board.buildingByIntersection[intersectionId];
      if (def !== 'city' && def !== 'metropolis') continue;
      if (pe.embassies.some((e) => e.intersectionId === intersectionId)) continue;
      let score = 44 + (embassyCount === 0 ? 18 : embassyCount === 1 ? 8 : 0);
      if (delegates < 2 && pe.council.phase !== 'idle') score += 6;
      if (difficulty === 'legendary') score += 4;
      push(
        { type: 'pe_build_embassy', playerId, intersectionId },
        score,
        'build_embassy',
      );
      break;
    }
  }

  // --- Proposer pacte ---
  const councilHot =
    pe.council.phase === 'negotiate' ||
    pe.council.phase === 'vote' ||
    pe.council.phase === 'confirm_ambitious';
  const reserveForCouncil = councilHot ? 2 : 1;
  if (influence > reserveForCouncil) {
    const cap = getPactCapacity(pe, playerId);
    if (activePactsForPlayer(pe, playerId).length < cap.maxPacts) {
      const partners = [...state.players.entries()]
        .filter(([id, p]) => id !== playerId && !p.isEliminated)
        .map(([id]) => ({
          id,
          affinity: partnerAffinity(state, playerId, id),
        }))
        .filter((p) => p.affinity > -50 && !findActivePactBetween(pe, playerId, p.id))
        .sort((a, b) => b.affinity - a.affinity);

      const limit = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
      for (const partner of partners.slice(0, limit)) {
        const clauses = pickBestClauses(state, pe, playerId, partner.id);
        const value = offerValue(state, playerId, partner.id, clauses);
        push(
          {
            type: 'pe_propose_pact',
            playerId,
            toPlayerId: partner.id,
            clauses,
          },
          30 + partner.affinity * 0.35 + value * 0.25,
          'propose_pact',
        );
      }
    }
  }

  // --- Proposer dissolution si partenaire menaçant (sans rupture unilatérale) ---
  if (difficulty !== 'easy') {
    for (const pact of activePactsForPlayer(pe, playerId)) {
      const partner = pact.partnerA === playerId ? pact.partnerB : pact.partnerA;
      const threat = opponentVpThreat(state, playerId, partner);
      if (threat >= 100) continue; // break unilatéral plus bas
      if (threat >= 45 && reputation >= 2) {
        push(
          { type: 'pe_propose_mutual_dissolution', playerId, pactId: pact.id },
          40 + threat * 0.2,
          'propose_dissolution',
        );
      }
    }
  }

  // --- Conseil : parrainage (reveal / negotiate) ---
  if (
    (pe.council.phase === 'reveal' || pe.council.phase === 'negotiate') &&
    influence >= 2
  ) {
    for (const proposal of pe.council.proposals) {
      if (proposal.sponsorId) continue;
      if (pe.council.proposals.some((p) => p.sponsorId === playerId)) break;
      const pick = pickCouncilVariant(state, playerId, proposal, pe.council.phase);
      if (!pick || pick.score < 30) continue;
      push(
        { type: 'pe_sponsor_resolution', playerId, proposalId: proposal.id },
        40 + pick.score * 0.15,
        'sponsor',
      );
      break;
    }
  }

  // --- Conseil : vote (phases légales uniquement) ---
  if (
    (pe.council.phase === 'vote' || pe.council.phase === 'confirm_ambitious') &&
    pe.council.proposals.length > 0 &&
    !pe.council.votes.some((v) => v.playerId === playerId && v.deposited)
  ) {
    let best:
      | { proposalId: string; variantId: string; score: number; label: string }
      | null = null;
    for (const proposal of pe.council.proposals) {
      const pick = pickCouncilVariant(state, playerId, proposal, pe.council.phase);
      if (!pick) continue;
      const label =
        pe.council.phase === 'confirm_ambitious' && proposal.sponsorId === playerId
          ? 'confirm_ambitious'
          : 'council_vote';
      if (!best || pick.score > best.score) {
        best = {
          proposalId: proposal.id,
          variantId: pick.variantId,
          score: pick.score,
          label,
        };
      }
    }
    if (best) {
      let extraVotes = 0;
      if (
        difficulty !== 'easy' &&
        influence >= 2 &&
        best.score >= 40 &&
        pe.council.phase === 'vote'
      ) {
        extraVotes = difficulty === 'legendary' ? Math.min(2, influence - 1) : 1;
      }
      push(
        {
          type: 'pe_cast_council_vote',
          playerId,
          proposalId: best.proposalId,
          variantId: best.variantId,
          extraVotes,
        },
        58 + best.score * 0.2 + extraVotes * 3,
        best.label,
      );
    }
  }

  // --- Lobbying cités neutres ---
  if (
    (pe.council.phase === 'negotiate' ||
      pe.council.phase === 'vote' ||
      pe.council.phase === 'confirm_ambitious') &&
    influence >= 1 &&
    difficulty !== 'easy'
  ) {
    const already = pe.council.lobbyBids.some((b) => b.playerId === playerId);
    if (!already && pe.council.neutralDelegations.length > 0) {
      // Choisir la délégation dont la préférence naturelle nous arrange peu
      let target = pe.council.neutralDelegations[0]!;
      let bestGap = -Infinity;
      for (const del of pe.council.neutralDelegations) {
        const prefProposal = pe.council.proposals.find(
          (p) => p.id === del.naturalPreference.proposalId,
        );
        const ourPick = prefProposal
          ? pickCouncilVariant(state, playerId, prefProposal, pe.council.phase)
          : null;
        const gap = ourPick
          ? ourPick.score -
            (del.naturalPreference.variantId === ourPick.variantId ? 20 : 0)
          : 10;
        if (gap > bestGap) {
          bestGap = gap;
          target = del;
        }
      }
      const amount = influence >= 3 && difficulty === 'legendary' ? 2 : 1;
      push(
        {
          type: 'pe_lobby_neutral_delegation',
          playerId,
          delegationId: target.id,
          amount,
        },
        36 + target.votes * 4 + amount * 2,
        'lobby_neutral',
      );
    }
  }

  // --- Crise ---
  if (pe.crisis && !pe.crisis.resolved) {
    const r = player.resources;
    const candidates: Array<{ classic: Record<string, number>; score: number }> = [];
    if ((r.wheat ?? 0) >= 1) candidates.push({ classic: { wheat: 1 }, score: 42 });
    if ((r.sheep ?? 0) >= 2) candidates.push({ classic: { sheep: 1 }, score: 38 });
    if ((r.wood ?? 0) >= 2) candidates.push({ classic: { wood: 1 }, score: 36 });
    if ((r.clay ?? 0) >= 2) candidates.push({ classic: { clay: 1 }, score: 36 });
    if ((r.ore ?? 0) >= 3) candidates.push({ classic: { ore: 1 }, score: 34 });
    candidates.sort((a, b) => b.score - a.score);
    const bestCrisis = candidates[0];
    if (bestCrisis) {
      push(
        {
          type: 'pe_contribute_to_crisis',
          playerId,
          classic: bestCrisis.classic,
        },
        bestCrisis.score + (difficulty === 'legendary' ? 4 : 0),
        'crisis_contribute',
      );
    }
  }

  // --- Mandats ---
  for (const mandate of pe.mandates) {
    if (mandate.claimedBy) continue;
    if (!evaluateMandateCondition(state, pe, playerId, mandate)) continue;
    push(
      { type: 'pe_claim_mandate', playerId, mandateId: mandate.id },
      74,
      'claim_mandate',
    );
  }

  // --- Rupture anti-kingmaking ---
  for (const pact of activePactsForPlayer(pe, playerId)) {
    const partner = pact.partnerA === playerId ? pact.partnerB : pact.partnerA;
    if (opponentVpThreat(state, playerId, partner) >= 100) {
      push(
        { type: 'pe_break_pact', playerId, pactId: pact.id },
        68,
        'break_pact_anti_kingmake',
      );
    }
  }

  // Léger bonus Chancelier / délégués pour debug scoring
  void chancellorScore;
  void activeEmbassyCount;
  void reputation;

  return actions.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

export function choosePactsEmbassiesAction(
  state: GameState,
  playerId: string,
  opts?: { difficulty?: string; urgentOnly?: boolean },
): GameCommand | null {
  if (!isPactsEmbassiesEnabled(state)) return null;
  const difficulty = asDifficulty(opts?.difficulty);
  let scored = listPactsEmbassiesScoredActions(state, playerId, difficulty);
  if (scored.length === 0) return null;

  if (opts?.urgentOnly) {
    scored = scored.filter((a) => isUrgentLabel(a.label));
    if (scored.length === 0) return null;
    return scored[0]!.command;
  }

  // Easy : souvent ignorer l’investissement diplomatique (sauf urgences)
  if (!shouldTakeRiskyAction(difficulty)) {
    scored = scored.filter((a) => isUrgentLabel(a.label));
    if (scored.length === 0) return null;
  }

  const threshold = scoreThreshold(difficulty);
  const viable = scored.filter((a) => a.score >= threshold || isUrgentLabel(a.label));
  if (viable.length === 0) return null;

  const policy = getDifficultyPolicy(difficulty);
  const picked =
    policy.suboptimalChance > 0 ? pickSuboptimal(viable, difficulty) : viable[0]!;
  return picked?.command ?? null;
}

/** Helpers exportés pour tests. */
export const __peAiTest = {
  pickBestClauses,
  clauseValue,
  opponentVpThreat,
  isUrgentLabel,
  scoreThreshold,
  offerValue,
};

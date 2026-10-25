/**
 * Routeur des commandes pe_*.
 */

import type { GameState } from '../../types/game';
import type { GameCommand } from '@catanx/protocol';
import type { PactClauseKind } from '../../types/pactsEmbassies';
import type { ResourceType } from '../../types/resources';
import { commandError, commandSuccess, type CommandResult } from '../../core/errors';
import { isPactsEmbassiesEnabled } from '../../core/extensions';
import { hasResources, subtractResources } from '../resources/ResourceSystem';
import { returnResourcesToBank } from '../catan/ClassicBoard';
import { ensurePactsEmbassiesState } from './state';
import { canBuildEmbassy, buildEmbassy, syncEmbassySuspensions } from './embassies';
import {
  proposePact,
  counterPact,
  acceptPact,
  rejectPact,
  breakPact,
  proposeMutualDissolution,
  acceptMutualDissolution,
} from './pacts';
import {
  sponsorResolution,
  castCouncilVote,
  lobbyNeutralDelegation,
} from './council';
import { contributeToCrisis } from './crises';
import { claimMandate, updateHighChancellor } from './mandates';
import { drainPactsEmbassiesEvents } from './events';

function requirePe(state: GameState): CommandResult | null {
  if (!isPactsEmbassiesEnabled(state)) {
    return commandError('pe_disabled', 'Extension Pactes & Ambassades inactive.');
  }
  if (!ensurePactsEmbassiesState(state)) {
    return commandError('pe_no_state', 'État Pactes & Ambassades manquant.');
  }
  return null;
}

function requirePlaying(state: GameState, playerId: string): CommandResult | null {
  if (state.phase !== 'playing') {
    return commandError('pe_phase', 'Action indisponible hors phase de jeu.');
  }
  const player = state.players.get(playerId);
  if (!player || player.isEliminated) {
    return commandError('pe_player', 'Joueur invalide.');
  }
  return null;
}

/** Actions qui coûtent un tour (construction / initiative). */
function requireOwnTurn(state: GameState, playerId: string): CommandResult | null {
  const playing = requirePlaying(state, playerId);
  if (playing) return playing;
  if (state.turnPhase !== 'player_action') {
    return commandError('pe_phase', 'Action indisponible dans cette phase de tour.');
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return commandError('pe_not_your_turn', "Ce n'est pas votre tour.");
  }
  return null;
}

const EMBASSY_COST: Partial<Record<ResourceType, number>> = {
  sheep: 1,
  wheat: 1,
  ore: 1,
};

export function peBuildEmbassy(
  state: GameState,
  playerId: string,
  intersectionId: string,
): CommandResult {
  const gate = requirePe(state) ?? requireOwnTurn(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const check = canBuildEmbassy(state, pe, playerId, intersectionId);
  if (!check.ok) return commandError('pe_embassy', check.reason);

  const player = state.players.get(playerId)!;
  if (!hasResources(player.resources, EMBASSY_COST)) {
    return commandError('pe_embassy_cost', 'Ressources insuffisantes (1 mouton, 1 blé, 1 minerai).');
  }
  player.resources = subtractResources(player.resources, EMBASSY_COST);
  returnResourcesToBank(state, EMBASSY_COST);

  buildEmbassy(state, pe, playerId, intersectionId);
  updateHighChancellor(state, pe);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peProposePact(
  state: GameState,
  playerId: string,
  toPlayerId: string,
  clauses: PactClauseKind[],
): CommandResult {
  const gate = requirePe(state) ?? requireOwnTurn(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = proposePact(state, pe, playerId, toPlayerId, clauses);
  if (!result.ok) return commandError('pe_propose_pact', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peCounterPact(
  state: GameState,
  playerId: string,
  offerId: string,
  clauses: PactClauseKind[],
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = counterPact(state, pe, playerId, offerId, clauses);
  if (!result.ok) return commandError('pe_counter_pact', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peAcceptPact(
  state: GameState,
  playerId: string,
  offerId: string,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = acceptPact(state, pe, playerId, offerId);
  if (!result.ok) return commandError('pe_accept_pact', result.reason);
  updateHighChancellor(state, pe);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peRejectPact(
  state: GameState,
  playerId: string,
  offerId: string,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = rejectPact(state, pe, playerId, offerId);
  if (!result.ok) return commandError('pe_reject_pact', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peBreakPact(
  state: GameState,
  playerId: string,
  pactId: string,
): CommandResult {
  const gate = requirePe(state) ?? requireOwnTurn(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = breakPact(state, pe, playerId, pactId);
  if (!result.ok) return commandError('pe_break_pact', result.reason);
  updateHighChancellor(state, pe);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peProposeMutualDissolution(
  state: GameState,
  playerId: string,
  pactId: string,
): CommandResult {
  const gate = requirePe(state) ?? requireOwnTurn(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = proposeMutualDissolution(state, pe, playerId, pactId);
  if (!result.ok) return commandError('pe_propose_dissolution', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peAcceptMutualDissolution(
  state: GameState,
  playerId: string,
  pactId: string,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = acceptMutualDissolution(state, pe, playerId, pactId);
  if (!result.ok) return commandError('pe_accept_dissolution', result.reason);
  updateHighChancellor(state, pe);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peSponsorResolution(
  state: GameState,
  playerId: string,
  proposalId: string,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = sponsorResolution(state, pe, playerId, proposalId);
  if (!result.ok) return commandError('pe_sponsor', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peCastCouncilVote(
  state: GameState,
  playerId: string,
  proposalId: string,
  variantId: string,
  extraVotes?: number,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = castCouncilVote(state, pe, playerId, proposalId, variantId, extraVotes);
  if (!result.ok) return commandError('pe_vote', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peLobbyNeutralDelegation(
  state: GameState,
  playerId: string,
  delegationId: string,
  amount: number,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = lobbyNeutralDelegation(state, pe, playerId, delegationId, amount);
  if (!result.ok) return commandError('pe_lobby', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peContributeToCrisis(
  state: GameState,
  playerId: string,
  classic?: Record<string, number>,
  commodities?: Record<string, number>,
  materials?: Record<string, number>,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = contributeToCrisis(
    state,
    pe,
    playerId,
    classic as Partial<Record<ResourceType, number>> | undefined,
    commodities as never,
    materials as never,
  );
  if (!result.ok) return commandError('pe_crisis', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function peClaimMandate(
  state: GameState,
  playerId: string,
  mandateId: string,
): CommandResult {
  const gate = requirePe(state) ?? requirePlaying(state, playerId);
  if (gate) return gate;
  const pe = state.extensions!.pactsEmbassies!;
  const result = claimMandate(state, pe, playerId, mandateId);
  if (!result.ok) return commandError('pe_mandate', result.reason);
  return commandSuccess(state, drainPactsEmbassiesEvents(state));
}

export function handlePactsEmbassiesCommand(
  state: GameState,
  command: GameCommand,
): CommandResult {
  switch (command.type) {
    case 'pe_build_embassy':
      return peBuildEmbassy(state, command.playerId, command.intersectionId);
    case 'pe_propose_pact':
      return peProposePact(
        state,
        command.playerId,
        command.toPlayerId,
        command.clauses as PactClauseKind[],
      );
    case 'pe_counter_pact':
      return peCounterPact(
        state,
        command.playerId,
        command.offerId,
        command.clauses as PactClauseKind[],
      );
    case 'pe_accept_pact':
      return peAcceptPact(state, command.playerId, command.offerId);
    case 'pe_reject_pact':
      return peRejectPact(state, command.playerId, command.offerId);
    case 'pe_break_pact':
      return peBreakPact(state, command.playerId, command.pactId);
    case 'pe_propose_mutual_dissolution':
      return peProposeMutualDissolution(state, command.playerId, command.pactId);
    case 'pe_accept_mutual_dissolution':
      return peAcceptMutualDissolution(state, command.playerId, command.pactId);
    case 'pe_sponsor_resolution':
      return peSponsorResolution(state, command.playerId, command.proposalId);
    case 'pe_cast_council_vote':
      return peCastCouncilVote(
        state,
        command.playerId,
        command.proposalId,
        command.variantId,
        command.extraVotes,
      );
    case 'pe_lobby_neutral_delegation':
      return peLobbyNeutralDelegation(
        state,
        command.playerId,
        command.delegationId,
        command.amount,
      );
    case 'pe_contribute_to_crisis':
      return peContributeToCrisis(
        state,
        command.playerId,
        command.classic,
        command.commodities as Record<string, number> | undefined,
        command.materials as Record<string, number> | undefined,
      );
    case 'pe_claim_mandate':
      return peClaimMandate(state, command.playerId, command.mandateId);
    default:
      return commandError('pe_unknown', `Commande PE inconnue : ${(command as { type: string }).type}`);
  }
}

/** Hook post-upgrade ville : réactive ambassade. */
export function onCityRebuilt(state: GameState, intersectionId: string): void {
  const pe = state.extensions?.pactsEmbassies;
  if (!pe) return;
  const embassy = pe.embassies.find((e) => e.intersectionId === intersectionId);
  if (embassy) {
    embassy.suspended = false;
    syncEmbassySuspensions(state, pe);
  }
}

/** Hook post-pillage / rétrogradation. */
export function onCityDowngraded(state: GameState): void {
  const pe = state.extensions?.pactsEmbassies;
  if (!pe) return;
  syncEmbassySuspensions(state, pe);
}

export { drainPactsEmbassiesEvents };

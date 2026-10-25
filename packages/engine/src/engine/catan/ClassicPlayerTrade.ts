import type { GameState, PendingPlayerTrade } from '../../types/game';
import type { ResourceBundle, ResourceType } from '../../types/resources';
import type { CkCommodityBundle } from '../../types/citiesKnights';
import { now } from '../../core/clock';
import { nextId } from '../../core/ids';
import {
  CLASSIC_RESOURCE_TYPES,
  usesLimitedBank,
} from './ClassicBoard';
import {
  addResources,
  hasResources,
  subtractResources,
  totalResources,
} from '../resources/ResourceSystem';
import { rememberRejectedPlayerTrade, markPlayerTradeOffered } from '../ai/shared/AiMemory';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import {
  cleanCommodityBundle,
} from '../citiesKnights/commodities';
import {
  addCkCommodities,
  hasCkCommodities,
  subtractCkCommodities,
  syncPublicCommodityCounts,
  totalCkCommodities,
} from '../citiesKnights/state';
import { onValidPlayerTrade } from '../pactsEmbassies/clauses';

function cleanBundle(raw: ResourceBundle | Record<string, number>): ResourceBundle {
  const out: ResourceBundle = {};
  for (const [key, amount] of Object.entries(raw)) {
    const n = Math.floor(amount ?? 0);
    if (n > 0) out[key as ResourceType] = n;
  }
  return out;
}

function isClassicOnlyBundle(bundle: ResourceBundle): boolean {
  return (Object.keys(bundle) as string[]).every((key) =>
    (CLASSIC_RESOURCE_TYPES as readonly string[]).includes(key),
  );
}

function logTrade(
  state: GameState,
  playerId: string,
  description: string,
  data: Record<string, unknown>,
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId,
    type: 'trade',
    description,
    data,
    timestamp: now(),
  });
  if (state.actionLog.length > 200) {
    state.actionLog.splice(0, state.actionLog.length - 200);
  }
}

/** Destinataire unique, ou tout le monde sauf le proposant (broadcast). */
export function isPlayerTradeTarget(
  trade: PendingPlayerTrade,
  playerId: string,
): boolean {
  if (trade.fromPlayerId === playerId) return false;
  if ((trade.rejectedBy ?? []).includes(playerId)) return false;
  if (trade.toPlayerId === null) return true;
  return trade.toPlayerId === playerId;
}

function eligibleBroadcastTargets(state: GameState, fromPlayerId: string): string[] {
  return state.turnOrder.filter((id) => {
    if (id === fromPlayerId) return false;
    const p = state.players.get(id);
    return Boolean(p && !p.isEliminated);
  });
}

export function proposePlayerTrade(
  playerId: string,
  toPlayerId: string | null,
  giveRaw: ResourceBundle | Record<string, number>,
  receiveRaw: ResourceBundle | Record<string, number>,
  state: GameState,
  giveCommoditiesRaw?: CkCommodityBundle | Record<string, number>,
  receiveCommoditiesRaw?: CkCommodityBundle | Record<string, number>,
): { success: boolean; reason?: string; trade?: PendingPlayerTrade } {
  if (!usesLimitedBank(state)) {
    return { success: false, reason: 'Commerce joueurs indisponible dans ce mode' };
  }
  if (state.phase !== 'playing') {
    return { success: false, reason: 'Commerce indisponible hors partie' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Commerce indisponible dans cette phase' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }
  if (toPlayerId !== null && playerId === toPlayerId) {
    return { success: false, reason: 'Impossible de commercer avec soi-même' };
  }
  if (state.pendingPlayerTrade) {
    return { success: false, reason: 'Une offre est déjà en cours' };
  }

  const from = state.players.get(playerId);
  if (!from) {
    return { success: false, reason: 'Joueur introuvable' };
  }

  const broadcast = toPlayerId === null;
  let toName = 'tous';
  if (!broadcast) {
    const to = state.players.get(toPlayerId);
    if (!to || to.isEliminated) {
      return { success: false, reason: 'Joueur cible introuvable' };
    }
    toName = to.name;
  } else if (eligibleBroadcastTargets(state, playerId).length === 0) {
    return { success: false, reason: 'Aucun partenaire disponible' };
  }

  const give = cleanBundle(giveRaw);
  const receive = cleanBundle(receiveRaw);
  const giveCommodities = cleanCommodityBundle(giveCommoditiesRaw);
  const receiveCommodities = cleanCommodityBundle(receiveCommoditiesRaw);
  const hasComm =
    totalCkCommodities(giveCommodities) > 0 || totalCkCommodities(receiveCommodities) > 0;

  if (hasComm && !isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Marchandises indisponibles sans Villes & Chevaliers' };
  }

  if (
    totalResources(give) + totalCkCommodities(giveCommodities) <= 0 ||
    totalResources(receive) + totalCkCommodities(receiveCommodities) <= 0
  ) {
    return { success: false, reason: 'Offre et demande doivent contenir au moins 1 carte' };
  }
  if (!isClassicOnlyBundle(give) || !isClassicOnlyBundle(receive)) {
    return { success: false, reason: 'Ressources non classiques interdites' };
  }
  if (!hasResources(from.resources, give)) {
    return { success: false, reason: 'Ressources insuffisantes pour offrir' };
  }
  if (totalCkCommodities(giveCommodities) > 0) {
    const hand = state.extensions?.citiesKnights?.playerCommodities[playerId] ?? {};
    if (!hasCkCommodities(hand, giveCommodities)) {
      return { success: false, reason: 'Marchandises insuffisantes pour offrir' };
    }
  }

  const trade: PendingPlayerTrade = {
    id: nextId('ptrade'),
    fromPlayerId: playerId,
    toPlayerId,
    give,
    receive,
    giveCommodities: totalCkCommodities(giveCommodities) > 0 ? giveCommodities : undefined,
    receiveCommodities:
      totalCkCommodities(receiveCommodities) > 0 ? receiveCommodities : undefined,
    createdTurn: state.currentTurn,
    rejectedBy: broadcast ? [] : undefined,
  };
  state.pendingPlayerTrade = trade;
  markPlayerTradeOffered(state, playerId);
  logTrade(state, playerId, broadcast ? 'Offre à tous' : `Offre à ${toName}`, {
    tradeId: trade.id,
    give,
    receive,
    giveCommodities,
    receiveCommodities,
    broadcast,
  });
  return { success: true, trade };
}

export function acceptPlayerTrade(
  playerId: string,
  tradeId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  const trade = state.pendingPlayerTrade;
  if (!trade || trade.id !== tradeId) {
    return { success: false, reason: 'Aucune offre correspondante' };
  }
  if (!isPlayerTradeTarget(trade, playerId)) {
    return { success: false, reason: "Cette offre ne vous est pas destinée" };
  }

  const from = state.players.get(trade.fromPlayerId);
  const to = state.players.get(playerId);
  if (!from || !to) {
    state.pendingPlayerTrade = null;
    return { success: false, reason: 'Joueur introuvable' };
  }
  if (!hasResources(from.resources, trade.give)) {
    state.pendingPlayerTrade = null;
    return { success: false, reason: "Le proposant n'a plus les ressources" };
  }
  if (to.isEliminated || from.isEliminated) {
    state.pendingPlayerTrade = null;
    return { success: false, reason: 'Joueur indisponible' };
  }
  if (!hasResources(to.resources, trade.receive)) {
    return { success: false, reason: 'Ressources insuffisantes pour accepter' };
  }

  const giveComm = trade.giveCommodities ?? {};
  const recvComm = trade.receiveCommodities ?? {};
  if (totalCkCommodities(giveComm) > 0 || totalCkCommodities(recvComm) > 0) {
    const ck = state.extensions?.citiesKnights;
    if (!ck) {
      return { success: false, reason: 'Marchandises indisponibles' };
    }
    const fromHand = ck.playerCommodities[from.id] ?? {};
    const toHand = ck.playerCommodities[to.id] ?? {};
    if (!hasCkCommodities(fromHand, giveComm)) {
      state.pendingPlayerTrade = null;
      return { success: false, reason: "Le proposant n'a plus les marchandises" };
    }
    if (!hasCkCommodities(toHand, recvComm)) {
      return { success: false, reason: 'Marchandises insuffisantes pour accepter' };
    }
    ck.playerCommodities[from.id] = addCkCommodities(
      subtractCkCommodities(fromHand, giveComm),
      recvComm,
    );
    ck.playerCommodities[to.id] = addCkCommodities(
      subtractCkCommodities(toHand, recvComm),
      giveComm,
    );
    syncPublicCommodityCounts(ck);
  }

  from.resources = subtractResources(from.resources, trade.give);
  from.resources = addResources(from.resources, trade.receive);
  to.resources = subtractResources(to.resources, trade.receive);
  to.resources = addResources(to.resources, trade.give);

  const giveTotal = totalResources(trade.give) + totalCkCommodities(giveComm);
  const receiveTotal = totalResources(trade.receive) + totalCkCommodities(recvComm);
  from.stats.totalResourcesTraded += giveTotal + receiveTotal;
  to.stats.totalResourcesTraded += giveTotal + receiveTotal;

  state.pendingPlayerTrade = null;
  logTrade(state, playerId, `Échange accepté avec ${from.name}`, {
    tradeId,
    give: trade.give,
    receive: trade.receive,
    giveCommodities: giveComm,
    receiveCommodities: recvComm,
  });
  onValidPlayerTrade(state, from.id, to.id);
  return { success: true };
}

export function rejectPlayerTrade(
  playerId: string,
  tradeId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  const trade = state.pendingPlayerTrade;
  if (!trade || trade.id !== tradeId) {
    return { success: false, reason: 'Aucune offre correspondante' };
  }
  if (!isPlayerTradeTarget(trade, playerId)) {
    return { success: false, reason: 'Seul un destinataire peut refuser' };
  }

  if (trade.toPlayerId !== null) {
    state.pendingPlayerTrade = null;
    logTrade(state, playerId, 'Offre refusée', { tradeId });
    rememberRejectedPlayerTrade(
      state,
      trade.fromPlayerId,
      trade.toPlayerId,
      trade.give,
      trade.receive,
    );
    return { success: true };
  }

  const rejectedBy = [...(trade.rejectedBy ?? [])];
  if (!rejectedBy.includes(playerId)) rejectedBy.push(playerId);
  trade.rejectedBy = rejectedBy;
  logTrade(state, playerId, 'Offre refusée', { tradeId, broadcast: true });

  const remaining = eligibleBroadcastTargets(state, trade.fromPlayerId).filter(
    (id) => !rejectedBy.includes(id),
  );
  if (remaining.length === 0) {
    state.pendingPlayerTrade = null;
    rememberRejectedPlayerTrade(
      state,
      trade.fromPlayerId,
      '*',
      trade.give,
      trade.receive,
    );
  }
  return { success: true };
}

export function cancelPlayerTrade(
  playerId: string,
  tradeId: string | undefined,
  state: GameState,
): { success: boolean; reason?: string } {
  const trade = state.pendingPlayerTrade;
  if (!trade) {
    return { success: false, reason: 'Aucune offre en cours' };
  }
  if (tradeId && trade.id !== tradeId) {
    return { success: false, reason: 'Aucune offre correspondante' };
  }
  if (trade.fromPlayerId !== playerId) {
    return { success: false, reason: 'Seul le proposant peut annuler' };
  }
  state.pendingPlayerTrade = null;
  logTrade(state, playerId, 'Offre annulée', { tradeId: trade.id });
  return { success: true };
}

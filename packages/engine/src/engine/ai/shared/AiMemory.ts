/**
 * Mémoire IA légère, indexée par `state.id` (pas WeakMap sur l’objet state).
 * Le client remplace souvent la référence (`{ ...synced }`) : un WeakMap
 * perdrait sticky / refus d’échanges à chaque action.
 */

import type { GameState } from '../../../types/game';
import type { ResourceBundle } from '../../../types/resources';

export interface PlayerAiMemory {
  /** Intersection cible d’expansion sticky. */
  expansionTargetId: string | null;
  /** Tour global où la sticky a été posée / rafraîchie. */
  stickySinceTurn: number;
  /** Dernière longueur de chemin connue (pour détecter progrès). */
  lastPathLength: number;
  /** Tour où une offre joueur a déjà été proposée (anti-spam). */
  playerTradeOfferTurn: number;
  /** Offres refusées ce tour (`toId|give|receive`). */
  rejectedPlayerTrades: string[];
  /** Tour associé à rejectedPlayerTrades. */
  rejectedTradesTurn: number;
}

const byGameId = new Map<string, Map<string, PlayerAiMemory>>();

function gameKey(state: GameState): string {
  return state.id || '__anonymous__';
}

function bucket(state: GameState): Map<string, PlayerAiMemory> {
  const key = gameKey(state);
  let map = byGameId.get(key);
  if (!map) {
    map = new Map();
    byGameId.set(key, map);
  }
  return map;
}

export function clearAiMemoryForGame(gameId: string): void {
  byGameId.delete(gameId);
}

export function getPlayerAiMemory(
  state: GameState,
  playerId: string,
): PlayerAiMemory {
  const map = bucket(state);
  let mem = map.get(playerId);
  if (!mem) {
    mem = {
      expansionTargetId: null,
      stickySinceTurn: 0,
      lastPathLength: 99,
      playerTradeOfferTurn: -1,
      rejectedPlayerTrades: [],
      rejectedTradesTurn: -1,
    };
    map.set(playerId, mem);
  }
  return mem;
}

export function setExpansionStickyTarget(
  state: GameState,
  playerId: string,
  targetId: string | null,
  pathLength: number,
): void {
  const mem = getPlayerAiMemory(state, playerId);
  mem.expansionTargetId = targetId;
  mem.stickySinceTurn = state.currentTurn;
  mem.lastPathLength = pathLength;
}

export function clearExpansionStickyTarget(
  state: GameState,
  playerId: string,
): void {
  const mem = getPlayerAiMemory(state, playerId);
  mem.expansionTargetId = null;
  mem.lastPathLength = 99;
}

function formatBundleKey(bundle: ResourceBundle): string {
  return Object.entries(bundle)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value ?? 0}`)
    .join(',');
}

export function playerTradeOfferKey(
  toPlayerId: string,
  give: ResourceBundle,
  receive: ResourceBundle,
): string {
  return `${toPlayerId}|${formatBundleKey(give)}|${formatBundleKey(receive)}`;
}

/** L’IA a déjà proposé un échange joueur ce tour. */
export function hasProposedPlayerTradeThisTurn(
  state: GameState,
  playerId: string,
): boolean {
  return getPlayerAiMemory(state, playerId).playerTradeOfferTurn === state.currentTurn;
}

export function markPlayerTradeOffered(state: GameState, playerId: string): void {
  getPlayerAiMemory(state, playerId).playerTradeOfferTurn = state.currentTurn;
}

export function rememberRejectedPlayerTrade(
  state: GameState,
  fromPlayerId: string,
  toPlayerId: string,
  give: ResourceBundle,
  receive: ResourceBundle,
): void {
  const mem = getPlayerAiMemory(state, fromPlayerId);
  if (mem.rejectedTradesTurn !== state.currentTurn) {
    mem.rejectedTradesTurn = state.currentTurn;
    mem.rejectedPlayerTrades = [];
  }
  const key = playerTradeOfferKey(toPlayerId, give, receive);
  if (!mem.rejectedPlayerTrades.includes(key)) {
    mem.rejectedPlayerTrades.push(key);
  }
  // Empêche aussi de reproposer immédiatement la même offre
  mem.playerTradeOfferTurn = state.currentTurn;
}

export function wasPlayerTradeRejected(
  state: GameState,
  fromPlayerId: string,
  toPlayerId: string,
  give: ResourceBundle,
  receive: ResourceBundle,
): boolean {
  const mem = getPlayerAiMemory(state, fromPlayerId);
  if (mem.rejectedTradesTurn !== state.currentTurn) return false;
  return mem.rejectedPlayerTrades.includes(
    playerTradeOfferKey(toPlayerId, give, receive),
  );
}

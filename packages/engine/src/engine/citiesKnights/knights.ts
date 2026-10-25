/**
 * Chevaliers C&K (jetons intersection) — distincts des units Armées.
 */
import type { GameState } from '../../types/game';
import type { CkKnight } from '../../types/citiesKnights';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import { ensureCitiesKnightsState } from './state';
import { getUrbanLevel } from './urban';
import {
  hasResources,
  subtractResources,
} from '../resources/ResourceSystem';
import { returnResourcesToBank } from '../catan/ClassicBoard';
import { refreshTrophiesAndVictory } from '../game/GameEngine';
import {
  getFirstKnightActivateExtraCost,
  markFirstKnightActivated,
} from '../seasons/SeasonSystem';
import { addResources } from '../resources/ResourceSystem';

function clearRobber(state: GameState): void {
  for (const [, tile] of state.map) {
    tile.robber = false;
  }
  state.robberPosition = null;
}

const RECRUIT_COST = { sheep: 1, ore: 1 };
const ACTIVATE_COST = { wheat: 1 };
const PROMOTE_COST = { sheep: 1, ore: 1 };

export interface CkKnightStock {
  basic: number;
  strong: number;
  mighty: number;
}

function log(
  state: GameState,
  playerId: string,
  description: string,
  data: Record<string, unknown> = {},
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId,
    type: 'system',
    description,
    data,
    timestamp: now(),
  });
}

/** Stock hors plateau par joueur (2 de chaque rang). */
export function ensureKnightStocks(state: GameState): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  if (ck.knightStocks && Object.keys(ck.knightStocks).length > 0) {
    for (const id of state.turnOrder) {
      if (!ck.knightStocks[id]) {
        ck.knightStocks[id] = { basic: 2, strong: 2, mighty: 2 };
      }
    }
    return;
  }
  ck.knightStocks = {};
  for (const id of state.turnOrder) {
    const onBoard = ck.knights.filter((k) => k.ownerId === id);
    ck.knightStocks[id] = {
      basic: Math.max(0, 2 - onBoard.filter((k) => k.rank === 1).length),
      strong: Math.max(0, 2 - onBoard.filter((k) => k.rank === 2).length),
      mighty: Math.max(0, 2 - onBoard.filter((k) => k.rank === 3).length),
    };
  }
}

function stockOf(state: GameState, playerId: string): CkKnightStock {
  ensureKnightStocks(state);
  return state.extensions!.citiesKnights!.knightStocks[playerId]!;
}

export function knightAtIntersection(
  state: GameState,
  intersectionId: string,
): CkKnight | undefined {
  return state.extensions?.citiesKnights?.knights.find(
    (k) => k.intersectionId === intersectionId,
  );
}

/** Intersections libres reliées au réseau du joueur (recrutement). */
export function listKnightRecruitSpots(state: GameState, playerId: string): string[] {
  const board = state.classicBoard;
  if (!board || !isCitiesKnightsEnabled(state)) return [];
  const out: string[] = [];
  for (const intersectionId of Object.keys(board.topology.intersections)) {
    if (board.occupiedIntersections[intersectionId]) continue;
    if (knightAtIntersection(state, intersectionId)) continue;
    if (!playerTouchesIntersection(state, playerId, intersectionId)) continue;
    out.push(intersectionId);
  }
  return out;
}

/** Destinations légales pour déplacer un chevalier activé (BFS réseau). */
export function listKnightMoveDestinations(
  state: GameState,
  playerId: string,
  knightId: string,
): string[] {
  const board = state.classicBoard;
  const ck = state.extensions?.citiesKnights;
  if (!board || !ck) return [];
  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId || !knight.intersectionId) return [];

  const fromId = knight.intersectionId;
  const out: string[] = [];
  const visited = new Set<string>([fromId]);
  const queue = [fromId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== playerId) continue;
      const edge = board.topology.edges[edgeId];
      if (!edge) continue;
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
      if (!next || visited.has(next)) continue;
      const occ = board.occupiedIntersections[next];
      if (occ && occ !== playerId) continue;
      const enemyKnight = knightAtIntersection(state, next);
      if (enemyKnight && enemyKnight.ownerId !== playerId) continue;
      visited.add(next);
      queue.push(next);
      if (next === fromId) continue;
      if (board.occupiedIntersections[next]) continue;
      if (knightAtIntersection(state, next)) continue;
      out.push(next);
    }
  }
  return out;
}

/** Cibles adjacentes plus faibles pour déloger. */
export function listKnightDisplaceTargets(
  state: GameState,
  playerId: string,
  knightId: string,
): CkKnight[] {
  const board = state.classicBoard;
  const ck = state.extensions?.citiesKnights;
  if (!board || !ck) return [];
  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId || !knight.intersectionId) return [];
  const neighbors = new Set(
    board.topology.intersections[knight.intersectionId]?.neighborIds ?? [],
  );
  return ck.knights.filter((target) => {
    if (target.ownerId === playerId || !target.intersectionId) return false;
    if (knight.rank <= target.rank) return false;
    return neighbors.has(target.intersectionId);
  });
}

/** Le chevalier peut-il chasser le brigand (terrain adjacent) ? */
export function knightCanChaseRobber(
  state: GameState,
  knightId: string,
): boolean {
  const ck = state.extensions?.citiesKnights;
  const board = state.classicBoard;
  if (!ck?.robberUnlocked || !board || !state.robberPosition) return false;
  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight?.intersectionId || !knight.activated || knight.activatedThisTurn) {
    return false;
  }
  const intersection = board.topology.intersections[knight.intersectionId];
  return Boolean(intersection?.tileIds.includes(state.robberPosition));
}

/** Intersection occupée par un chevalier adverse (bloque constructions / routes). */
export function isBlockedByEnemyKnight(
  state: GameState,
  intersectionId: string,
  forPlayerId: string,
): boolean {
  const knight = knightAtIntersection(state, intersectionId);
  return Boolean(knight && knight.ownerId !== forPlayerId);
}

function playerTouchesIntersection(
  state: GameState,
  playerId: string,
  intersectionId: string,
): boolean {
  const board = state.classicBoard!;
  if (board.occupiedIntersections[intersectionId] === playerId) return true;
  for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
    if (owner !== playerId) continue;
    const edge = board.topology.edges[edgeId];
    if (edge && (edge.a === intersectionId || edge.b === intersectionId)) return true;
  }
  // Chevalier allié adjacent via route
  for (const k of state.extensions?.citiesKnights?.knights ?? []) {
    if (k.ownerId !== playerId || !k.intersectionId) continue;
    if (k.intersectionId === intersectionId) return true;
  }
  return false;
}

function continuousRoadReachable(
  state: GameState,
  playerId: string,
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true;
  const board = state.classicBoard!;
  const visited = new Set<string>();
  const queue = [fromId];
  visited.add(fromId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== playerId) continue;
      const edge = board.topology.edges[edgeId];
      if (!edge) continue;
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
      if (!next || visited.has(next)) continue;
      // Ne pas traverser un chevalier / bâtiment adverse
      const occ = board.occupiedIntersections[next];
      if (occ && occ !== playerId) continue;
      const enemyKnight = knightAtIntersection(state, next);
      if (enemyKnight && enemyKnight.ownerId !== playerId) continue;
      if (next === toId) return true;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

export function resetKnightTurnFlags(state: GameState, playerId: string): void {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return;
  for (const k of ck.knights) {
    if (k.ownerId !== playerId) continue;
    k.activatedThisTurn = false;
    k.promotedThisTurn = false;
  }
}

export function ckRecruitKnight(
  playerId: string,
  intersectionId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  if (state.phase !== 'playing' || state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const ck = ensureCitiesKnightsState(state);
  const board = state.classicBoard;
  const player = state.players.get(playerId);
  if (!ck || !board || !player) return { success: false, reason: 'État invalide' };

  ensureKnightStocks(state);
  const stock = stockOf(state, playerId);
  if (stock.basic <= 0) {
    return { success: false, reason: 'Plus de chevaliers basiques disponibles' };
  }
  if (!board.topology.intersections[intersectionId]) {
    return { success: false, reason: 'Intersection invalide' };
  }
  if (board.occupiedIntersections[intersectionId]) {
    return { success: false, reason: 'Intersection occupée par une construction' };
  }
  if (knightAtIntersection(state, intersectionId)) {
    return { success: false, reason: 'Un chevalier occupe déjà cette intersection' };
  }
  if (!playerTouchesIntersection(state, playerId, intersectionId)) {
    return { success: false, reason: 'Doit être relié à votre réseau de routes' };
  }
  if (!hasResources(player.resources, RECRUIT_COST)) {
    return { success: false, reason: 'Coût : 1 mouton + 1 minerai' };
  }

  player.resources = subtractResources(player.resources, RECRUIT_COST);
  returnResourcesToBank(state, RECRUIT_COST);
  stock.basic -= 1;

  const knight: CkKnight = {
    id: nextId('ckknight'),
    ownerId: playerId,
    rank: 1,
    activated: false,
    intersectionId,
    activatedThisTurn: false,
    promotedThisTurn: false,
  };
  ck.knights.push(knight);
  log(state, playerId, 'Chevalier recruté', { knightId: knight.id, intersectionId });
  return { success: true };
}

export function ckActivateKnight(
  playerId: string,
  knightId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const ck = ensureCitiesKnightsState(state);
  const player = state.players.get(playerId);
  if (!ck || !player) return { success: false, reason: 'État invalide' };

  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId) {
    return { success: false, reason: 'Chevalier introuvable' };
  }
  if (!knight.intersectionId) {
    return { success: false, reason: 'Chevalier hors plateau' };
  }
  if (knight.activated) {
    return { success: false, reason: 'Déjà activé' };
  }
  const extra = getFirstKnightActivateExtraCost(state, playerId);
  const totalCost = addResources(ACTIVATE_COST, extra);
  if (!hasResources(player.resources, totalCost)) {
    return { success: false, reason: 'Ressources insuffisantes pour activer' };
  }

  player.resources = subtractResources(player.resources, totalCost);
  returnResourcesToBank(state, totalCost);
  markFirstKnightActivated(state, playerId);
  knight.activated = true;
  knight.activatedThisTurn = true;
  log(state, playerId, 'Chevalier activé', { knightId });
  return { success: true };
}

export function ckPromoteKnight(
  playerId: string,
  knightId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const ck = ensureCitiesKnightsState(state);
  const player = state.players.get(playerId);
  if (!ck || !player) return { success: false, reason: 'État invalide' };

  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId) {
    return { success: false, reason: 'Chevalier introuvable' };
  }
  if (knight.rank >= 3) {
    return { success: false, reason: 'Rang maximum atteint' };
  }
  if (knight.promotedThisTurn) {
    return { success: false, reason: 'Déjà promu ce tour' };
  }
  if (knight.rank === 2 && getUrbanLevel(state, playerId, 'politics') < 3) {
    return { success: false, reason: 'Politique niveau 3 requis pour le rang suprême' };
  }

  ensureKnightStocks(state);
  const stock = stockOf(state, playerId);
  if (knight.rank === 1 && stock.strong <= 0) {
    return { success: false, reason: 'Plus de chevaliers puissants en réserve' };
  }
  if (knight.rank === 2 && stock.mighty <= 0) {
    return { success: false, reason: 'Plus de chevaliers suprêmes en réserve' };
  }
  if (!hasResources(player.resources, PROMOTE_COST)) {
    return { success: false, reason: 'Coût : 1 mouton + 1 minerai' };
  }

  player.resources = subtractResources(player.resources, PROMOTE_COST);
  returnResourcesToBank(state, PROMOTE_COST);

  if (knight.rank === 1) {
    stock.basic += 1;
    stock.strong -= 1;
    knight.rank = 2;
  } else {
    stock.strong += 1;
    stock.mighty -= 1;
    knight.rank = 3;
  }
  knight.promotedThisTurn = true;
  // Promotion conserve l'état actif/inactif
  log(state, playerId, `Chevalier promu rang ${knight.rank}`, { knightId, rank: knight.rank });
  return { success: true };
}

function canKnightAct(knight: CkKnight): { ok: boolean; reason?: string } {
  if (!knight.activated) return { ok: false, reason: 'Le chevalier doit être activé' };
  if (knight.activatedThisTurn) {
    return { ok: false, reason: "Activé ce tour : actions au prochain tour" };
  }
  if (!knight.intersectionId) return { ok: false, reason: 'Hors plateau' };
  return { ok: true };
}

export function ckMoveKnight(
  playerId: string,
  knightId: string,
  toIntersectionId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const ck = ensureCitiesKnightsState(state);
  const board = state.classicBoard;
  if (!ck || !board) return { success: false, reason: 'État invalide' };

  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId) {
    return { success: false, reason: 'Chevalier introuvable' };
  }
  const act = canKnightAct(knight);
  if (!act.ok) return { success: false, reason: act.reason };

  if (!board.topology.intersections[toIntersectionId]) {
    return { success: false, reason: 'Destination invalide' };
  }
  if (board.occupiedIntersections[toIntersectionId]) {
    return { success: false, reason: 'Intersection occupée' };
  }
  if (knightAtIntersection(state, toIntersectionId)) {
    return { success: false, reason: 'Un chevalier y est déjà' };
  }
  if (!continuousRoadReachable(state, playerId, knight.intersectionId!, toIntersectionId)) {
    return { success: false, reason: 'Pas de chemin de routes continu' };
  }

  knight.intersectionId = toIntersectionId;
  knight.activated = false;
  log(state, playerId, 'Chevalier déplacé', { knightId, toIntersectionId });
  return { success: true };
}

export function ckDisplaceKnight(
  playerId: string,
  knightId: string,
  targetKnightId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État invalide' };

  const knight = ck.knights.find((k) => k.id === knightId);
  const target = ck.knights.find((k) => k.id === targetKnightId);
  if (!knight || knight.ownerId !== playerId) {
    return { success: false, reason: 'Chevalier introuvable' };
  }
  if (!target || target.ownerId === playerId) {
    return { success: false, reason: 'Cible invalide' };
  }
  const act = canKnightAct(knight);
  if (!act.ok) return { success: false, reason: act.reason };
  if (knight.rank <= target.rank) {
    return { success: false, reason: 'La cible doit être plus faible' };
  }
  if (!target.intersectionId || !knight.intersectionId) {
    return { success: false, reason: 'Positions invalides' };
  }
  // Adjacent via une arête du propriétaire
  const board = state.classicBoard!;
  const from = knight.intersectionId;
  const to = target.intersectionId;
  const adjacent = Object.entries(board.roadsByEdge).some(([edgeId, owner]) => {
    if (owner !== playerId) return false;
    const edge = board.topology.edges[edgeId];
    return Boolean(
      edge &&
        ((edge.a === from && edge.b === to) || (edge.b === from && edge.a === to)),
    );
  });
  // Aussi adjacent topologiquement même sans route ? Spec: move along network then displace.
  // Require network reachability to target's intersection (neighbor).
  const neighbors = board.topology.intersections[from]?.neighborIds ?? [];
  if (!neighbors.includes(to) && !adjacent) {
    return { success: false, reason: 'La cible doit être adjacente' };
  }

  const vacated = target.intersectionId;
  knight.intersectionId = vacated;
  knight.activated = false;
  // Libérer d'abord la case (évite double occupation pendant le calcul)
  target.intersectionId = null;

  const retreatSpots = findLegalRetreatSpots(state, target);
  if (retreatSpots.length === 0) {
    removeKnightFromBoard(state, target);
    log(state, playerId, 'Chevalier adverse délogé (retiré)', {
      knightId,
      targetKnightId,
    });
  } else if (retreatSpots.length === 1) {
    target.intersectionId = retreatSpots[0]!;
    target.activated = false;
    log(state, playerId, 'Chevalier adverse délogé', {
      knightId,
      targetKnightId,
      retreat: retreatSpots[0],
    });
  } else {
    ck.pendingResolutions.push({
      id: nextId('ckres'),
      kind: 'knight_retreat',
      playerId: target.ownerId,
      data: { knightId: target.id, options: retreatSpots },
    });
    log(state, playerId, 'Chevalier adverse délogé (retraite à choisir)', {
      knightId,
      targetKnightId,
    });
  }

  refreshTrophiesAndVictory(state);
  return { success: true };
}

function findLegalRetreatSpots(state: GameState, knight: CkKnight): string[] {
  const board = state.classicBoard!;
  const spots: string[] = [];
  for (const intersectionId of Object.keys(board.topology.intersections)) {
    if (board.occupiedIntersections[intersectionId]) continue;
    if (knightAtIntersection(state, intersectionId)) continue;
    if (!playerTouchesIntersection(state, knight.ownerId, intersectionId)) continue;
    spots.push(intersectionId);
  }
  return spots;
}

function removeKnightFromBoard(state: GameState, knight: CkKnight): void {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return;
  ensureKnightStocks(state);
  const stock = stockOf(state, knight.ownerId);
  if (knight.rank === 1) stock.basic += 1;
  else if (knight.rank === 2) stock.strong += 1;
  else stock.mighty += 1;
  ck.knights = ck.knights.filter((k) => k.id !== knight.id);
}

export function ckResolveKnightRetreat(
  playerId: string,
  knightId: string,
  toIntersectionId: string | null,
  state: GameState,
): { success: boolean; reason?: string } {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État invalide' };

  const pendingIdx = ck.pendingResolutions.findIndex(
    (r) =>
      r.kind === 'knight_retreat' &&
      r.playerId === playerId &&
      r.data?.knightId === knightId,
  );
  if (pendingIdx < 0) return { success: false, reason: 'Aucune retraite en attente' };

  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId) {
    return { success: false, reason: 'Chevalier introuvable' };
  }

  const options = (ck.pendingResolutions[pendingIdx]!.data?.options as string[]) ?? [];
  if (toIntersectionId === null) {
    removeKnightFromBoard(state, knight);
  } else if (options.includes(toIntersectionId)) {
    if (boardOccupiedOrKnight(state, toIntersectionId)) {
      return { success: false, reason: 'Destination devenue occupée' };
    }
    knight.intersectionId = toIntersectionId;
    knight.activated = false;
  } else {
    return { success: false, reason: 'Destination de retraite invalide' };
  }
  ck.pendingResolutions.splice(pendingIdx, 1);
  refreshTrophiesAndVictory(state);
  return { success: true };
}

function boardOccupiedOrKnight(state: GameState, intersectionId: string): boolean {
  const board = state.classicBoard;
  if (!board) return true;
  if (board.occupiedIntersections[intersectionId]) return true;
  return Boolean(knightAtIntersection(state, intersectionId));
}

export function ckChaseRobber(
  playerId: string,
  knightId: string,
  tileId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  if (state.extensions?.citiesKnights && !state.extensions.citiesKnights.robberUnlocked) {
    return { success: false, reason: 'Le brigand est encore inactif' };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Action indisponible' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const ck = ensureCitiesKnightsState(state);
  const board = state.classicBoard;
  if (!ck || !board) return { success: false, reason: 'État invalide' };

  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId) {
    return { success: false, reason: 'Chevalier introuvable' };
  }
  const act = canKnightAct(knight);
  if (!act.ok) return { success: false, reason: act.reason };
  if (tileId !== state.robberPosition) {
    return { success: false, reason: 'Le brigand n’est pas sur cette tuile' };
  }

  const intersection = board.topology.intersections[knight.intersectionId!];
  if (!intersection?.tileIds.includes(tileId)) {
    return { success: false, reason: 'Le terrain doit être adjacent au chevalier' };
  }

  // Déplacer le brigand : le joueur choisit une nouvelle tuile via move_robber flow
  // Spec: chase robber off adjacent hex — typically move it, then steal.
  // Ici : retire le brigand de la tuile et passe en move_robber pour repositionner.
  clearRobber(state);
  state.sevenFlow = {
    playersToDiscard: [],
    playersDiscarded: [],
    robberTileId: null,
    stealCandidates: [],
  };
  state.turnPhase = 'move_robber';
  knight.activated = false;
  log(state, playerId, 'Brigand chassé', { knightId, tileId });
  return { success: true };
}

/** Force de défense active (invasions). */
export function activeDefenseStrength(state: GameState, playerId?: string): number {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return 0;
  return ck.knights
    .filter((k) => k.activated && k.intersectionId && (!playerId || k.ownerId === playerId))
    .reduce((sum, k) => sum + k.rank, 0);
}

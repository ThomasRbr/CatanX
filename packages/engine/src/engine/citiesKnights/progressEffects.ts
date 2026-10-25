/**
 * Effets jouables des cartes Progrès C&K (`ck_play_progress`).
 */
import type { GameState } from '../../types/game';
import type { ResourceType } from '../../types/resources';
import type {
  CkCommodity,
  CkProgressCard,
  CkProgressCardType,
  CkProgressPlayImpact,
  CkProgressPlayerImpact,
} from '../../types/citiesKnights';
import { CK_COMMODITIES } from '../../types/citiesKnights';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import { randomChoice } from '../../core/rng';
import {
  ensureCitiesKnightsState,
  syncPublicProgressCounts,
  hasCkCommodities,
} from './state';
import {
  discardProgressCard,
  ensureProgressDecks,
  PROGRESS_HAND_LIMIT,
} from './progress';
import { primaryClassicResource } from './commodities';
import { grantCommoditiesToPlayer, removeCommoditiesFromPlayer } from './commodities';
import { getUrbanLevel } from './urban';
import { ckBuildWall } from './walls';
import { refreshTrophiesAndVictory, syncRobberToTile } from '../game/GameEngine';
import { isClassicLandTerrain } from '../catan/CatanTopology';
import { resolveBuildingProductionTileIds } from '../resources/ResourceSystem';

const CLASSIC_FIVE: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];

interface ProgressPlayerSnapshot {
  resources: Partial<Record<ResourceType, number>>;
  commodities: Partial<Record<CkCommodity, number>>;
  progressCards: number;
  roads: Set<string>;
  knights: Map<string, { rank: number; activated: boolean; intersectionId: string | null }>;
}

function snapshotProgressPlayers(state: GameState): Record<string, ProgressPlayerSnapshot> {
  const ck = state.extensions?.citiesKnights;
  const result: Record<string, ProgressPlayerSnapshot> = {};
  for (const playerId of state.turnOrder) {
    const player = state.players.get(playerId);
    if (!player) continue;
    const resources: Partial<Record<ResourceType, number>> = {};
    for (const resource of CLASSIC_FIVE) resources[resource] = player.resources[resource] ?? 0;
    const commodities: Partial<Record<CkCommodity, number>> = {};
    for (const commodity of CK_COMMODITIES) {
      commodities[commodity] = ck?.playerCommodities[playerId]?.[commodity] ?? 0;
    }
    result[playerId] = {
      resources,
      commodities,
      progressCards: ck?.progressHands[playerId]?.length ?? 0,
      roads: new Set(
        Object.entries(state.classicBoard?.roadsByEdge ?? {})
          .filter(([, ownerId]) => ownerId === playerId)
          .map(([edgeId]) => edgeId),
      ),
      knights: new Map(
        (ck?.knights ?? [])
          .filter((knight) => knight.ownerId === playerId)
          .map((knight) => [
            knight.id,
            {
              rank: knight.rank,
              activated: knight.activated,
              intersectionId: knight.intersectionId,
            },
          ]),
      ),
    };
  }
  return result;
}

function buildPlayerImpact(
  before: ProgressPlayerSnapshot,
  after: ProgressPlayerSnapshot,
): CkProgressPlayerImpact {
  const resourceDelta: Partial<Record<ResourceType, number>> = {};
  for (const resource of CLASSIC_FIVE) {
    const delta = (after.resources[resource] ?? 0) - (before.resources[resource] ?? 0);
    if (delta !== 0) resourceDelta[resource] = delta;
  }
  const commodityDelta: Partial<Record<CkCommodity, number>> = {};
  for (const commodity of CK_COMMODITIES) {
    const delta = (after.commodities[commodity] ?? 0) - (before.commodities[commodity] ?? 0);
    if (delta !== 0) commodityDelta[commodity] = delta;
  }

  let roadsRemoved = 0;
  let roadsAdded = 0;
  for (const edgeId of before.roads) if (!after.roads.has(edgeId)) roadsRemoved += 1;
  for (const edgeId of after.roads) if (!before.roads.has(edgeId)) roadsAdded += 1;

  let knightsRemoved = 0;
  let knightsAdded = 0;
  let knightsMoved = 0;
  let knightsActivated = 0;
  let knightsPromoted = 0;
  for (const [knightId, previous] of before.knights) {
    const next = after.knights.get(knightId);
    if (!next) {
      knightsRemoved += 1;
      continue;
    }
    if (previous.intersectionId !== next.intersectionId) knightsMoved += 1;
    if (!previous.activated && next.activated) knightsActivated += 1;
    if (next.rank > previous.rank) knightsPromoted += 1;
  }
  for (const knightId of after.knights.keys()) {
    if (!before.knights.has(knightId)) knightsAdded += 1;
  }

  return {
    resourceDelta,
    commodityDelta,
    progressCardDelta: after.progressCards - before.progressCards,
    roadsRemoved,
    roadsAdded,
    knightsRemoved,
    knightsAdded,
    knightsMoved,
    knightsActivated,
    knightsPromoted,
  };
}

function hasPlayerImpact(impact: CkProgressPlayerImpact): boolean {
  return (
    Object.keys(impact.resourceDelta).length > 0 ||
    Object.keys(impact.commodityDelta).length > 0 ||
    impact.progressCardDelta !== 0 ||
    impact.roadsRemoved > 0 ||
    impact.roadsAdded > 0 ||
    impact.knightsRemoved > 0 ||
    impact.knightsAdded > 0 ||
    impact.knightsMoved > 0 ||
    impact.knightsActivated > 0 ||
    impact.knightsPromoted > 0
  );
}

function buildProgressImpact(
  state: GameState,
  playerId: string,
  card: CkProgressCard,
  params: CkPlayProgressParams,
  before: Record<string, ProgressPlayerSnapshot>,
): CkProgressPlayImpact {
  const after = snapshotProgressPlayers(state);
  const impacts: Record<string, CkProgressPlayerImpact> = {};
  const targetIds = new Set<string>();
  if (params.targetPlayerId && params.targetPlayerId !== playerId) {
    targetIds.add(params.targetPlayerId);
  }

  for (const targetId of state.turnOrder) {
    const previous = before[targetId];
    const next = after[targetId];
    if (!previous || !next) continue;
    const impact = buildPlayerImpact(previous, next);
    if (hasPlayerImpact(impact)) impacts[targetId] = impact;
    if (targetId !== playerId && hasPlayerImpact(impact)) targetIds.add(targetId);
  }

  return {
    version: 1,
    cardType: card.type,
    deck: card.deck,
    targetPlayerIds: [...targetIds],
    choice:
      params.resource || params.commodity
        ? { resource: params.resource, commodity: params.commodity }
        : undefined,
    impacts,
  };
}

export interface CkPlayProgressParams {
  tileId?: string;
  resource?: ResourceType;
  commodity?: CkCommodity;
  targetPlayerId?: string;
  edgeId?: string;
  toEdgeId?: string;
  knightId?: string;
  knightIds?: string[];
  intersectionId?: string;
  toIntersectionId?: string;
  die1?: number;
  die2?: number;
  tokenTileA?: string;
  tokenTileB?: string;
  stealCardId?: string;
  /** Master merchant : jusqu’à 2 prises { kind, key }. */
  take?: Array<{ kind: 'resource' | 'commodity'; key: string }>;
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
    type: 'use_card',
    description,
    data,
    timestamp: now(),
  });
}

function queueDiscardIfNeeded(state: GameState, playerId: string): void {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return;
  const hand = ck.progressHands[playerId] ?? [];
  if (hand.length <= PROGRESS_HAND_LIMIT) return;
  if (ck.pendingResolutions.some((r) => r.kind === 'discard_progress' && r.playerId === playerId)) {
    return;
  }
  ck.pendingResolutions.push({
    id: nextId('ckres'),
    kind: 'discard_progress',
    playerId,
    data: { limit: PROGRESS_HAND_LIMIT },
  });
}

function consumeCard(state: GameState, playerId: string, card: CkProgressCard): void {
  discardProgressCard(state, playerId, card.id);
  const ck = state.extensions?.citiesKnights;
  if (!ck) return;
  const hand = ck.progressHands[playerId] ?? [];
  if (hand.length <= PROGRESS_HAND_LIMIT) {
    ck.pendingResolutions = ck.pendingResolutions.filter(
      (r) => !(r.kind === 'discard_progress' && r.playerId === playerId),
    );
  }
}

function playerTouchesTile(state: GameState, playerId: string, tileId: string): boolean {
  const board = state.classicBoard;
  if (!board) return false;
  for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
    if (owner !== playerId) continue;
    const tiles = board.topology.intersections[iid]?.tileIds ?? [];
    if (tiles.includes(tileId)) return true;
  }
  return false;
}

function isOpenRoad(state: GameState, edgeId: string, ownerId: string): boolean {
  const board = state.classicBoard;
  if (!board) return false;
  const edge = board.topology.edges[edgeId];
  if (!edge || board.roadsByEdge[edgeId] !== ownerId) return false;
  const degree = (intersectionId: string): number => {
    let n = 0;
    for (const [eid, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== ownerId) continue;
      const e = board.topology.edges[eid];
      if (e && (e.a === intersectionId || e.b === intersectionId)) n += 1;
    }
    return n;
  };
  return degree(edge.a) <= 1 || degree(edge.b) <= 1;
}

/** Exported for AI diplomat targeting (must match engine open-road rule). */
export { isOpenRoad as ckIsOpenRoad };

function stealRandomResourceOrCommodity(
  state: GameState,
  fromId: string,
  toId: string,
): boolean {
  const from = state.players.get(fromId);
  const to = state.players.get(toId);
  if (!from || !to) return false;
  type Pool =
    | { kind: 'resource'; key: ResourceType }
    | { kind: 'commodity'; key: CkCommodity };
  const pool: Pool[] = [];
  for (const r of CLASSIC_FIVE) {
    if ((from.resources[r] ?? 0) > 0) pool.push({ kind: 'resource', key: r });
  }
  const hand = state.extensions?.citiesKnights?.playerCommodities[fromId] ?? {};
  for (const c of CK_COMMODITIES) {
    if ((hand[c] ?? 0) > 0) pool.push({ kind: 'commodity', key: c });
  }
  const pick = randomChoice(pool);
  if (!pick) return false;
  if (pick.kind === 'resource') {
    from.resources[pick.key] = (from.resources[pick.key] ?? 0) - 1;
    to.resources[pick.key] = (to.resources[pick.key] ?? 0) + 1;
  } else {
    removeCommoditiesFromPlayer(state, fromId, { [pick.key]: 1 });
    grantCommoditiesToPlayer(state, toId, { [pick.key]: 1 });
  }
  return true;
}

function promoteKnightFree(
  state: GameState,
  playerId: string,
  knightId: string,
): { ok: boolean; reason?: string } {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { ok: false, reason: 'État invalide' };
  const knight = ck.knights.find((k) => k.id === knightId);
  if (!knight || knight.ownerId !== playerId) return { ok: false, reason: 'Chevalier introuvable' };
  if (knight.rank >= 3) return { ok: false, reason: 'Rang max' };
  if (knight.rank === 2 && getUrbanLevel(state, playerId, 'politics') < 3) {
    return { ok: false, reason: 'Politique 3 requis' };
  }
  const stock = ck.knightStocks[playerId];
  if (!stock) return { ok: false, reason: 'Stock manquant' };
  if (knight.rank === 1) {
    if (stock.strong <= 0) return { ok: false, reason: 'Plus de puissants' };
    stock.basic += 1;
    stock.strong -= 1;
    knight.rank = 2;
  } else {
    if (stock.mighty <= 0) return { ok: false, reason: 'Plus de suprêmes' };
    stock.strong += 1;
    stock.mighty -= 1;
    knight.rank = 3;
  }
  return { ok: true };
}

export function canPlayProgressCard(
  state: GameState,
  playerId: string,
  card: CkProgressCard,
): { ok: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { ok: false, reason: 'Extension inactive' };
  }
  if (state.phase !== 'playing') {
    return { ok: false, reason: 'Hors partie' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { ok: false, reason: "Ce n'est pas votre tour" };
  }
  const hand = state.extensions?.citiesKnights?.progressHands[playerId] ?? [];
  if (!hand.some((c) => c.id === card.id)) {
    return { ok: false, reason: 'Carte absente de la main' };
  }
  if (hasPlayedProgressThisTurn(state, playerId)) {
    return { ok: false, reason: 'Une seule carte Progrès peut être jouée par tour' };
  }
  if (card.type === 'alchemist') {
    if (state.turnPhase !== 'start_of_turn') {
      return { ok: false, reason: "L'Alchimiste se joue avant le lancer de dés" };
    }
    return { ok: true };
  }
  if (state.turnPhase !== 'player_action') {
    return { ok: false, reason: 'Jouez après le lancer (phase action)' };
  }
  return { ok: true };
}

/** Rythme tabletop CatanX : une seule carte Progrès jouée par tour de joueur. */
export function hasPlayedProgressThisTurn(state: GameState, playerId: string): boolean {
  return (state.actionLog ?? []).some(
    (entry) =>
      entry.turn === state.currentTurn &&
      entry.playerId === playerId &&
      entry.type === 'use_card' &&
      typeof entry.data?.cardType === 'string',
  );
}

function applyEffect(
  state: GameState,
  playerId: string,
  card: CkProgressCard,
  params: CkPlayProgressParams,
): { success: boolean; reason?: string } {
  const ck = ensureCitiesKnightsState(state);
  const player = state.players.get(playerId);
  if (!ck || !player) return { success: false, reason: 'État invalide' };
  if (!ck.progressBuffs) {
    ck.progressBuffs = {
      merchantFleet: null,
      craneDiscount: {},
      alchemistDice: null,
    };
  }
  ensureProgressDecks(state);

  switch (card.type as CkProgressCardType) {
    case 'merchant': {
      const tileId = params.tileId;
      if (!tileId) return { success: false, reason: 'Choisissez un terrain' };
      const tile = state.map.get(tileId);
      if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') {
        return { success: false, reason: 'Terrain invalide' };
      }
      if (!playerTouchesTile(state, playerId, tileId)) {
        return { success: false, reason: 'Le Marchand doit toucher une de vos constructions' };
      }
      if (!primaryClassicResource(tile.baseProduction)) {
        return { success: false, reason: 'Terrain sans ressource classique' };
      }
      ck.merchant = { tileId, ownerId: playerId };
      break;
    }
    case 'merchant_fleet': {
      if (params.resource && CLASSIC_FIVE.includes(params.resource)) {
        ck.progressBuffs.merchantFleet = {
          playerId,
          kind: 'resource',
          key: params.resource,
        };
      } else if (params.commodity && CK_COMMODITIES.includes(params.commodity)) {
        ck.progressBuffs.merchantFleet = {
          playerId,
          kind: 'commodity',
          key: params.commodity,
        };
      } else {
        return { success: false, reason: 'Choisissez une ressource ou marchandise' };
      }
      break;
    }
    case 'trade_harbor': {
      // Port commercial : chaque adversaire — 1 marchandise contre 1 ressource (s’ils ont)
      const commodity = params.commodity;
      const resource = params.resource;
      if (!commodity || !resource) {
        return { success: false, reason: 'Indiquez marchandise donnée et ressource demandée' };
      }
      for (const oppId of state.turnOrder) {
        if (oppId === playerId) continue;
        const opp = state.players.get(oppId);
        if (!opp) continue;
        const myHand = ck.playerCommodities[playerId] ?? {};
        if (!hasCkCommodities(myHand, { [commodity]: 1 })) break;
        if ((opp.resources[resource] ?? 0) < 1) continue;
        removeCommoditiesFromPlayer(state, playerId, { [commodity]: 1 });
        // Marchandise va à l’adversaire
        grantCommoditiesToPlayer(state, oppId, { [commodity]: 1 });
        opp.resources[resource] = (opp.resources[resource] ?? 0) - 1;
        player.resources[resource] = (player.resources[resource] ?? 0) + 1;
      }
      break;
    }
    case 'resource_monopoly': {
      const resource = params.resource;
      if (!resource || !CLASSIC_FIVE.includes(resource)) {
        return { success: false, reason: 'Nommez une ressource' };
      }
      for (const oppId of state.turnOrder) {
        if (oppId === playerId) continue;
        const opp = state.players.get(oppId);
        if (!opp) continue;
        const take = Math.min(2, opp.resources[resource] ?? 0);
        if (take <= 0) continue;
        opp.resources[resource] = (opp.resources[resource] ?? 0) - take;
        player.resources[resource] = (player.resources[resource] ?? 0) + take;
      }
      break;
    }
    case 'commodity_monopoly': {
      const commodity = params.commodity;
      if (!commodity || !CK_COMMODITIES.includes(commodity)) {
        return { success: false, reason: 'Nommez une marchandise' };
      }
      for (const oppId of state.turnOrder) {
        if (oppId === playerId) continue;
        const hand = ck.playerCommodities[oppId] ?? {};
        const have = hand[commodity] ?? 0;
        if (have <= 0) continue;
        removeCommoditiesFromPlayer(state, oppId, { [commodity]: 1 });
        grantCommoditiesToPlayer(state, playerId, { [commodity]: 1 });
      }
      break;
    }
    case 'master_merchant': {
      const targetId = params.targetPlayerId;
      if (!targetId || targetId === playerId) {
        return { success: false, reason: 'Cible invalide' };
      }
      const target = state.players.get(targetId);
      if (!target) return { success: false, reason: 'Joueur introuvable' };
      if (target.stats.victoryPoints <= player.stats.victoryPoints) {
        return { success: false, reason: 'La cible doit avoir plus de PV' };
      }
      const takes = params.take?.slice(0, 2) ?? [];
      if (takes.length === 0) {
        // Auto : 2 vols aléatoires
        stealRandomResourceOrCommodity(state, targetId, playerId);
        stealRandomResourceOrCommodity(state, targetId, playerId);
      } else {
        for (const t of takes) {
          if (t.kind === 'resource') {
            const key = t.key as ResourceType;
            if ((target.resources[key] ?? 0) < 1) continue;
            target.resources[key] = (target.resources[key] ?? 0) - 1;
            player.resources[key] = (player.resources[key] ?? 0) + 1;
          } else {
            const key = t.key as CkCommodity;
            const hand = ck.playerCommodities[targetId] ?? {};
            if ((hand[key] ?? 0) < 1) continue;
            removeCommoditiesFromPlayer(state, targetId, { [key]: 1 });
            grantCommoditiesToPlayer(state, playerId, { [key]: 1 });
          }
        }
      }
      break;
    }
    case 'bishop': {
      if (!ck.robberUnlocked) {
        return { success: false, reason: 'Brigand encore dormant' };
      }
      const tileId = params.tileId;
      if (!tileId) return { success: false, reason: 'Choisissez une tuile' };
      const tile = state.map.get(tileId);
      if (!tile || tile.terrain === 'ocean' || tile.terrain === 'glacier') {
        return { success: false, reason: 'Tuile invalide' };
      }
      syncRobberToTile(state, tileId);
      // Vole 1 carte à chaque joueur adjacent (sauf soi)
      const victims = new Set<string>();
      for (const [, building] of state.buildings) {
        const tiles = resolveBuildingProductionTileIds(state, building);
        if (tiles.includes(tileId) && building.ownerId !== playerId) {
          victims.add(building.ownerId);
        }
      }
      for (const vid of victims) {
        stealRandomResourceOrCommodity(state, vid, playerId);
      }
      break;
    }
    case 'diplomat': {
      const edgeId = params.edgeId;
      if (!edgeId || !state.classicBoard) {
        return { success: false, reason: 'Choisissez une route' };
      }
      const board = state.classicBoard;
      const owner = board.roadsByEdge[edgeId];
      if (!owner) return { success: false, reason: 'Pas de route ici' };
      if (owner === playerId) {
        if (params.toEdgeId) {
          if (params.toEdgeId === edgeId) {
            return { success: false, reason: 'Destination identique' };
          }
          if (board.roadsByEdge[params.toEdgeId]) {
            return { success: false, reason: 'Destination occupée' };
          }
        }
        delete board.roadsByEdge[edgeId];
        const stock = board.piecesRemaining[playerId];
        if (stock) stock.roads = Math.min(15, (stock.roads ?? 0) + 1);
        if (params.toEdgeId) {
          board.roadsByEdge[params.toEdgeId] = playerId;
          if (stock && stock.roads > 0) stock.roads -= 1;
        } else {
          player.freeRoadsRemaining = (player.freeRoadsRemaining ?? 0) + 1;
        }
      } else {
        if (!isOpenRoad(state, edgeId, owner)) {
          return { success: false, reason: 'La route adverse doit être ouverte' };
        }
        delete board.roadsByEdge[edgeId];
        const stock = board.piecesRemaining[owner];
        if (stock) stock.roads = Math.min(15, (stock.roads ?? 0) + 1);
      }
      break;
    }
    case 'intrigue': {
      const targetKnightId = params.knightId;
      if (!targetKnightId) return { success: false, reason: 'Cible chevalier requise' };
      const target = ck.knights.find((k) => k.id === targetKnightId);
      if (!target || target.ownerId === playerId || !target.intersectionId) {
        return { success: false, reason: 'Chevalier adverse invalide' };
      }
      const board = state.classicBoard!;
      const iid = target.intersectionId;
      const touchesUs = Object.entries(board.roadsByEdge).some(([eid, owner]) => {
        if (owner !== playerId) return false;
        const e = board.topology.edges[eid];
        return Boolean(e && (e.a === iid || e.b === iid));
      });
      if (!touchesUs) {
        return { success: false, reason: 'Le chevalier doit toucher votre réseau' };
      }
      const legalSpots = (board.topology.intersections[iid]?.neighborIds ?? []).filter((nid) => {
        if (board.occupiedIntersections[nid]) return false;
        if (ck.knights.some((k) => k.intersectionId === nid)) return false;
        return Object.entries(board.roadsByEdge).some(([eid, owner]) => {
          if (owner !== target.ownerId) return false;
          const e = board.topology.edges[eid];
          return Boolean(e && (e.a === nid || e.b === nid));
        });
      });
      if (params.toIntersectionId) {
        if (!legalSpots.includes(params.toIntersectionId)) {
          return { success: false, reason: 'Intersection de retraite invalide' };
        }
        target.intersectionId = params.toIntersectionId;
        break;
      }
      if (legalSpots.length === 0) {
        const stock = ck.knightStocks[target.ownerId];
        if (stock) {
          if (target.rank === 1) stock.basic += 1;
          else if (target.rank === 2) stock.strong += 1;
          else stock.mighty += 1;
        }
        ck.knights = ck.knights.filter((k) => k.id !== target.id);
      } else {
        target.intersectionId = legalSpots[0]!;
      }
      break;
    }
    case 'deserter': {
      const targetId = params.targetPlayerId;
      if (!targetId || targetId === playerId) {
        return { success: false, reason: 'Cible invalide' };
      }
      const theirs = ck.knights.filter(
        (k) => k.ownerId === targetId && k.intersectionId,
      );
      if (theirs.length === 0) {
        return { success: false, reason: "L'adversaire n'a pas de chevalier" };
      }
      const chosen =
        (params.knightId
          ? theirs.find((k) => k.id === params.knightId)
          : [...theirs].sort((a, b) => a.rank - b.rank)[0]) ?? null;
      if (!chosen) return { success: false, reason: 'Chevalier introuvable' };
      const placeAt = params.intersectionId;
      if (!placeAt) return { success: false, reason: 'Intersection de placement requise' };
      const board = state.classicBoard!;
      if (board.occupiedIntersections[placeAt]) {
        return { success: false, reason: 'Intersection occupée' };
      }
      if (ck.knights.some((k) => k.intersectionId === placeAt)) {
        return { success: false, reason: 'Déjà un chevalier ici' };
      }
      const onNetwork = Object.entries(board.roadsByEdge).some(([eid, owner]) => {
        if (owner !== playerId) return false;
        const e = board.topology.edges[eid];
        return Boolean(e && (e.a === placeAt || e.b === placeAt));
      });
      if (!onNetwork) return { success: false, reason: 'Doit être sur votre réseau' };

      const theirStock = ck.knightStocks[targetId];
      const myStock = ck.knightStocks[playerId];
      if (!theirStock || !myStock) return { success: false, reason: 'Stocks invalides' };

      // Vérifier notre stock AVANT toute mutation
      if (chosen.rank === 1 && myStock.basic <= 0) {
        return { success: false, reason: 'Plus de basiques' };
      }
      if (chosen.rank === 2 && myStock.strong <= 0) {
        return { success: false, reason: 'Plus de puissants' };
      }
      if (chosen.rank === 3 && myStock.mighty <= 0) {
        return { success: false, reason: 'Plus de suprêmes' };
      }

      if (chosen.rank === 1) {
        theirStock.basic += 1;
        myStock.basic -= 1;
      } else if (chosen.rank === 2) {
        theirStock.strong += 1;
        myStock.strong -= 1;
      } else {
        theirStock.mighty += 1;
        myStock.mighty -= 1;
      }
      ck.knights = ck.knights.filter((k) => k.id !== chosen.id);
      ck.knights.push({
        id: nextId('ckknight'),
        ownerId: playerId,
        rank: chosen.rank,
        activated: false,
        intersectionId: placeAt,
        activatedThisTurn: false,
        promotedThisTurn: false,
      });
      break;
    }
    case 'spy': {
      const targetId = params.targetPlayerId;
      if (!targetId || targetId === playerId) {
        return { success: false, reason: 'Cible invalide' };
      }
      const theirHand = ck.progressHands[targetId] ?? [];
      if (theirHand.length === 0) {
        return { success: false, reason: 'Aucune carte Progrès chez la cible' };
      }
      const stolen =
        (params.stealCardId
          ? theirHand.find((c) => c.id === params.stealCardId)
          : theirHand[0]) ?? null;
      if (!stolen) return { success: false, reason: 'Carte introuvable' };
      ck.progressHands[targetId] = theirHand.filter((c) => c.id !== stolen.id);
      if (!ck.progressHands[playerId]) ck.progressHands[playerId] = [];
      ck.progressHands[playerId]!.push(stolen);
      syncPublicProgressCounts(ck);
      queueDiscardIfNeeded(state, playerId);
      break;
    }
    case 'warlord': {
      for (const knight of ck.knights) {
        if (knight.ownerId !== playerId || !knight.intersectionId) continue;
        knight.activated = true;
        knight.activatedThisTurn = false;
      }
      break;
    }
    case 'alchemist': {
      const d1 = params.die1;
      const d2 = params.die2;
      if (
        d1 === undefined ||
        d2 === undefined ||
        !Number.isInteger(d1) ||
        !Number.isInteger(d2) ||
        d1 < 1 ||
        d1 > 6 ||
        d2 < 1 ||
        d2 > 6
      ) {
        return { success: false, reason: 'Indiquez deux dés (1–6)' };
      }
      ck.progressBuffs.alchemistDice = { die1: d1, die2: d2 };
      break;
    }
    case 'crane': {
      ck.progressBuffs.craneDiscount[playerId] =
        (ck.progressBuffs.craneDiscount[playerId] ?? 0) + 1;
      break;
    }
  // engineer returns early from ckBuildWall — handle success path
    case 'engineer': {
      const intersectionId = params.intersectionId;
      if (!intersectionId) return { success: false, reason: 'Ville pour muraille requise' };
      const built = ckBuildWall(playerId, intersectionId, state, { free: true });
      if (!built.success) return built;
      break;
    }
    case 'inventor': {
      const a = params.tokenTileA;
      const b = params.tokenTileB;
      if (!a || !b || a === b) {
        return { success: false, reason: 'Deux tuiles distinctes requises' };
      }
      const tileA = state.map.get(a);
      const tileB = state.map.get(b);
      if (!tileA || !tileB) return { success: false, reason: 'Tuiles introuvables' };
      if (!tileA.diceValue || !tileB.diceValue) {
        return { success: false, reason: 'Les tuiles doivent avoir un jeton' };
      }
      // Les jetons rouges restent immuables : Inventeur ne peut jamais
      // déplacer un 6 ou un 8, même vers un jeton ordinaire.
      const protectedRedTokens = new Set([6, 8]);
      if (protectedRedTokens.has(tileA.diceValue) || protectedRedTokens.has(tileB.diceValue)) {
        return { success: false, reason: 'Les jetons 6 et 8 ne peuvent pas être déplacés' };
      }
      // Conserver aussi la restriction existante sur les deux extrêmes.
      const extremeTokens = new Set([2, 12]);
      if (extremeTokens.has(tileA.diceValue) && extremeTokens.has(tileB.diceValue)) {
        return { success: false, reason: 'Échange 2/12 interdit entre eux' };
      }
      const tmp = tileA.diceValue;
      tileA.diceValue = tileB.diceValue;
      tileB.diceValue = tmp;
      break;
    }
    case 'road_building': {
      player.freeRoadsRemaining = (player.freeRoadsRemaining ?? 0) + 2;
      break;
    }
    case 'smith': {
      const ids = params.knightIds?.slice(0, 2) ?? (params.knightId ? [params.knightId] : []);
      if (ids.length === 0) {
        const candidates = ck.knights.filter(
          (k) =>
            k.ownerId === playerId &&
            k.intersectionId &&
            k.rank < 3 &&
            !(k.rank === 2 && getUrbanLevel(state, playerId, 'politics') < 3),
        );
        for (const k of candidates.slice(0, 2)) {
          const r = promoteKnightFree(state, playerId, k.id);
          if (!r.ok) break;
        }
      } else {
        const stock = ck.knightStocks[playerId];
        if (!stock) return { success: false, reason: 'Stock manquant' };
        // Simulation de stock pour 2 promotions
        let strong = stock.strong;
        let mighty = stock.mighty;
        const politics = getUrbanLevel(state, playerId, 'politics');
        for (const id of ids) {
          const knight = ck.knights.find((k) => k.id === id);
          if (!knight || knight.ownerId !== playerId) {
            return { success: false, reason: 'Chevalier introuvable' };
          }
          if (knight.rank >= 3) return { success: false, reason: 'Rang max' };
          if (knight.rank === 2 && politics < 3) {
            return { success: false, reason: 'Politique 3 requis' };
          }
          if (knight.rank === 1) {
            if (strong <= 0) return { success: false, reason: 'Plus de puissants' };
            strong -= 1;
          } else {
            if (mighty <= 0) return { success: false, reason: 'Plus de suprêmes' };
            mighty -= 1;
          }
        }
        for (const id of ids) {
          const r = promoteKnightFree(state, playerId, id);
          if (!r.ok) return { success: false, reason: r.reason };
        }
      }
      break;
    }
    default:
      return { success: false, reason: `Effet non supporté : ${card.type}` };
  }

  return { success: true };
}

export function ckPlayProgress(
  playerId: string,
  cardId: string,
  state: GameState,
  params: CkPlayProgressParams = {},
): { success: boolean; reason?: string } {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État C&K manquant' };
  const card = (ck.progressHands[playerId] ?? []).find((c) => c.id === cardId);
  if (!card) return { success: false, reason: 'Carte introuvable' };

  const can = canPlayProgressCard(state, playerId, card);
  if (!can.ok) return { success: false, reason: can.reason };

  const before = snapshotProgressPlayers(state);
  const effect = applyEffect(state, playerId, card, params);
  if (!effect.success) return effect;

  consumeCard(state, playerId, card);
  const progressImpact = buildProgressImpact(state, playerId, card, params, before);
  log(state, playerId, `Progrès joué : ${card.type}`, {
    cardType: card.type,
    progressImpact,
  });
  refreshTrophiesAndVictory(state);
  return { success: true };
}

export function clearMerchantFleetBuff(state: GameState, playerId: string): void {
  const ck = state.extensions?.citiesKnights;
  if (!ck?.progressBuffs) return;
  if (ck.progressBuffs.merchantFleet?.playerId === playerId) {
    ck.progressBuffs.merchantFleet = null;
  }
}

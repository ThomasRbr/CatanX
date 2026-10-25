/**
 * Politique de jeu des 18 cartes Progrès C&K.
 */
import type { GameCommand } from '@catanx/protocol';
import type { GameState } from '../../../types/game';
import type { ResourceType } from '../../../types/resources';
import type { CkCommodity, CkProgressCardType, CkUrbanTrack } from '../../../types/citiesKnights';
import { CLASSIC_RESOURCE_TYPES } from '../../catan/ClassicBoard';
import { isClassicLandTerrain } from '../../catan/CatanTopology';
import { CK_COMMODITIES } from '../../../types/citiesKnights';
import { getUrbanLevel, playerWallCount, listFreeMetropolisHosts } from '../urban';
import { ensureKnightStocks } from '../knights';
import { evaluatePosition } from '../../ai/shared/PositionEvaluator';
import { scoreRobberTile, playersTouchingTile } from '../../ai/shared/BoundedSearch';
import { countCitiesOnBoard, totalDefenseStrength } from '../invasion';
import { ckIsOpenRoad, hasPlayedProgressThisTurn } from '../progressEffects';

export type CkAIDecision = { kind: 'command'; command: GameCommand };

const CLASSIC_FIVE = CLASSIC_RESOURCE_TYPES as unknown as ResourceType[];

function canPromoteKnight(
  state: GameState,
  playerId: string,
  knightRank: 1 | 2 | 3,
): boolean {
  const ck = state.extensions?.citiesKnights;
  if (!ck || knightRank >= 3) return false;
  ensureKnightStocks(state);
  const stock = ck.knightStocks[playerId];
  if (!stock) return false;
  if (knightRank === 1) return stock.strong > 0;
  if (knightRank === 2) {
    return getUrbanLevel(state, playerId, 'politics') >= 3 && stock.mighty > 0;
  }
  return false;
}

function bestMerchantTile(state: GameState, playerId: string): string | null {
  const board = state.classicBoard;
  if (!board) return null;
  let best: string | null = null;
  let bestScore = -1;
  for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
    if (owner !== playerId) continue;
    for (const tileId of board.topology.intersections[iid]?.tileIds ?? []) {
      const tile = state.map.get(tileId);
      if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') continue;
      const prod = Object.values(tile.baseProduction ?? {}).reduce((s, n) => s + (n ?? 0), 0);
      if (prod <= 0) continue;
      const w = tile.diceValue ? 6 - Math.abs(7 - tile.diceValue) : 0;
      const score = w * 3 + prod;
      if (score > bestScore) {
        bestScore = score;
        best = tileId;
      }
    }
  }
  return best;
}

function bestMonopolyResource(state: GameState, playerId: string): ResourceType {
  let best: ResourceType = 'wheat';
  let bestScore = -1;
  for (const r of CLASSIC_FIVE) {
    let open = 0;
    for (const oppId of state.turnOrder) {
      if (oppId === playerId) continue;
      // Public proxy: production touchers (no hand peek)
      for (const [, tile] of state.map) {
        if (!(tile.baseProduction?.[r] ?? 0)) continue;
        if (playersTouchingTile(state, tile.id).includes(oppId)) {
          open += tile.diceValue ? 6 - Math.abs(7 - tile.diceValue) : 1;
        }
      }
    }
    if (open > bestScore) {
      bestScore = open;
      best = r;
    }
  }
  return best;
}

function bestCommodityMonopoly(state: GameState, playerId: string): CkCommodity {
  // Prefer commodity matching our weakest urban track (no per-type public counts).
  const levels = {
    ck_paper: getUrbanLevel(state, playerId, 'science'),
    ck_coin: getUrbanLevel(state, playerId, 'politics'),
    ck_cloth: getUrbanLevel(state, playerId, 'trade'),
  };
  return (Object.entries(levels) as [CkCommodity, number][]).sort((a, b) => a[1] - b[1])[0]![0];
}

function bestInventorSwap(
  state: GameState,
  playerId: string,
): { a: string; b: string } | null {
  const tiles = [...state.map.entries()].filter(
    ([, t]) =>
      isClassicLandTerrain(t.terrain) &&
      t.terrain !== 'desert' &&
      t.diceValue != null &&
      t.diceValue !== 6 &&
      t.diceValue !== 8,
  );
  // Cap pairs for latency — prefer tiles we or the leader touch
  const leaderId = [...state.players.values()]
    .filter((p) => !p.isEliminated)
    .sort((a, b) => b.stats.victoryPoints - a.stats.victoryPoints)[0]?.id;
  const relevant = tiles.filter(([id]) => {
    const touchers = playersTouchingTile(state, id);
    return (
      touchers.includes(playerId) ||
      (leaderId != null && touchers.includes(leaderId))
    );
  });
  const pool = relevant.length >= 2 ? relevant : tiles;
  const extremeTokens = new Set([2, 12]);
  let best: { a: string; b: string; delta: number } | null = null;
  const myTouch = (tileId: string) => playersTouchingTile(state, tileId).includes(playerId);

  const limit = Math.min(pool.length, 24);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      const [idA, tA] = pool[i]!;
      const [idB, tB] = pool[j]!;
      const va = tA.diceValue!;
      const vb = tB.diceValue!;
      if (extremeTokens.has(va) && extremeTokens.has(vb)) continue;
      const wa = 6 - Math.abs(7 - va);
      const wb = 6 - Math.abs(7 - vb);
      let delta = 0;
      if (myTouch(idA)) delta += wb - wa;
      if (myTouch(idB)) delta += wa - wb;
      if (leaderId && leaderId !== playerId) {
        if (playersTouchingTile(state, idA).includes(leaderId)) delta += wa - wb;
        if (playersTouchingTile(state, idB).includes(leaderId)) delta += wb - wa;
      }
      if (!best || delta > best.delta) best = { a: idA, b: idB, delta };
    }
  }
  return best && best.delta > 0 ? { a: best.a, b: best.b } : null;
}

function bestAlchemistDice(state: GameState, playerId: string): { die1: number; die2: number } {
  // Prefer sum matching our best production token; avoid 7 if invasion imminent and cities exist
  const ck = state.extensions?.citiesKnights;
  const eta = ck ? Math.max(0, ck.barbarianTrackLength - ck.barbarianTrackPosition) : 99;
  const deficit = countCitiesOnBoard(state) - totalDefenseStrength(state);

  const counts = new Map<number, number>();
  const board = state.classicBoard;
  if (board) {
    for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      const mult = (() => {
        const bid = board.buildingByIntersection[iid];
        const b = bid ? state.buildings.get(bid) : undefined;
        return b?.definitionId === 'city' || b?.definitionId === 'metropolis' ? 2 : 1;
      })();
      for (const tileId of board.topology.intersections[iid]?.tileIds ?? []) {
        const tile = state.map.get(tileId);
        if (!tile?.diceValue) continue;
        counts.set(tile.diceValue, (counts.get(tile.diceValue) ?? 0) + mult);
      }
    }
  }

  let bestSum = 10;
  let bestScore = -1;
  for (let sum = 2; sum <= 12; sum++) {
    if (sum === 7 && eta <= 2 && deficit > 0) continue;
    const score = counts.get(sum) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestSum = sum;
    }
  }
  // Split into two dice
  for (let d1 = 1; d1 <= 6; d1++) {
    const d2 = bestSum - d1;
    if (d2 >= 1 && d2 <= 6) return { die1: d1, die2: d2 };
  }
  return { die1: 5, die2: 5 };
}

function bestBishopTile(state: GameState, playerId: string): string | null {
  const ck = state.extensions?.citiesKnights;
  if (!ck?.robberUnlocked) return null;
  const scored = [...state.map.keys()]
    .map((tileId) => ({ tileId, score: scoreRobberTile(state, playerId, tileId) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.tileId ?? null;
}

function progressCardValue(type: CkProgressCardType): number {
  const values: Partial<Record<CkProgressCardType, number>> = {
    merchant: 10,
    alchemist: 9,
    resource_monopoly: 8,
    commodity_monopoly: 8,
    inventor: 7,
    bishop: 7,
    spy: 6,
    intrigue: 6,
    master_merchant: 6,
    deserter: 5,
    diplomat: 5,
    warlord: 5,
    smith: 4,
    crane: 4,
    engineer: 4,
    road_building: 3,
    merchant_fleet: 3,
    trade_harbor: 2,
  };
  return values[type] ?? 1;
}

/** Discard the least valuable Progress card. */
export function chooseProgressDiscardCardId(state: GameState, playerId: string): string | null {
  const hand = state.extensions?.citiesKnights?.progressHands[playerId] ?? [];
  if (hand.length === 0) return null;
  const ranked = [...hand].sort(
    (a, b) => progressCardValue(a.type) - progressCardValue(b.type),
  );
  return ranked[0]?.id ?? null;
}

export function decidePlayProgressCard(
  state: GameState,
  playerId: string,
): CkAIDecision | null {
  if (hasPlayedProgressThisTurn(state, playerId)) return null;
  const player = state.players.get(playerId);
  const ck = state.extensions?.citiesKnights;
  if (!player || !ck) return null;

  const hand = [...(ck.progressHands[playerId] ?? [])].sort(
    (a, b) => progressCardValue(b.type) - progressCardValue(a.type),
  );
  const myKnights = ck.knights.filter((k) => k.ownerId === playerId && k.intersectionId);

  for (const card of hand) {
    switch (card.type as CkProgressCardType) {
      case 'merchant': {
        const tileId = bestMerchantTile(state, playerId);
        if (!tileId) break;
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id, tileId },
        };
      }
      case 'alchemist':
        // Handled at start_of_turn
        break;
      case 'resource_monopoly': {
        const resource = bestMonopolyResource(state, playerId);
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id, resource },
        };
      }
      case 'commodity_monopoly': {
        const commodity = bestCommodityMonopoly(state, playerId);
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id, commodity },
        };
      }
      case 'inventor': {
        const swap = bestInventorSwap(state, playerId);
        if (!swap) break;
        return {
          kind: 'command',
          command: {
            type: 'ck_play_progress',
            playerId,
            cardId: card.id,
            tokenTileA: swap.a,
            tokenTileB: swap.b,
          },
        };
      }
      case 'bishop': {
        const tileId = bestBishopTile(state, playerId);
        if (!tileId) break;
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id, tileId },
        };
      }
      case 'warlord': {
        if (!myKnights.some((k) => !k.activated)) break;
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id },
        };
      }
      case 'smith': {
        if (!myKnights.some((k) => canPromoteKnight(state, playerId, k.rank))) break;
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id },
        };
      }
      case 'crane':
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id },
        };
      case 'road_building':
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id },
        };
      case 'engineer': {
        if (playerWallCount(state, playerId) >= 3) break;
        const board = state.classicBoard;
        if (!board) break;
        for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
          if (owner !== playerId || ck.walls[intersectionId]) continue;
          const bid = board.buildingByIntersection[intersectionId];
          const b = bid ? state.buildings.get(bid) : undefined;
          if (b?.definitionId === 'city' || b?.definitionId === 'metropolis') {
            return {
              kind: 'command',
              command: {
                type: 'ck_play_progress',
                playerId,
                cardId: card.id,
                intersectionId,
              },
            };
          }
        }
        break;
      }
      case 'merchant_fleet': {
        // Prefer resource we have surplus of for 2:1
        let resource: ResourceType = 'wheat';
        let best = -1;
        for (const r of CLASSIC_FIVE) {
          const n = player.resources[r] ?? 0;
          if (n > best) {
            best = n;
            resource = r;
          }
        }
        return {
          kind: 'command',
          command: { type: 'ck_play_progress', playerId, cardId: card.id, resource },
        };
      }
      case 'trade_harbor': {
        const handComm = ck.playerCommodities[playerId] ?? {};
        const commodity = CK_COMMODITIES.find((c) => (handComm[c] ?? 0) > 0);
        if (!commodity) break;
        const resource = bestMonopolyResource(state, playerId);
        return {
          kind: 'command',
          command: {
            type: 'ck_play_progress',
            playerId,
            cardId: card.id,
            commodity,
            resource,
          },
        };
      }
      case 'spy': {
        const target = state.turnOrder.find((id) => {
          if (id === playerId) return false;
          // Public count only — never peek progressHands (private)
          return (ck.publicProgressCounts[id] ?? 0) > 0;
        });
        if (!target) break;
        return {
          kind: 'command',
          command: {
            type: 'ck_play_progress',
            playerId,
            cardId: card.id,
            targetPlayerId: target,
          },
        };
      }
      case 'master_merchant': {
        const myVp = player.stats.victoryPoints;
        const target = state.turnOrder
          .filter((id) => id !== playerId)
          .sort(
            (a, b) =>
              (state.players.get(b)?.stats.victoryPoints ?? 0) -
              (state.players.get(a)?.stats.victoryPoints ?? 0),
          )
          .find((id) => (state.players.get(id)?.stats.victoryPoints ?? 0) > myVp);
        if (!target) break;
        return {
          kind: 'command',
          command: {
            type: 'ck_play_progress',
            playerId,
            cardId: card.id,
            targetPlayerId: target,
          },
        };
      }
      case 'intrigue': {
        // Target enemy knight adjacent to our road
        const board = state.classicBoard;
        if (!board) break;
        const enemy = ck.knights.find((k) => {
          if (k.ownerId === playerId || !k.intersectionId) return false;
          return Object.entries(board.roadsByEdge).some(([eid, owner]) => {
            if (owner !== playerId) return false;
            const e = board.topology.edges[eid];
            return e && (e.a === k.intersectionId || e.b === k.intersectionId);
          });
        });
        if (!enemy) break;
        return {
          kind: 'command',
          command: {
            type: 'ck_play_progress',
            playerId,
            cardId: card.id,
            knightId: enemy.id,
          },
        };
      }
      case 'deserter': {
        const targetKnight = ck.knights
          .filter((k) => k.ownerId !== playerId && k.intersectionId)
          .sort((a, b) => b.rank - a.rank)[0];
        if (!targetKnight) break;
        ensureKnightStocks(state);
        const myStock = ck.knightStocks[playerId];
        if (!myStock) break;
        if (targetKnight.rank === 1 && myStock.basic <= 0) break;
        if (targetKnight.rank === 2 && myStock.strong <= 0) break;
        if (targetKnight.rank === 3 && myStock.mighty <= 0) break;
        const board = state.classicBoard;
        if (!board) break;
        const placeAt = Object.keys(board.topology.intersections).find((iid) => {
          if (board.occupiedIntersections[iid]) return false;
          if (ck.knights.some((k) => k.intersectionId === iid)) return false;
          return Object.entries(board.roadsByEdge).some(([eid, owner]) => {
            if (owner !== playerId) return false;
            const e = board.topology.edges[eid];
            return Boolean(e && (e.a === iid || e.b === iid));
          });
        });
        if (!placeAt) break;
        return {
          kind: 'command',
          command: {
            type: 'ck_play_progress',
            playerId,
            cardId: card.id,
            targetPlayerId: targetKnight.ownerId,
            knightId: targetKnight.id,
            intersectionId: placeAt,
          },
        };
      }
      case 'diplomat': {
        const board = state.classicBoard;
        if (!board) break;
        // Prefer removing an open enemy road (engine isOpenRoad rule)
        const enemyEdge = Object.entries(board.roadsByEdge).find(
          ([eid, owner]) => owner !== playerId && ckIsOpenRoad(state, eid, owner),
        );
        if (enemyEdge) {
          return {
            kind: 'command',
            command: {
              type: 'ck_play_progress',
              playerId,
              cardId: card.id,
              edgeId: enemyEdge[0],
            },
          };
        }
        break;
      }
      default:
        break;
    }
  }

  return null;
}

export function scoreMetropolisHost(
  state: GameState,
  playerId: string,
  intersectionId: string,
): number {
  return evaluatePosition(state, playerId) * 0.01 + (() => {
    const board = state.classicBoard;
    if (!board) return 0;
    let s = 0;
    for (const tileId of board.topology.intersections[intersectionId]?.tileIds ?? []) {
      const tile = state.map.get(tileId);
      if (!tile?.diceValue) continue;
      s += 6 - Math.abs(7 - tile.diceValue);
    }
    return s;
  })();
}

export function chooseBestMetropolisHost(
  state: GameState,
  playerId: string,
  track: CkUrbanTrack,
): string | null {
  const hosts = listFreeMetropolisHosts(state, playerId, track);
  if (hosts.length === 0) return null;
  return [...hosts].sort(
    (a, b) => scoreMetropolisHost(state, playerId, b) - scoreMetropolisHost(state, playerId, a),
  )[0]!;
}

export { canPromoteKnight, bestAlchemistDice, progressCardValue };

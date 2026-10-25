/**
 * Politique IA dédiée Villes & Chevaliers.
 * Priorité : pendings → défense (proche invasion) → chevaliers → urbain → progrès.
 */
import type { GameCommand } from '@catanx/protocol';
import type { GameState } from '../../types/game';
import type { AIDifficulty } from '../../types/player';
import type { CkCommodity, CkUrbanTrack } from '../../types/citiesKnights';
import type { ResourceType } from '../../types/resources';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { hasResources, getPortTradeRatio } from '../resources/ResourceSystem';
import {
  canImproveUrban,
  listFreeMetropolisHosts,
  playerWallCount,
  getUrbanLevel,
  urbanTrackCommodity,
  urbanImproveCostForPlayer,
} from './urban';
import { countCitiesOnBoard, totalDefenseStrength } from './invasion';
import {
  ensureKnightStocks,
  listKnightRecruitSpots,
  listKnightMoveDestinations,
  listKnightDisplaceTargets,
  knightCanChaseRobber,
} from './knights';
import { CLASSIC_RESOURCE_TYPES, usesLimitedBank } from '../catan/ClassicBoard';
import { PROGRESS_HAND_LIMIT } from './progress';
import {
  chooseProgressDiscardCardId,
  decidePlayProgressCard,
  chooseBestMetropolisHost,
  canPromoteKnight,
  bestAlchemistDice,
  scoreMetropolisHost,
} from './ai/progressPolicy';

export type CkAIDecision = { kind: 'command'; command: GameCommand };

export interface CkAIOptions {
  difficulty: AIDifficulty;
}

function turnsUntilInvasion(state: GameState): number {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return 99;
  return Math.max(0, ck.barbarianTrackLength - ck.barbarianTrackPosition);
}

function defenseDeficit(state: GameState): number {
  return countCitiesOnBoard(state) - totalDefenseStrength(state);
}

/** True si l’invasion est imminente et la défense collective est insuffisante. */
export function shouldPrioritizeDefense(state: GameState): boolean {
  const eta = turnsUntilInvasion(state);
  const deficit = defenseDeficit(state);
  if (eta <= 1) return true;
  if (eta <= 3 && deficit > 0) return true;
  if (eta <= 5 && deficit >= 2) return true;
  return false;
}

/** Returns null when no classic resource remains in the bank (caller must not emit aqueduct). */
function chooseAqueductResource(
  state: GameState,
  playerId: string,
): 'wood' | 'clay' | 'wheat' | 'sheep' | 'ore' | null {
  const player = state.players.get(playerId);
  const bag = player?.resources ?? {};
  const order = ['wheat', 'ore', 'sheep', 'wood', 'clay'] as const;
  let best: (typeof order)[number] | null = null;
  let bestScore = Infinity;
  for (const r of order) {
    if (usesLimitedBank(state) && (state.bank?.[r] ?? 0) <= 0) continue;
    const score = bag[r] ?? 0;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (best) return best;
  if (usesLimitedBank(state) && state.bank) {
    for (const r of order) {
      if ((state.bank[r] ?? 0) > 0) return r;
    }
    return null;
  }
  return 'wheat';
}

function bankHasAnyClassicResource(state: GameState): boolean {
  if (!usesLimitedBank(state) || !state.bank) return true;
  return (['wood', 'clay', 'wheat', 'sheep', 'ore'] as const).some(
    (r) => (state.bank?.[r] ?? 0) > 0,
  );
}

function deckHasCards(state: GameState, deck: CkUrbanTrack): boolean {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return false;
  return (
    (ck.progressDecks[deck]?.length ?? 0) > 0 ||
    (ck.progressDiscards?.[deck]?.length ?? 0) > 0
  );
}

function scorePillageOption(state: GameState, intersectionId: string): number {
  let score = scoreMetropolisHost(state, '', intersectionId);
  const ck = state.extensions?.citiesKnights;
  if (ck?.walls[intersectionId]) score -= 5;
  return score;
}

function scoreRecruitSpot(state: GameState, playerId: string, intersectionId: string): number {
  let score = scoreMetropolisHost(state, playerId, intersectionId);
  const ck = state.extensions?.citiesKnights;
  const board = state.classicBoard;
  if (board && ck) {
    for (const n of board.topology.intersections[intersectionId]?.neighborIds ?? []) {
      if (board.occupiedIntersections[n] === playerId) score += 4;
    }
    if (state.robberPosition) {
      const tiles = board.topology.intersections[intersectionId]?.tileIds ?? [];
      if (tiles.includes(state.robberPosition)) score += 6;
    }
  }
  return score;
}

/** Trade commodities toward next urban improvement when short. */
function findCommodityBankTrade(
  state: GameState,
  playerId: string,
): CkAIDecision | null {
  const player = state.players.get(playerId);
  const ck = state.extensions?.citiesKnights;
  if (!player || !ck) return null;

  const tracks: CkUrbanTrack[] = ['science', 'politics', 'trade'];
  for (const track of tracks) {
    const level = getUrbanLevel(state, playerId, track);
    if (level >= 5) continue;
    const next = level + 1;
    const need = urbanImproveCostForPlayer(state, playerId, next);
    const commodity = urbanTrackCommodity(track);
    const have = ck.playerCommodities[playerId]?.[commodity] ?? 0;
    if (have >= need) continue;

    const missing = need - have;
    if ((ck.commodityBank[commodity] ?? 0) < missing) continue;

    const giveCandidates = (CLASSIC_RESOURCE_TYPES as readonly ResourceType[])
      .map((r) => [r, player.resources[r] ?? 0] as const)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1]);

    for (const [giveResource] of giveCandidates) {
      const ratio = getPortTradeRatio(player, giveResource, state);
      const giveAmount = missing * ratio;
      if ((player.resources[giveResource] ?? 0) < giveAmount) continue;
      return {
        kind: 'command',
        command: {
          type: 'bank_trade',
          playerId,
          give: { [giveResource]: giveAmount },
          receive: {},
          receiveCommodities: { [commodity]: missing } as Partial<Record<CkCommodity, number>>,
        },
      };
    }
  }
  return null;
}

/** Pendings C&K (hors tour ou en tour). */
export function decideCitiesKnightsPending(
  state: GameState,
  playerId: string,
): CkAIDecision | null {
  if (!isCitiesKnightsEnabled(state)) return null;
  const ck = state.extensions?.citiesKnights;
  if (!ck) return null;

  const aqueduct = ck.pendingResolutions.find(
    (r) => r.kind === 'aqueduct' && r.playerId === playerId,
  );
  if (aqueduct) {
    if (!bankHasAnyClassicResource(state)) return null;
    const resource = chooseAqueductResource(state, playerId);
    if (!resource) return null;
    return {
      kind: 'command',
      command: {
        type: 'ck_aqueduct_choose',
        playerId,
        resource,
      },
    };
  }

  const metro = ck.pendingResolutions.find(
    (r) => r.kind === 'place_metropolis' && r.playerId === playerId,
  );
  if (metro) {
    const track = metro.data?.track as CkUrbanTrack | undefined;
    if (track) {
      const host = chooseBestMetropolisHost(state, playerId, track);
      if (host) {
        return {
          kind: 'command',
          command: {
            type: 'ck_place_metropolis',
            playerId,
            track,
            intersectionId: host,
          },
        };
      }
    }
  }

  const retreat = ck.pendingResolutions.find(
    (r) => r.kind === 'knight_retreat' && r.playerId === playerId,
  );
  if (retreat) {
    const knightId = String(retreat.data?.knightId ?? '');
    if (!knightId) return null;
    const retreatOptions = (retreat.data?.options as string[] | undefined) ?? [];
    const board = state.classicBoard;
    const scored = retreatOptions
      .filter((id) => {
        if (!board) return false;
        if (board.occupiedIntersections[id]) return false;
        if (ck.knights.some((k) => k.intersectionId === id)) return false;
        return true;
      })
      .map((id) => ({ id, score: scoreRecruitSpot(state, playerId, id) }))
      .sort((a, b) => b.score - a.score);
    return {
      kind: 'command',
      command: {
        type: 'ck_resolve_knight_retreat',
        playerId,
        knightId,
        toIntersectionId: scored[0]?.id ?? null,
      },
    };
  }

  const pillage = ck.pendingResolutions.find(
    (r) => r.kind === 'pillage_city' && r.playerId === playerId,
  );
  if (pillage) {
    const options = (pillage.data?.options as string[] | undefined) ?? [];
    const best = [...options].sort(
      (a, b) => scorePillageOption(state, b) - scorePillageOption(state, a),
    )[0];
    if (best) {
      return {
        kind: 'command',
        command: {
          type: 'ck_choose_pillage_city',
          playerId,
          intersectionId: best,
        },
      };
    }
  }

  const progressChoice = ck.pendingResolutions.find(
    (r) => r.kind === 'choose_progress_deck' && r.playerId === playerId,
  );
  if (progressChoice) {
    const levels = ck.urbanLevels[playerId] ?? { trade: 0, politics: 0, science: 0 };
    const preferred: CkUrbanTrack =
      levels.science >= levels.trade && levels.science >= levels.politics
        ? 'science'
        : levels.politics >= levels.trade
          ? 'politics'
          : 'trade';
    const order: CkUrbanTrack[] = [preferred, 'science', 'politics', 'trade'];
    const deck = order.find((d) => deckHasCards(state, d));
    // Decks vides : ne pas muter l'état ici — prune / end_turn nettoient le pending
    if (!deck) return null;
    return {
      kind: 'command',
      command: { type: 'ck_choose_progress_deck', playerId, deck },
    };
  }

  const discard = ck.pendingResolutions.find(
    (r) => r.kind === 'discard_progress' && r.playerId === playerId,
  );
  if (discard) {
    const cardId = chooseProgressDiscardCardId(state, playerId);
    if (cardId) {
      return {
        kind: 'command',
        command: { type: 'ck_discard_progress', playerId, cardId },
      };
    }
  }

  return null;
}

function decideDefenseActions(
  state: GameState,
  playerId: string,
): CkAIDecision | null {
  const player = state.players.get(playerId);
  const ck = state.extensions?.citiesKnights;
  if (!player || !ck) return null;

  ensureKnightStocks(state);
  const myKnights = ck.knights.filter(
    (k) => k.ownerId === playerId && k.intersectionId,
  );

  const inactive = myKnights.find((k) => !k.activated);
  if (inactive && hasResources(player.resources, { wheat: 1 })) {
    return {
      kind: 'command',
      command: { type: 'ck_activate_knight', playerId, knightId: inactive.id },
    };
  }

  if (hasResources(player.resources, { ore: 1, sheep: 1 })) {
    const promotable = myKnights.find(
      (k) => !k.promotedThisTurn && canPromoteKnight(state, playerId, k.rank),
    );
    if (promotable) {
      return {
        kind: 'command',
        command: { type: 'ck_promote_knight', playerId, knightId: promotable.id },
      };
    }
  }

  if (
    hasResources(player.resources, { ore: 1, sheep: 1 }) &&
    (ck.knightStocks[playerId]?.basic ?? 0) > 0
  ) {
    const spots = listKnightRecruitSpots(state, playerId)
      .map((id) => ({ id, score: scoreRecruitSpot(state, playerId, id) }))
      .sort((a, b) => b.score - a.score);
    if (spots[0]) {
      return {
        kind: 'command',
        command: {
          type: 'ck_recruit_knight',
          playerId,
          intersectionId: spots[0].id,
        },
      };
    }
  }

  return null;
}

function decideKnightTactics(
  state: GameState,
  playerId: string,
  options: CkAIOptions,
): CkAIDecision | null {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return null;

  const actionable = ck.knights.filter(
    (k) =>
      k.ownerId === playerId &&
      k.intersectionId &&
      k.activated &&
      !k.activatedThisTurn,
  );

  for (const k of actionable) {
    if (knightCanChaseRobber(state, k.id) && state.robberPosition) {
      return {
        kind: 'command',
        command: {
          type: 'ck_chase_robber',
          playerId,
          knightId: k.id,
          tileId: state.robberPosition,
        },
      };
    }
  }

  for (const k of actionable) {
    const targets = listKnightDisplaceTargets(state, playerId, k.id);
    const best = [...targets].sort((a, b) => b.rank - a.rank)[0];
    if (best) {
      return {
        kind: 'command',
        command: {
          type: 'ck_displace_knight',
          playerId,
          knightId: k.id,
          targetKnightId: best.id,
        },
      };
    }
  }

  if (options.difficulty !== 'easy') {
    for (const k of actionable) {
      const dests = listKnightMoveDestinations(state, playerId, k.id);
      if (dests.length === 0) continue;
      const enemies = ck.knights.filter(
        (e) => e.ownerId !== playerId && e.intersectionId && e.rank < k.rank,
      );
      if (enemies.length === 0) continue;
      const board = state.classicBoard;
      if (!board) continue;
      for (const dest of dests) {
        const neighbors = board.topology.intersections[dest]?.neighborIds ?? [];
        if (
          enemies.some(
            (e) => e.intersectionId && neighbors.includes(e.intersectionId),
          )
        ) {
          return {
            kind: 'command',
            command: {
              type: 'ck_move_knight',
              playerId,
              knightId: k.id,
              toIntersectionId: dest,
            },
          };
        }
      }
    }
  }

  return null;
}

function decideUrbanAndProgress(
  state: GameState,
  playerId: string,
): CkAIDecision | null {
  const player = state.players.get(playerId);
  const ck = state.extensions?.citiesKnights;
  if (!player || !ck) return null;

  const progress = decidePlayProgressCard(state, playerId);
  if (progress) return progress;

  const tracks: CkUrbanTrack[] = ['science', 'politics', 'trade'];
  for (const track of tracks) {
    const level = getUrbanLevel(state, playerId, track);
    const slot = ck.metropolises[track];
    const pendingMetro = ck.pendingResolutions.some(
      (r) =>
        r.kind === 'place_metropolis' &&
        r.playerId === playerId &&
        r.data?.track === track,
    );
    if (pendingMetro || (level >= 4 && !slot.ownerId)) {
      const host = chooseBestMetropolisHost(state, playerId, track);
      if (host) {
        return {
          kind: 'command',
          command: {
            type: 'ck_place_metropolis',
            playerId,
            track,
            intersectionId: host,
          },
        };
      }
    }
    const check = canImproveUrban(state, playerId, track);
    if (check.ok) {
      return {
        kind: 'command',
        command: { type: 'ck_improve_urban', playerId, track },
      };
    }
  }

  const commodityTrade = findCommodityBankTrade(state, playerId);
  if (commodityTrade) return commodityTrade;

  if (playerWallCount(state, playerId) < 3 && hasResources(player.resources, { clay: 2 })) {
    const board = state.classicBoard;
    if (board) {
      for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
        if (owner !== playerId || ck.walls[intersectionId]) continue;
        const bid = board.buildingByIntersection[intersectionId];
        const b = bid ? state.buildings.get(bid) : undefined;
        if (b?.definitionId !== 'city' && b?.definitionId !== 'metropolis') continue;
        return {
          kind: 'command',
          command: { type: 'ck_build_wall', playerId, intersectionId },
        };
      }
    }
  }

  return null;
}

/**
 * Décision C&K en phase player_action (après pendings).
 */
export function decideCitiesKnightsAction(
  state: GameState,
  playerId: string,
  options: CkAIOptions,
): CkAIDecision | null {
  if (!isCitiesKnightsEnabled(state)) return null;
  if (state.turnPhase !== 'player_action') return null;
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) return null;

  const urgent = shouldPrioritizeDefense(state);

  if (urgent) {
    const defense = decideDefenseActions(state, playerId);
    if (defense) return defense;
  }

  const tactics = decideKnightTactics(state, playerId, options);
  if (tactics) return tactics;

  if (!urgent) {
    const player = state.players.get(playerId);
    const ck = state.extensions?.citiesKnights;
    const inactive = ck?.knights.find(
      (k) => k.ownerId === playerId && k.intersectionId && !k.activated,
    );
    if (inactive && player && hasResources(player.resources, { wheat: 1 })) {
      return {
        kind: 'command',
        command: { type: 'ck_activate_knight', playerId, knightId: inactive.id },
      };
    }
  }

  const urban = decideUrbanAndProgress(state, playerId);
  if (urban) return urban;

  if (urgent || options.difficulty === 'legendary' || defenseDeficit(state) > 0) {
    const soft = decideDefenseActions(state, playerId);
    if (soft) return soft;
  }

  return null;
}

/** Alchimiste en start_of_turn. */
export function decideCitiesKnightsAlchemist(
  state: GameState,
  playerId: string,
  risky: boolean,
): CkAIDecision | null {
  if (!isCitiesKnightsEnabled(state) || !risky) return null;
  if (state.turnPhase !== 'start_of_turn') return null;
  const hand = state.extensions?.citiesKnights?.progressHands[playerId] ?? [];
  const alchemist = hand.find((c) => c.type === 'alchemist');
  if (!alchemist) return null;
  const dice = bestAlchemistDice(state, playerId);
  return {
    kind: 'command',
    command: {
      type: 'ck_play_progress',
      playerId,
      cardId: alchemist.id,
      die1: dice.die1,
      die2: dice.die2,
    },
  };
}

/** True si un pending C&K bloque encore la partie (pour le simulateur). */
export function hasBlockingCkPending(state: GameState): boolean {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return false;
  return ck.pendingResolutions.some((r) => {
    if (r.kind === 'place_metropolis') {
      const track = r.data?.track as CkUrbanTrack | undefined;
      if (!track) return false;
      return listFreeMetropolisHosts(state, r.playerId, track).length > 0;
    }
    if (r.kind === 'discard_progress') {
      return (ck.progressHands[r.playerId]?.length ?? 0) > PROGRESS_HAND_LIMIT;
    }
    if (r.kind === 'aqueduct') {
      return bankHasAnyClassicResource(state);
    }
    if (r.kind === 'choose_progress_deck') {
      return (['science', 'politics', 'trade'] as CkUrbanTrack[]).some((d) =>
        deckHasCards(state, d),
      );
    }
    return true;
  });
}

/**
 * Candidats C&K scorés pour fusion L1 (hors urgences défense déjà gérées à part).
 */
export function listCitiesKnightsScoredActions(
  state: GameState,
  playerId: string,
  options: CkAIOptions,
): Array<{ command: GameCommand; score: number; label: string }> {
  if (!isCitiesKnightsEnabled(state)) return [];
  if (state.turnPhase !== 'player_action') return [];
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) return [];
  if (shouldPrioritizeDefense(state)) return [];

  const decision = decideCitiesKnightsAction(state, playerId, options);
  if (!decision) return [];
  const type = decision.command.type;
  let score = 52;
  if (type.startsWith('ck_improve') || type === 'ck_place_metropolis') score = 62;
  if (type === 'ck_recruit_knight' || type === 'ck_promote_knight') score = 58;
  if (type === 'ck_activate_knight') score = 54;
  if (type === 'ck_play_progress') score = 56;
  return [{ command: decision.command, score, label: `ck:${type}` }];
}

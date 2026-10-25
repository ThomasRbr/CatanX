import type { GameCommand } from '@catanx/protocol';
import { GameState } from '../../../types/game';
import { AIDifficulty, DevelopmentCard } from '../../../types/player';
import { BuildingId } from '../../../types/buildings';
import { ResourceBundle, ResourceType } from '../../../types/resources';
import { randomChoice, randomFloat } from '../../../core/rng';
import {
  canBuild,
  checkVictory,
  constructClassicBuilding,
  recalculateVP,
  validateSetupPlacement,
} from '../../game/GameEngine';
import {
  getPortTradeRatio,
  hasResources,
  totalResources,
  playerUsesGenericPortOnly,
} from '../../resources/ResourceSystem';
import { getSeasonalTradeRatioModifier, applySeasonalBuildCost } from '../../seasons/costs';
import {
  usesLimitedBank,
  usesTopologicalPlacement,
  totalClassicResources,
  CLASSIC_RESOURCE_TYPES,
} from '../../catan/ClassicBoard';
import {
  listClassicCityCandidates,
  listClassicRoadCandidates,
  listClassicSettlementCandidates,
} from '../../catan/ClassicCommands';
import { isCitiesKnightsEnabled } from '../../../core/extensions';
import { playerCommodityHandSize } from '../../citiesKnights/commodities';
import type { CkCommodityBundle } from '../../../types/citiesKnights';
import { CK_COMMODITIES } from '../../../types/citiesKnights';
import { isBlockedByEnemyKnight } from '../../citiesKnights/knights';
import {
  decideCitiesKnightsPending,
  decideCitiesKnightsAction,
  decideCitiesKnightsAlchemist,
  hasBlockingCkPending,
  shouldPrioritizeDefense,
} from '../../citiesKnights/CitiesKnightsAI';
import { canChoosePreparation } from '../../seasons/preparations';
import { chooseSeasonPreparationForAI } from '../shared/SeasonBias';
import { chooseUndergroundSkyAction } from '../../undergroundSky/ai';
import { choosePactsEmbassiesAction } from '../../pactsEmbassies/ai';
import {
  chooseClassicSetupEdge,
  chooseClassicSetupIntersection,
  ClassicSetupContext,
} from './ClassicSetupAI';
import { isClassicLandTerrain } from '../../catan/CatanTopology';
import {
  shouldTakeRiskyAction,
  pickSuboptimal,
  getDifficultyPolicy,
} from '../shared/DifficultyPolicy';
import { evaluatePosition } from '../shared/PositionEvaluator';
import { setAiRationale } from '../shared/AiRationale';
import {
  BUILD_COSTS,
  DEV_CARD_COST,
  listLegalScoredActions,
  missingResourcesForCost,
} from '../shared/CandidateGen';
import {
  computeExpansionPlan,
  roadPlanBonus,
} from '../shared/ExpansionPlan';
import { projectHorizon } from '../shared/HorizonPlan';
import { victoryRaceBuildBonus } from '../shared/VictoryRace';
import { planTurnAction } from '../shared/TurnPlanner';
import {
  boundedChooseBestTile,
  listScoredRobberTiles,
  playersTouchingTile,
} from '../shared/BoundedSearch';
import { snapshotTrophyThreat } from '../shared/TrophyThreat';
import {
  hasProposedPlayerTradeThisTurn,
  markPlayerTradeOffered,
  wasPlayerTradeRejected,
} from '../shared/AiMemory';

export type ClassicAIDecision =
  | { kind: 'command'; command: GameCommand }
  | { kind: 'build'; tileId: string; buildingId: BuildingId }
  | { kind: 'setup_intersection'; intersectionId: string }
  | { kind: 'setup_road'; edgeId: string };

export interface ClassicAIOptions {
  difficulty: AIDifficulty;
  /** @deprecated Prefer commandes setup_place_* ; conservé pour compat UI. */
  setup?: ClassicSetupContext;
}

function diceWeight(value: number | null): number {
  if (!value) return 0;
  return 6 - Math.abs(7 - value);
}

function tileProductionScore(tileId: string, state: GameState): number {
  const tile = state.map.get(tileId);
  if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') return 0;
  return diceWeight(tile.diceValue) + (tile.port ? 2 : 0);
}

/** Strategic discard: dump surplus while protecting resources needed for the best pending plan. */
function buildDiscardBundle(
  state: GameState,
  playerId: string,
  resources: ResourceBundle,
  required: number,
  classicOnly = false,
): Partial<Record<ResourceType, number>> {
  const discard: Partial<Record<ResourceType, number>> = {};
  let remaining = required;

  const protect = new Set<ResourceType>();
  const threat = snapshotTrophyThreat(state, playerId);
  const player = state.players.get(playerId);
  if (player) {
    const cityNeed = !hasResources(player.resources, BUILD_COSTS.city);
    const settleNeed = !hasResources(player.resources, BUILD_COSTS.settlement);
    if (cityNeed || threat.vpGapToWin <= 4) {
      protect.add('ore');
      protect.add('wheat');
    }
    if (settleNeed) {
      protect.add('wood');
      protect.add('clay');
      protect.add('wheat');
      protect.add('sheep');
    }
    if (!isCitiesKnightsEnabled(state)) protect.add('sheep');
  }

  const sorted = (Object.entries(resources) as [ResourceType, number][])
    .filter(([resource, amount]) => {
      if (amount <= 0) return false;
      if (!classicOnly) return true;
      return (CLASSIC_RESOURCE_TYPES as readonly string[]).includes(resource);
    })
    .map(([resource, amount]) => {
      // Prefer discarding unprotected surplus first
      const priority = protect.has(resource) ? amount * 0.35 : amount * 1.0;
      return [resource, amount, priority] as const;
    })
    .sort((a, b) => b[2] - a[2]);

  // Pass 1: discard by priority (unprotected surplus first). Never skip cards if needed.
  for (const [resource, amount] of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(amount - (discard[resource] ?? 0), remaining);
    if (take <= 0) continue;
    discard[resource] = (discard[resource] ?? 0) + take;
    remaining -= take;
  }

  return discard;
}

function buildCommodityDiscardBundle(
  commodities: CkCommodityBundle,
  required: number,
): CkCommodityBundle {
  const discard: CkCommodityBundle = {};
  let remaining = required;
  const sorted = CK_COMMODITIES.map((c) => [c, commodities[c] ?? 0] as const)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [commodity, amount] of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(amount, remaining);
    discard[commodity] = take;
    remaining -= take;
  }
  return discard;
}

function handSizeForDiscard(state: GameState, playerId: string): number {
  const player = state.players.get(playerId);
  if (!player) return 0;
  const resources = usesLimitedBank(state)
    ? totalClassicResources(player.resources)
    : totalResources(player.resources);
  return resources + playerCommodityHandSize(state, playerId);
}

function buildSevenDiscardCommand(state: GameState, playerId: string): GameCommand {
  const player = state.players.get(playerId)!;
  const required = Math.floor(handSizeForDiscard(state, playerId) / 2);
  if (required <= 0) {
    return { type: 'discard_resources', playerId, resources: {} };
  }

  const resources = buildDiscardBundle(
    state,
    playerId,
    player.resources,
    required,
    usesLimitedBank(state),
  ) as Record<string, number>;
  let resourceCount = Object.values(resources).reduce((s, n) => s + (n ?? 0), 0);
  let commodities: CkCommodityBundle | undefined;

  if (resourceCount < required && isCitiesKnightsEnabled(state)) {
    const hand = state.extensions?.citiesKnights?.playerCommodities[playerId] ?? {};
    commodities = buildCommodityDiscardBundle(hand, required - resourceCount);
    const commodityCount = Object.values(commodities).reduce((s, n) => s + (n ?? 0), 0);
    resourceCount += commodityCount;
  }

  // Last resort: if still short, strip protection and dump largest classic piles
  if (resourceCount < required) {
    const need = required - resourceCount;
    const sorted = (Object.entries(player.resources) as [ResourceType, number][])
      .filter(([r, n]) => {
        if (n <= 0) return false;
        if (!usesLimitedBank(state)) return true;
        return (CLASSIC_RESOURCE_TYPES as readonly string[]).includes(r);
      })
      .map(([r, n]) => [r, n - (resources[r] ?? 0)] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    let left = need;
    for (const [r, n] of sorted) {
      if (left <= 0) break;
      const take = Math.min(n, left);
      resources[r] = (resources[r] ?? 0) + take;
      left -= take;
    }
  }

  return {
    type: 'discard_resources',
    playerId,
    resources,
    ...(commodities && Object.keys(commodities).length > 0 ? { commodities } : {}),
  };
}

function listTileBuildCandidates(
  state: GameState,
  playerId: string,
): Array<{ tileId: string; buildingId: BuildingId; score: number }> {
  const player = state.players.get(playerId);
  if (!player) return [];

  const candidates: Array<{ tileId: string; buildingId: BuildingId; score: number }> = [];

  for (const tileId of player.settlements) {
    const verdict = canBuild({ playerId, buildingType: 'city', tileId }, state);
    if (verdict.can) {
      candidates.push({ tileId, buildingId: 'city', score: 90 + tileProductionScore(tileId, state) });
    }
  }

  for (const tileId of player.ownedTiles) {
    const verdict = canBuild({ playerId, buildingType: 'settlement', tileId }, state);
    if (verdict.can) {
      candidates.push({
        tileId,
        buildingId: 'settlement',
        score: 60 + tileProductionScore(tileId, state),
      });
    }
  }

  for (const tileId of player.ownedTiles) {
    const tile = state.map.get(tileId);
    if (!tile || tile.road) continue;
    const verdict = canBuild({ playerId, buildingType: 'road', tileId }, state);
    if (verdict.can) {
      candidates.push({ tileId, buildingId: 'road', score: 35 + tileProductionScore(tileId, state) });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

type TopoBuildCandidate =
  | { buildingId: 'city'; intersectionId: string; score: number; cost: ResourceBundle }
  | { buildingId: 'settlement'; intersectionId: string; score: number; cost: ResourceBundle }
  | { buildingId: 'road'; edgeId: string; score: number; cost: ResourceBundle };

function listClassicTopoBuildCandidates(
  state: GameState,
  playerId: string,
): TopoBuildCandidate[] {
  const threat = snapshotTrophyThreat(state, playerId);
  const plan = computeExpansionPlan(state, playerId);
  const horizon = projectHorizon(state, playerId, 3);
  const cities = listClassicCityCandidates(state, playerId).map((c) => ({
    buildingId: 'city' as const,
    intersectionId: c.intersectionId,
    score:
      c.score +
      (threat.vpGapToWin <= 3 ? 15 : 0) +
      victoryRaceBuildBonus(state, playerId, 'city', horizon),
    cost: applySeasonalBuildCost(state, playerId, 'city', BUILD_COSTS.city),
  }));
  const settlements = listClassicSettlementCandidates(state, playerId).map((c) => ({
    buildingId: 'settlement' as const,
    intersectionId: c.intersectionId,
    score:
      c.score +
      (threat.longestRoadPressure > 0 ? 5 : 0) +
      (plan.targetIntersectionId === c.intersectionId ? 20 : 0) +
      victoryRaceBuildBonus(state, playerId, 'settlement', horizon),
    cost: applySeasonalBuildCost(state, playerId, 'settlement', BUILD_COSTS.settlement),
  }));
  const roads = listClassicRoadCandidates(state, playerId).map((c) => {
    const bonus = roadPlanBonus(state, playerId, c.edgeId, plan);
    return {
      buildingId: 'road' as const,
      edgeId: c.edgeId,
      score:
        c.score * 0.35 +
        bonus +
        victoryRaceBuildBonus(state, playerId, 'road', horizon),
      cost: applySeasonalBuildCost(state, playerId, 'road', BUILD_COSTS.road, {
        useWorks: true,
      }),
    };
  });
  // Filtrer les routes hors plan quand on focus un village ;
  // toujours garder la prochaine arête du chemin.
  const filteredRoads = plan.focusSettlement
    ? roads.filter(
        (r) =>
          r.edgeId === plan.nextEdgeId ||
          (plan.nextEdgeId == null && r.score >= 15) ||
          (plan.nextEdgeId != null && r.score >= 40),
      )
    : roads;
  return [...cities, ...settlements, ...filteredRoads].sort((a, b) => b.score - a.score);
}

function findPlayerTradeOffer(
  state: GameState,
  playerId: string,
): {
  toPlayerId: string | null;
  give: ResourceBundle;
  receive: ResourceBundle;
} | null {
  const player = state.players.get(playerId);
  if (!player) return null;

  const horizon = projectHorizon(state, playerId, 3);
  const builds = listClassicTopoBuildCandidates(state, playerId);
  const preferred = builds.filter((b) => {
    if (horizon.focus === 'city') return b.buildingId === 'city';
    if (horizon.focus === 'settlement') return b.buildingId === 'settlement';
    if (horizon.focus === 'road_path' || horizon.focus === 'longest_road') {
      return b.buildingId === 'road';
    }
    return true;
  });
  const targetBuild =
    preferred.find((b) => !hasResources(player.resources, b.cost)) ??
    builds.find((b) => !hasResources(player.resources, b.cost)) ??
    null;

  let wantList: ResourceType[] = [];
  let wantAmounts: Partial<Record<ResourceType, number>> = {};
  if (targetBuild) {
    const missing = missingResourcesForCost(player.resources, targetBuild.cost);
    wantAmounts = missing;
    wantList = (Object.keys(missing) as ResourceType[]).sort(
      (a, b) => (missing[b] ?? 0) - (missing[a] ?? 0),
    );
  }
  if (wantList.length === 0) {
    wantList = (CLASSIC_RESOURCE_TYPES as readonly ResourceType[]).filter(
      (resource) => (player.resources[resource] ?? 0) === 0,
    );
    for (const r of wantList) wantAmounts[r] = 1;
  }
  if (wantList.length === 0) return null;

  const surplus = (CLASSIC_RESOURCE_TYPES as readonly ResourceType[])
    .filter((resource) => {
      if (wantList.includes(resource)) return false;
      const have = player.resources[resource] ?? 0;
      if (targetBuild && (targetBuild.cost[resource] ?? 0) > 0) {
        return have > (targetBuild.cost[resource] ?? 0) + 1;
      }
      return have >= 3;
    })
    .sort((a, b) => (player.resources[b] ?? 0) - (player.resources[a] ?? 0));

  if (surplus.length === 0) return null;

  const giveRes = surplus[0]!;
  const rawGive = (player.resources[giveRes] ?? 0) - (targetBuild?.cost[giveRes] ?? 0) - 1;
  const giveAmt = Math.min(2, Math.max(1, rawGive));

  for (const wantRes of wantList) {
    const needAmt = Math.min(2, Math.max(1, wantAmounts[wantRes] ?? 1));
    const threat = snapshotTrophyThreat(state, playerId);
    const partners = [...state.players.values()]
      .filter(
        (candidate) =>
          candidate.id !== playerId &&
          !candidate.isEliminated &&
          (candidate.resources[wantRes] ?? 0) >= needAmt &&
          !(
            threat.vpGapToWin <= 3 &&
            candidate.stats.victoryPoints >= threat.leaderVp &&
            threat.leaderGap >= 1
          ),
      )
      .sort((a, b) => (a.stats.victoryPoints ?? 0) - (b.stats.victoryPoints ?? 0));

    if (partners.length === 0) continue;

    const give: ResourceBundle = { [giveRes]: giveAmt };
    const receive: ResourceBundle = { [wantRes]: needAmt };

    // Multi-card: if we still miss a second type and have more surplus, offer 1+1
    if (wantList.length > 1 && surplus.length > 1 && giveAmt === 1 && needAmt === 1) {
      const secondWant = wantList[1]!;
      const secondGive = surplus[1]!;
      if (
        partners.some((p) => (p.resources[secondWant] ?? 0) > 0) &&
        (player.resources[secondGive] ?? 0) >= 2
      ) {
        give[secondGive] = 1;
        receive[secondWant] = 1;
      }
    }

    const isSimpleOneToOne =
      Object.keys(give).length === 1 && Object.keys(receive).length === 1;

    // Broadcast si plusieurs partenaires ont la ressource (offre simple)
    if (partners.length >= 2 && isSimpleOneToOne) {
      if (!wasPlayerTradeRejected(state, playerId, '*', give, receive)) {
        return { toPlayerId: null, give, receive };
      }
    }

    for (const partner of partners) {
      if (wasPlayerTradeRejected(state, playerId, partner.id, give, receive)) {
        continue;
      }
      return {
        toPlayerId: partner.id,
        give,
        receive,
      };
    }
  }

  return null;
}

function findBankTrade(
  state: GameState,
  playerId: string,
  targetCost: ResourceBundle,
): { give: ResourceBundle; receive: ResourceBundle } | null {
  const player = state.players.get(playerId);
  if (!player) return null;

  const missing = (Object.keys(targetCost) as ResourceType[]).find(
    (resource) => (player.resources[resource] ?? 0) < (targetCost[resource] ?? 0),
  );
  if (!missing) return null;

  const receiveAmount = (targetCost[missing] ?? 0) - (player.resources[missing] ?? 0);
  if (receiveAmount <= 0) return null;

  const giveCandidates = (Object.entries(player.resources) as [ResourceType, number][])
    .filter(([resource, amount]) => resource !== missing && amount >= 2)
    .sort((a, b) => b[1] - a[1]);

  for (const [giveResource] of giveCandidates) {
    const baseRatio = getPortTradeRatio(player, giveResource, state);
    const isGeneric = playerUsesGenericPortOnly(player, giveResource, state);
    const ratio = getSeasonalTradeRatioModifier(state, playerId, baseRatio, {
      useCommerce: true,
      isGenericPort: isGeneric,
    });
    const giveAmount = receiveAmount * ratio;
    if ((player.resources[giveResource] ?? 0) < giveAmount) continue;
    if (usesLimitedBank(state) && (state.bank?.[missing] ?? 0) < receiveAmount) continue;

    return {
      give: { [giveResource]: giveAmount },
      receive: { [missing]: receiveAmount },
    };
  }

  return null;
}

/** Prefer bank trade that unlocks the highest-scored affordable build after trade. */
function findBestBankTradeForBuilds(
  state: GameState,
  playerId: string,
  builds: TopoBuildCandidate[],
): { give: ResourceBundle; receive: ResourceBundle } | null {
  const before = evaluatePosition(state, playerId);
  const horizon = projectHorizon(state, playerId, 3);
  let best: { give: ResourceBundle; receive: ResourceBundle; score: number } | null = null;
  for (const build of builds.slice(0, 6)) {
    if (hasResources(state.players.get(playerId)!.resources, build.cost)) continue;
    const trade = findBankTrade(state, playerId, build.cost);
    if (!trade) continue;
    let align = 0;
    if (horizon.focus === 'city' && build.buildingId === 'city') align = 40;
    else if (horizon.focus === 'settlement' && build.buildingId === 'settlement') align = 35;
    else if (
      (horizon.focus === 'road_path' || horizon.focus === 'longest_road') &&
      build.buildingId === 'road'
    ) {
      align = 20;
    }
    const score = build.score + align + before * 0.01;
    if (!best || score > best.score) best = { ...trade, score };
  }
  return best ? { give: best.give, receive: best.receive } : null;
}

function chooseRobberTile(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty,
): string | null {
  const scored = listScoredRobberTiles(state, playerId);
  if (scored.length === 0) {
    const fallback = [...state.map.keys()].filter((id) => {
      const t = state.map.get(id);
      return t && isClassicLandTerrain(t.terrain) && t.terrain !== 'desert' && id !== state.robberPosition;
    });
    return randomChoice(fallback) ?? null;
  }

  const policy = getDifficultyPolicy(difficulty);
  if (policy.useBoundedSearch) {
    return (
      boundedChooseBestTile(state, playerId, {
        difficulty,
        candidates: scored.map((s) => s.tileId),
      }) ?? scored[0]!.tileId
    );
  }

  return (
    pickSuboptimal(
      scored.map((s) => s.tileId),
      difficulty,
    ) ?? scored[0]!.tileId
  );
}

function chooseStealTarget(
  state: GameState,
  playerId: string,
  tileId: string | null,
  difficulty: AIDifficulty,
): string | null {
  if (state.sevenFlow?.stealCandidates.length) {
    const ranked = [...state.sevenFlow.stealCandidates].sort(
      (a, b) =>
        (state.players.get(b)?.stats.victoryPoints ?? 0) -
        (state.players.get(a)?.stats.victoryPoints ?? 0),
    );
    return pickSuboptimal(ranked, difficulty) ?? null;
  }
  if (!tileId) return null;
  const candidates = playersTouchingTile(state, tileId, playerId).sort(
    (a, b) =>
      (state.players.get(b)?.stats.victoryPoints ?? 0) -
      (state.players.get(a)?.stats.victoryPoints ?? 0),
  );
  return pickSuboptimal(candidates, difficulty) ?? null;
}

function estimateOpenProduction(
  state: GameState,
  resource: ResourceType,
  excludePlayerId: string,
): number {
  let total = 0;
  for (const [, tile] of state.map) {
    if (!isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') continue;
    if (!(tile.baseProduction?.[resource] ?? 0)) continue;
    if (tile.id === state.robberPosition) continue;
    const touchers = playersTouchingTile(state, tile.id, excludePlayerId);
    if (touchers.length === 0) continue;
    total += diceWeight(tile.diceValue) * touchers.length;
  }
  return total;
}

function decidePlayDevCard(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty,
): ClassicAIDecision | null {
  if (isCitiesKnightsEnabled(state)) return null;
  const player = state.players.get(playerId);
  if (!player) return null;
  if (player.devCardsPlayedThisTurn > 0) return null;

  const playable = player.devCards.filter(
    (card: DevelopmentCard) =>
      !card.played &&
      card.acquiredTurn !== state.currentTurn &&
      card.type !== 'victory_point',
  );
  if (playable.length === 0) return null;

  const knight = playable.find((c) => c.type === 'knight');
  const yop = playable.find((c) => c.type === 'year_of_plenty');
  const monopoly = playable.find((c) => c.type === 'monopoly');
  const roads = playable.find((c) => c.type === 'road_building');

  // Year of Plenty: unlock best build
  if (yop && shouldTakeRiskyAction(difficulty)) {
    const builds = listClassicTopoBuildCandidates(state, playerId);
    const target = builds.find((b) => !hasResources(player.resources, b.cost));
    if (target) {
      const missing: ResourceType[] = [];
      for (const r of CLASSIC_RESOURCE_TYPES) {
        const need = (target.cost[r] ?? 0) - (player.resources[r] ?? 0);
        for (let i = 0; i < need; i++) missing.push(r);
      }
      while (missing.length < 2) missing.push('wheat');
      const pair = `${missing[0]}:${missing[1]}`;
      return {
        kind: 'command',
        command: {
          type: 'play_dev_card',
          playerId,
          cardId: yop.id,
          targetTileId: pair,
        },
      };
    }
  }

  // Monopoly: resource with highest open production among opponents
  if (monopoly && shouldTakeRiskyAction(difficulty)) {
    let bestRes: ResourceType = 'ore';
    let bestScore = -1;
    for (const r of CLASSIC_RESOURCE_TYPES) {
      const score = estimateOpenProduction(state, r, playerId);
      if (score > bestScore) {
        bestScore = score;
        bestRes = r;
      }
    }
    if (bestScore > 0) {
      return {
        kind: 'command',
        command: {
          type: 'play_dev_card',
          playerId,
          cardId: monopoly.id,
          targetTileId: bestRes,
        },
      };
    }
  }

  // Road building when a settlement path exists
  if (roads && shouldTakeRiskyAction(difficulty)) {
    const settle = listClassicSettlementCandidates(state, playerId);
    if (settle.length > 0 || snapshotTrophyThreat(state, playerId).longestRoadPressure > 0) {
      return {
        kind: 'command',
        command: { type: 'play_dev_card', playerId, cardId: roads.id },
      };
    }
  }

  if (knight && shouldTakeRiskyAction(difficulty)) {
    const tileId = chooseRobberTile(state, playerId, difficulty);
    const stealTarget = tileId
      ? chooseStealTarget(state, playerId, tileId, difficulty)
      : null;
    if (tileId) {
      return {
        kind: 'command',
        command: {
          type: 'play_dev_card',
          playerId,
          cardId: knight.id,
          targetPlayerId: stealTarget,
          targetTileId: tileId,
        },
      };
    }
  }

  return null;
}

function decideAcceptTrade(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty,
): ClassicAIDecision {
  const player = state.players.get(playerId)!;
  const pending = state.pendingPlayerTrade!;
  if (!hasResources(player.resources, pending.receive)) {
    return {
      kind: 'command',
      command: { type: 'reject_player_trade', playerId, tradeId: pending.id },
    };
  }

  const policy = getDifficultyPolicy(difficulty);
  if (policy.smartTradeAccept) {
    const from = state.players.get(pending.fromPlayerId);
    const threat = snapshotTrophyThreat(state, playerId);
    if (from && from.stats.victoryPoints >= threat.leaderVp && threat.leaderGap >= 2) {
      return {
        kind: 'command',
        command: { type: 'reject_player_trade', playerId, tradeId: pending.id },
      };
    }

    const before = evaluatePosition(state, playerId);
    // Évalue le swap sans cloner tout l’état (Maps / extensions fragiles avec structuredClone).
    const saved = { ...player.resources };
    for (const [k, n] of Object.entries(pending.receive)) {
      player.resources[k as ResourceType] = (player.resources[k as ResourceType] ?? 0) - (n ?? 0);
    }
    for (const [k, n] of Object.entries(pending.give)) {
      player.resources[k as ResourceType] = (player.resources[k as ResourceType] ?? 0) + (n ?? 0);
    }
    const after = evaluatePosition(state, playerId);
    player.resources = saved;

    const gainUseful = (CLASSIC_RESOURCE_TYPES as readonly ResourceType[]).some(
      (r) => (pending.give[r] ?? 0) > 0 && (saved[r] ?? 0) === 0,
    );
    // Ne pas nourrir un leader en course finale même si Δeval est neutre
    const feedsLeader =
      Boolean(from) &&
      from!.stats.victoryPoints >= threat.victoryTarget - 2 &&
      (CLASSIC_RESOURCE_TYPES as readonly ResourceType[]).some(
        (r) => (pending.receive[r] ?? 0) > 0 && (from!.resources[r] ?? 0) === 0,
      );
    const accept =
      !feedsLeader && after + (gainUseful ? 1.5 : 0) >= before - 0.25;
    return {
      kind: 'command',
      command: accept
        ? { type: 'accept_player_trade', playerId, tradeId: pending.id }
        : { type: 'reject_player_trade', playerId, tradeId: pending.id },
    };
  }

  const accept = randomFloat(0, 1) < policy.blindAcceptRate;
  return {
    kind: 'command',
    command: accept
      ? { type: 'accept_player_trade', playerId, tradeId: pending.id }
      : { type: 'reject_player_trade', playerId, tradeId: pending.id },
  };
}

function chooseEngineSetupTile(state: GameState, playerId: string): string | null {
  const candidates = [...state.map.keys()]
    .filter((tileId) => validateSetupPlacement(playerId, tileId, state).valid)
    .map((tileId) => ({
      tileId,
      score: tileProductionScore(tileId, state),
    }))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.tileId ?? null;
}

function decideClassicSetupCommand(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty,
  setupOverride?: ClassicSetupContext,
): ClassicAIDecision | null {
  if (!state.classicBoard && !setupOverride) return null;
  const board = state.classicBoard;
  const setupCtx: ClassicSetupContext = setupOverride ?? {
    topology: board!.topology,
    occupiedIntersections: board!.occupiedIntersections,
    anchorUsageByTile: board!.anchorUsageByTile,
    anchorIntersectionId: board!.setupLastIntersectionId,
    roadsByEdge: board!.roadsByEdge,
  };

  const needsSettlement = setupOverride
    ? setupOverride.anchorIntersectionId === null
    : board?.setupStep === 'settlement';

  if (needsSettlement) {
    const intersectionId = chooseClassicSetupIntersection(state, setupCtx, {
      playerId,
      difficulty,
    });
    return intersectionId
      ? {
          kind: 'command',
          command: { type: 'setup_place_settlement', playerId, intersectionId },
        }
      : null;
  }

  const edgeId = chooseClassicSetupEdge(state, {
    ...setupCtx,
    anchorIntersectionId:
      setupCtx.anchorIntersectionId ?? board?.setupLastIntersectionId ?? null,
  });
  return edgeId
    ? { kind: 'command', command: { type: 'setup_place_road', playerId, edgeId } }
    : null;
}

function decideTopoBuilds(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty,
): ClassicAIDecision | null {
  const player = state.players.get(playerId)!;
  const policy = getDifficultyPolicy(difficulty);
  const plan = computeExpansionPlan(state, playerId);

  let topoBuilds = listClassicTopoBuildCandidates(state, playerId);
  if (isCitiesKnightsEnabled(state)) {
    topoBuilds = topoBuilds.filter((b) => {
      if (b.buildingId === 'road') return true;
      return !isBlockedByEnemyKnight(state, b.intersectionId, playerId);
    });
  }

  // Si le village cible est déjà adjacent : prioriser village / trade, pas de route parasite.
  if (plan.focusSettlement && plan.pathLength === 0) {
    const settleFirst = [
      ...topoBuilds.filter((b) => b.buildingId === 'city'),
      ...topoBuilds.filter((b) => b.buildingId === 'settlement'),
      ...topoBuilds.filter((b) => b.buildingId === 'road' && b.edgeId === plan.nextEdgeId),
    ];
    topoBuilds = settleFirst.length > 0 ? settleFirst : topoBuilds;
  } else if (plan.nextEdgeId) {
    // Mettre la prochaine route du plan en tête (après villes/villages abordables).
    const nextRoad = topoBuilds.find(
      (b) => b.buildingId === 'road' && b.edgeId === plan.nextEdgeId,
    );
    const rest = topoBuilds.filter(
      (b) => !(b.buildingId === 'road' && b.edgeId === plan.nextEdgeId),
    );
    const citiesAndSettles = rest.filter((b) => b.buildingId !== 'road');
    const otherRoads = rest.filter((b) => b.buildingId === 'road');
    topoBuilds = [
      ...citiesAndSettles,
      ...(nextRoad ? [nextRoad] : []),
      // Routes hors plan seulement si pas focus settlement
      ...(plan.focusSettlement ? [] : otherRoads),
    ];
  }

  for (const candidate of topoBuilds) {
    if (!shouldTakeRiskyAction(difficulty) && difficulty === 'easy') continue;

    const pick =
      difficulty === 'easy' ? pickSuboptimal([candidate, ...topoBuilds], difficulty) : candidate;
    if (!pick) continue;

    if (
      hasResources(player.resources, pick.cost) ||
      (pick.buildingId === 'road' && (player.freeRoadsRemaining ?? 0) > 0)
    ) {
      if (pick.buildingId === 'city') {
        return {
          kind: 'command',
          command: { type: 'upgrade_city', playerId, intersectionId: pick.intersectionId },
        };
      }
      if (pick.buildingId === 'settlement') {
        return {
          kind: 'command',
          command: {
            type: 'build_settlement',
            playerId,
            intersectionId: pick.intersectionId,
          },
        };
      }
      return {
        kind: 'command',
        command: { type: 'build_road', playerId, edgeId: pick.edgeId },
      };
    }

    if (policy.allowBankTrades) {
      const trade = findBankTrade(state, playerId, pick.cost);
      if (trade) {
        return {
          kind: 'command',
          command: {
            type: 'bank_trade',
            playerId,
            give: trade.give,
            receive: trade.receive,
          },
        };
      }
    }

    if (difficulty === 'easy') break;
  }

  if (policy.allowBankTrades) {
    // Prefer trading toward settlement/city when expanding
    const priority = plan.focusSettlement
      ? topoBuilds.filter((b) => b.buildingId === 'settlement' || b.buildingId === 'city')
      : topoBuilds;
    const bestTrade = findBestBankTradeForBuilds(
      state,
      playerId,
      priority.length > 0 ? priority : topoBuilds,
    );
    if (bestTrade) {
      return {
        kind: 'command',
        command: {
          type: 'bank_trade',
          playerId,
          give: bestTrade.give,
          receive: bestTrade.receive,
        },
      };
    }
  }

  return null;
}

export function decideClassicAI(
  state: GameState,
  playerId: string,
  options: ClassicAIOptions,
): ClassicAIDecision | null {
  const player = state.players.get(playerId);
  if (!player) return null;
  const difficulty = options.difficulty;
  const policy = getDifficultyPolicy(difficulty);

  const ckPending = decideCitiesKnightsPending(state, playerId);
  if (ckPending) {
    setAiRationale({
      playerId,
      difficulty,
      layer: 'pending',
      summary: `C&K pending ${ckPending.command.type}`,
    });
    return ckPending;
  }

  // Préparation saisonnière (non bloquante) — avant builds / end_turn
  if (canChoosePreparation(state, playerId)) {
    const prep = chooseSeasonPreparationForAI(state, playerId);
    const seasons = state.extensions?.seasons;
    const needsUpdate =
      !seasons?.preparationReady[playerId] ||
      (seasons.springPrepPending
        ? seasons.preparations[playerId] !== prep
        : seasons.nextPreparations[playerId] !== prep);
    if (needsUpdate) {
      setAiRationale({
        playerId,
        difficulty,
        layer: 'L0',
        summary: `seasons prep ${prep}`,
      });
      return {
        kind: 'command',
        command: {
          type: 'seasons_choose_preparation',
          playerId,
          preparation: prep,
        },
      };
    }
  }

  const pending = state.pendingPlayerTrade;
  if (pending) {
    const isTarget =
      pending.fromPlayerId !== playerId &&
      !(pending.rejectedBy ?? []).includes(playerId) &&
      (pending.toPlayerId === playerId || pending.toPlayerId === null);
    if (isTarget) {
      const decision = decideAcceptTrade(state, playerId, difficulty);
      setAiRationale({
        playerId,
        difficulty,
        layer: 'L0',
        summary:
          decision.kind === 'command'
            ? `trade reply ${decision.command.type}`
            : 'trade reply',
      });
      return decision;
    }
    if (pending.fromPlayerId === playerId) {
      return null;
    }
  }

  if (state.phase === 'setup') {
    if (usesTopologicalPlacement(state)) {
      const setup = decideClassicSetupCommand(state, playerId, difficulty, options.setup);
      if (setup?.kind === 'command') {
        setAiRationale({
          playerId,
          difficulty,
          layer: policy.useBoundedSearch ? 'L2' : 'L0',
          summary: `setup ${setup.command.type}`,
        });
      }
      return setup;
    }
    const tileId = chooseEngineSetupTile(state, playerId);
    return tileId
      ? { kind: 'command', command: { type: 'setup_placement', playerId, tileId } }
      : null;
  }

  if (state.turnPhase === 'start_of_turn') {
    const alchemist = decideCitiesKnightsAlchemist(
      state,
      playerId,
      shouldTakeRiskyAction(difficulty),
    );
    if (alchemist) {
      setAiRationale({
        playerId,
        difficulty,
        layer: 'L0',
        summary: 'alchemist',
      });
      return alchemist;
    }
    return { kind: 'command', command: { type: 'roll_dice', playerId } };
  }

  if (state.turnPhase === 'discard_resources' && state.sevenFlow) {
    return {
      kind: 'command',
      command: buildSevenDiscardCommand(state, playerId),
    };
  }

  if (state.turnPhase === 'resource_collect') {
    return { kind: 'command', command: { type: 'acknowledge_collection', playerId } };
  }

  if (state.turnPhase === 'move_robber') {
    const tileId = chooseRobberTile(state, playerId, difficulty);
    if (!tileId) return null;
    setAiRationale({
      playerId,
      difficulty,
      layer: policy.useBoundedSearch ? 'L2' : 'L0',
      summary: `robber → ${tileId}`,
    });
    return { kind: 'command', command: { type: 'move_robber', playerId, tileId } };
  }

  if (state.turnPhase === 'steal_resource' && state.sevenFlow) {
    const target = chooseStealTarget(state, playerId, state.robberPosition, difficulty);
    return {
      kind: 'command',
      command: { type: 'steal_resource', playerId, targetPlayerId: target },
    };
  }

  if (state.turnPhase !== 'player_action') return null;

  // Urgences extensions (softlock / tempo critique) avant L1 unifié
  const usUrgent = chooseUndergroundSkyAction(state, playerId, {
    difficulty,
    urgentOnly: true,
  });
  if (usUrgent) {
    setAiRationale({
      playerId,
      difficulty,
      layer: 'L0',
      summary: `US urgent ${usUrgent.type}`,
    });
    return { kind: 'command', command: usUrgent };
  }

  const peUrgent = choosePactsEmbassiesAction(state, playerId, {
    difficulty,
    urgentOnly: true,
  });
  if (peUrgent) {
    setAiRationale({
      playerId,
      difficulty,
      layer: 'L0',
      summary: `PE urgent ${peUrgent.type}`,
    });
    return { kind: 'command', command: peUrgent };
  }

  if (isCitiesKnightsEnabled(state) && shouldPrioritizeDefense(state)) {
    const ckAction = decideCitiesKnightsAction(state, playerId, { difficulty });
    if (ckAction) {
      setAiRationale({
        playerId,
        difficulty,
        layer: 'L0',
        summary: `C&K defense ${ckAction.command.type}`,
      });
      return ckAction;
    }
  }

  // L1 turn planner (medium+) — pool classique + C&K + US
  if (policy.useTurnPlanner) {
    const plan = planTurnAction(state, playerId, difficulty, player.aiPersonality);
    if (plan && plan.command.type !== 'end_turn') {
      setAiRationale({
        playerId,
        difficulty,
        layer: 'L1',
        summary: `plan ${plan.label}`,
        score: plan.sequenceScore,
      });
      return { kind: 'command', command: plan.command };
    }
  }

  // Fallback L0 : meilleure action US/C&K scorée si L1 n'a rien retenu
  if (isCitiesKnightsEnabled(state)) {
    const ckAction = decideCitiesKnightsAction(state, playerId, { difficulty });
    if (ckAction) {
      setAiRationale({
        playerId,
        difficulty,
        layer: 'L0',
        summary: `C&K ${ckAction.command.type}`,
      });
      return ckAction;
    }
  }
  const usCommand = chooseUndergroundSkyAction(state, playerId, { difficulty });
  if (usCommand) {
    setAiRationale({
      playerId,
      difficulty,
      layer: 'L0',
      summary: `US ${usCommand.type}`,
    });
    return { kind: 'command', command: usCommand };
  }
  const peCommand = choosePactsEmbassiesAction(state, playerId, { difficulty });
  if (peCommand) {
    setAiRationale({
      playerId,
      difficulty,
      layer: 'L0',
      summary: `PE ${peCommand.type}`,
    });
    return { kind: 'command', command: peCommand };
  }

  const dev = decidePlayDevCard(state, playerId, difficulty);
  if (dev?.kind === 'command') {
    setAiRationale({
      playerId,
      difficulty,
      layer: 'L0',
      summary: `dev ${dev.command.type}`,
    });
    return dev;
  }

  if (usesTopologicalPlacement(state)) {
    const buildDecision = decideTopoBuilds(state, playerId, difficulty);
    if (buildDecision?.kind === 'command') {
      const expansion = computeExpansionPlan(state, playerId);
      const cmd = buildDecision.command.type;
      setAiRationale({
        playerId,
        difficulty,
        layer: 'L0',
        summary:
          cmd === 'build_road' && expansion.nextEdgeId
            ? `expand→${expansion.targetIntersectionId ?? '?'} (${expansion.pathLength} roads)`
            : `build ${cmd}`,
      });
      return buildDecision;
    }
  } else {
    const builds = listTileBuildCandidates(state, playerId);
    const bestBuild = pickSuboptimal(builds, difficulty);
    if (bestBuild && shouldTakeRiskyAction(difficulty)) {
      const cost = BUILD_COSTS[bestBuild.buildingId as keyof typeof BUILD_COSTS];
      if (cost && hasResources(player.resources, cost)) {
        return {
          kind: 'build',
          tileId: bestBuild.tileId,
          buildingId: bestBuild.buildingId,
        };
      }
      const trade = findBankTrade(state, playerId, cost ?? {});
      if (trade && policy.allowBankTrades) {
        return {
          kind: 'command',
          command: {
            type: 'bank_trade',
            playerId,
            give: trade.give,
            receive: trade.receive,
          },
        };
      }
    }
  }

  if (
    !isCitiesKnightsEnabled(state) &&
    hasResources(player.resources, DEV_CARD_COST) &&
    player.devCards.filter((card: DevelopmentCard) => !card.played).length < 4 &&
    shouldTakeRiskyAction(difficulty)
  ) {
    return { kind: 'command', command: { type: 'draw_dev_card', playerId } };
  }

  if (
    usesLimitedBank(state) &&
    !state.pendingPlayerTrade &&
    policy.proposePlayerTrades &&
    !hasProposedPlayerTradeThisTurn(state, playerId)
  ) {
    const handSize = totalClassicResources(player.resources);
    const blockedBuild = listClassicTopoBuildCandidates(state, playerId).some(
      (b) => !hasResources(player.resources, b.cost) && b.score >= 20,
    );
    const offerChance = blockedBuild ? 0.72 : handSize >= 7 ? 0.45 : 0.28;
    if (randomFloat(0, 1) < offerChance) {
      const trade = findPlayerTradeOffer(state, playerId);
      if (trade) {
        markPlayerTradeOffered(state, playerId);
        return {
          kind: 'command',
          command: {
            type: 'propose_player_trade',
            playerId,
            toPlayerId: trade.toPlayerId,
            give: trade.give,
            receive: trade.receive,
          },
        };
      }
    }
  }

  // Fallback: any remaining scored legal action
  const scored = listLegalScoredActions(state, playerId);
  const pick = pickSuboptimal(scored, difficulty);
  if (pick && pick.command.type !== 'end_turn' && shouldTakeRiskyAction(difficulty)) {
    return { kind: 'command', command: pick.command };
  }

  setAiRationale({
    playerId,
    difficulty,
    layer: 'L0',
    summary: 'end_turn',
  });
  return { kind: 'command', command: { type: 'end_turn', playerId } };
}

/** Commande de secours lorsqu'une action planifiée échoue (anti-blocage). */
export function chooseClassicRecoveryCommand(
  state: GameState,
  playerId: string,
  _options: ClassicAIOptions,
): GameCommand | null {
  setAiRationale({
    playerId,
    difficulty: _options.difficulty,
    layer: 'recovery',
    summary: `recovery ${state.turnPhase}`,
  });
  switch (state.turnPhase) {
    case 'start_of_turn':
      return { type: 'roll_dice', playerId };
    case 'discard_resources': {
      const player = state.players.get(playerId);
      if (!player) return null;
      return buildSevenDiscardCommand(state, playerId);
    }
    case 'resource_collect':
      return { type: 'acknowledge_collection', playerId };
    case 'move_robber': {
      const tileId = chooseRobberTile(state, playerId, _options.difficulty);
      return tileId ? { type: 'move_robber', playerId, tileId } : null;
    }
    case 'steal_resource': {
      const target = chooseStealTarget(
        state,
        playerId,
        state.robberPosition,
        _options.difficulty,
      );
      return { type: 'steal_resource', playerId, targetPlayerId: target };
    }
    case 'player_action': {
      if (hasBlockingCkPending(state)) {
        const ck = decideCitiesKnightsPending(state, playerId);
        if (ck?.kind === 'command') return ck.command;
        return null;
      }
      return { type: 'end_turn', playerId };
    }
    default:
      return null;
  }
}

export function applyClassicBuildDecision(
  state: GameState,
  playerId: string,
  tileId: string,
  buildingId: BuildingId,
): { success: boolean; reason?: string } {
  if (buildingId !== 'settlement' && buildingId !== 'city' && buildingId !== 'road') {
    return { success: false, reason: 'Construction classique non supportée' };
  }

  const result = constructClassicBuilding(playerId, tileId, buildingId, state);
  if (result.success) {
    const player = state.players.get(playerId);
    if (player) {
      recalculateVP(player, state);
      checkVictory(state);
    }
  }
  return result;
}

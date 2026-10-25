import type { GameCommand } from '@catanx/protocol';
import type { GameState } from '../../../types/game';
import type { ResourceBundle, ResourceType } from '../../../types/resources';
import type { AIDifficulty } from '../../../types/player';
import { hasResources, getPortTradeRatio } from '../../resources/ResourceSystem';
import {
  CLASSIC_RESOURCE_TYPES,
  usesTopologicalPlacement,
  usesLimitedBank,
} from '../../catan/ClassicBoard';
import { getSeasonalTradeRatioModifier } from '../../seasons/costs';
import {
  listClassicCityCandidates,
  listClassicRoadCandidates,
  listClassicSettlementCandidates,
} from '../../catan/ClassicCommands';
import { isCitiesKnightsEnabled, isUndergroundSkyEnabled, isPactsEmbassiesEnabled } from '../../../core/extensions';
import { isBlockedByEnemyKnight } from '../../citiesKnights/knights';
import { applySeasonalBuildCost } from '../../seasons/costs';
import { listCitiesKnightsScoredActions } from '../../citiesKnights/CitiesKnightsAI';
import { listUndergroundSkyScoredActions } from '../../undergroundSky/ai';
import { listPactsEmbassiesScoredActions } from '../../pactsEmbassies/ai';
import { evaluatePosition } from './PositionEvaluator';
import {
  computeExpansionPlan,
  roadPlanBonus,
} from './ExpansionPlan';
import { projectHorizon } from './HorizonPlan';
import { victoryRaceBuildBonus } from './VictoryRace';
import { snapshotTrophyThreat } from './TrophyThreat';

export const BUILD_COSTS: Record<'settlement' | 'city' | 'road', ResourceBundle> = {
  settlement: { wood: 1, clay: 1, wheat: 1, sheep: 1 },
  city: { ore: 3, wheat: 2 },
  road: { wood: 1, clay: 1 },
};

export const DEV_CARD_COST: ResourceBundle = { ore: 1, wheat: 1, sheep: 1 };

export interface ScoredAction {
  command: GameCommand;
  score: number;
  label: string;
}

function seasonalCost(
  state: GameState,
  playerId: string,
  kind: 'settlement' | 'city' | 'road',
): ResourceBundle {
  return applySeasonalBuildCost(state, playerId, kind, BUILD_COSTS[kind], {
    useWorks: kind === 'road',
  });
}

/** Generate scored legal classic + extension actions for player_action (builds, buy/play hints, end). */
export function listLegalScoredActions(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty = 'medium',
): ScoredAction[] {
  const player = state.players.get(playerId);
  if (!player || state.turnPhase !== 'player_action') return [];

  const out: ScoredAction[] = [];
  const baseEval = evaluatePosition(state, playerId);
  const plan = computeExpansionPlan(state, playerId);
  const horizon = projectHorizon(state, playerId, 3);
  const threat = snapshotTrophyThreat(state, playerId);

  if (usesTopologicalPlacement(state)) {
    let cities = listClassicCityCandidates(state, playerId);
    let settlements = listClassicSettlementCandidates(state, playerId);
    let roads = listClassicRoadCandidates(state, playerId);

    if (isCitiesKnightsEnabled(state)) {
      cities = cities.filter((c) => !isBlockedByEnemyKnight(state, c.intersectionId, playerId));
      settlements = settlements.filter(
        (c) => !isBlockedByEnemyKnight(state, c.intersectionId, playerId),
      );
    }

    const cityCost = seasonalCost(state, playerId, 'city');
    for (const c of cities) {
      if (!hasResources(player.resources, cityCost)) continue;
      out.push({
        command: { type: 'upgrade_city', playerId, intersectionId: c.intersectionId },
        score:
          c.score +
          8 +
          (threat.vpGapToWin <= 3 ? 15 : 0) +
          victoryRaceBuildBonus(state, playerId, 'city', horizon) +
          baseEval * 0.01,
        label: `city:${c.intersectionId}`,
      });
    }

    const settleCost = seasonalCost(state, playerId, 'settlement');
    for (const c of settlements) {
      if (!hasResources(player.resources, settleCost)) continue;
      const onTarget =
        plan.targetIntersectionId === c.intersectionId ? 15 : 0;
      out.push({
        command: { type: 'build_settlement', playerId, intersectionId: c.intersectionId },
        score:
          c.score +
          onTarget +
          victoryRaceBuildBonus(state, playerId, 'settlement', horizon) +
          baseEval * 0.01,
        label: `settlement:${c.intersectionId}`,
      });
    }

    const roadCost = seasonalCost(state, playerId, 'road');
    const free = (player.freeRoadsRemaining ?? 0) > 0;
    for (const c of roads) {
      if (!free && !hasResources(player.resources, roadCost)) continue;
      const bonus = roadPlanBonus(state, playerId, c.edgeId, plan);
      // Si focus village et route hors chemin : ne pas proposer (sauf free roads)
      if (plan.focusSettlement && bonus < 0 && !free) continue;
      out.push({
        command: { type: 'build_road', playerId, edgeId: c.edgeId },
        score:
          Math.max(
            0,
            c.score * 0.35 +
              bonus +
              victoryRaceBuildBonus(state, playerId, 'road', horizon),
          ) +
          baseEval * 0.01,
        label: `road:${c.edgeId}`,
      });
    }
  }

  if (
    !isCitiesKnightsEnabled(state) &&
    hasResources(player.resources, DEV_CARD_COST) &&
    player.devCards.filter((c) => !c.played).length < 4
  ) {
    out.push({
      command: { type: 'draw_dev_card', playerId },
      score: 28 + baseEval * 0.01 + (horizon.focus === 'largest_army' ? 12 : 0),
      label: 'draw_dev',
    });
  }

  // Chaînes banque L1 : un trade vers le coût horizon
  if (usesLimitedBank(state)) {
    const focusCost =
      horizon.focus === 'city'
        ? seasonalCost(state, playerId, 'city')
        : horizon.focus === 'settlement'
          ? seasonalCost(state, playerId, 'settlement')
          : seasonalCost(state, playerId, 'road');
    const missing = (Object.keys(focusCost) as ResourceType[]).find(
      (r) => (player.resources[r] ?? 0) < (focusCost[r] ?? 0),
    );
    // Banque à sec : l'échange serait refusé par le moteur (boucle IA infinie).
    if (missing && (!state.bank || (state.bank[missing] ?? 0) >= 1)) {
      const giveCandidates = (CLASSIC_RESOURCE_TYPES as readonly ResourceType[])
        .filter((r) => r !== missing && (player.resources[r] ?? 0) >= 2)
        .sort((a, b) => (player.resources[b] ?? 0) - (player.resources[a] ?? 0));
      for (const giveResource of giveCandidates.slice(0, 2)) {
        const baseRatio = getPortTradeRatio(player, giveResource, state);
        const ratio = Math.max(
          2,
          Math.round(
            getSeasonalTradeRatioModifier(state, playerId, baseRatio, {
              useCommerce: true,
            }),
          ),
        );
        if ((player.resources[giveResource] ?? 0) < ratio) continue;
        out.push({
          command: {
            type: 'bank_trade',
            playerId,
            give: { [giveResource]: ratio },
            receive: { [missing]: 1 },
          },
          score: 44 + baseEval * 0.01,
          label: `bank:${giveResource}->${missing}`,
        });
      }
    }
  }

  out.push({
    command: { type: 'end_turn', playerId },
    score: 1,
    label: 'end_turn',
  });

  // Extensions : fusion L1 (urgences déjà traitées hors pool)
  if (isCitiesKnightsEnabled(state)) {
    out.push(...listCitiesKnightsScoredActions(state, playerId, { difficulty }));
  }
  if (isUndergroundSkyEnabled(state)) {
    const usActions = listUndergroundSkyScoredActions(state, playerId, difficulty);
    const bestClassic = out
      .filter((a) => !a.label.startsWith('us:') && !a.label.startsWith('ck:') && a.label !== 'end_turn')
      .reduce((m, a) => Math.max(m, a.score), 0);
    const usBoost =
      horizon.focus === 'us_contract' || horizon.focus === 'us_mastery' ? 10 : 0;
    for (const action of usActions) {
      let score = action.score + usBoost + baseEval * 0.01;
      // Arbitrage vs meilleur build classique : ne pas sous-investir le Ciel
      if (score + 4 >= bestClassic) score += 3;
      else score -= 6;
      out.push({ ...action, score });
    }
  }
  if (isPactsEmbassiesEnabled(state)) {
    const peActions = listPactsEmbassiesScoredActions(state, playerId, difficulty);
    const bestClassic = out
      .filter(
        (a) =>
          !a.label.startsWith('us:') &&
          !a.label.startsWith('ck:') &&
          !a.label.startsWith('pe:') &&
          a.label !== 'end_turn',
      )
      .reduce((m, a) => Math.max(m, a.score), 0);
    for (const action of peActions) {
      const urgent =
        action.label.startsWith('accept_') ||
        action.label.startsWith('reject_') ||
        action.label === 'council_vote' ||
        action.label === 'confirm_ambitious' ||
        action.label === 'claim_mandate' ||
        action.label === 'break_pact_anti_kingmake';
      let score = action.score + baseEval * 0.01;
      if (urgent) {
        score += 8;
      } else if (score + 5 >= bestClassic) {
        score += 2;
      } else {
        // Ne pas cannibaliser une bonne construction classique
        score -= 8;
      }
      out.push({
        command: action.command,
        score,
        label: `pe:${action.label}`,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

export function missingResourcesForCost(
  have: ResourceBundle,
  cost: ResourceBundle,
): Partial<Record<ResourceType, number>> {
  const missing: Partial<Record<ResourceType, number>> = {};
  for (const r of CLASSIC_RESOURCE_TYPES) {
    const need = (cost[r] ?? 0) - (have[r] ?? 0);
    if (need > 0) missing[r] = need;
  }
  return missing;
}

export { roadPlanBonus, roadGoalBonus } from './ExpansionPlan';

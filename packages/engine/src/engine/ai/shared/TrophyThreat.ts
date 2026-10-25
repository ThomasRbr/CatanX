import type { GameState } from '../../../types/game';
import { isCitiesKnightsEnabled } from '../../../core/extensions';

export interface TrophyThreatSnapshot {
  myVp: number;
  leaderVp: number;
  victoryTarget: number;
  vpGapToWin: number;
  leaderGap: number;
  /** Positive if we threaten / hold longest road. */
  longestRoadPressure: number;
  /** Positive if we threaten / hold largest army. */
  largestArmyPressure: number;
  /** C&K defender contribution pressure. */
  defenderPressure: number;
  isWinningRace: boolean;
  isBehindLeader: boolean;
}

export function getVictoryTarget(state: GameState): number {
  return state.config?.victoryPointTarget ?? 10;
}

function threatNearWin(myVp: number, victoryTarget: number): boolean {
  return victoryTarget - myVp <= 3;
}

export function snapshotTrophyThreat(state: GameState, playerId: string): TrophyThreatSnapshot {
  const player = state.players.get(playerId);
  const myVp = player?.stats.victoryPoints ?? 0;
  const victoryTarget = getVictoryTarget(state);

  let leaderVp = myVp;
  for (const p of state.players.values()) {
    if (p.isEliminated) continue;
    leaderVp = Math.max(leaderVp, p.stats.victoryPoints);
  }

  const holdsRoad = state.longestRoadOwner === playerId;
  const holdsArmy = state.largestArmyOwner === playerId;
  const roadLen = state.longestRoadLength ?? 0;
  const armySize = state.largestArmySize ?? 0;
  const myArmy = player?.militaryCards.length ?? 0;

  let myRoadEdges = 0;
  const board = state.classicBoard;
  if (board?.roadsByEdge) {
    for (const owner of Object.values(board.roadsByEdge)) {
      if (owner === playerId) myRoadEdges += 1;
    }
  }

  let longestRoadPressure = 0;
  if (holdsRoad) longestRoadPressure = 4;
  else if (myRoadEdges >= Math.max(4, roadLen - 1) && roadLen >= 4) longestRoadPressure = 2.5;
  else if (myRoadEdges >= 4) longestRoadPressure = 1.5;
  else if (roadLen >= 3) longestRoadPressure = 0.5;

  let largestArmyPressure = 0;
  if (holdsArmy) largestArmyPressure = 4;
  else if (myArmy >= Math.max(2, armySize - 1)) largestArmyPressure = 2.5;
  else if (myArmy >= Math.max(1, armySize - 2) && threatNearWin(myVp, victoryTarget)) {
    largestArmyPressure = 2;
  } else if (myArmy >= 1) largestArmyPressure = 0.5;

  let defenderPressure = 0;
  if (isCitiesKnightsEnabled(state)) {
    const ck = state.extensions?.citiesKnights;
    const myActive =
      ck?.knights
        .filter((k) => k.ownerId === playerId && k.activated && k.intersectionId)
        .reduce((s, k) => s + k.rank, 0) ?? 0;
    defenderPressure = myActive * 0.4;
    defenderPressure += (player?.stats.vpBreakdown.defenderOfCatan ?? 0) * 2;
  }

  return {
    myVp,
    leaderVp,
    victoryTarget,
    vpGapToWin: victoryTarget - myVp,
    leaderGap: leaderVp - myVp,
    longestRoadPressure,
    largestArmyPressure,
    defenderPressure,
    isWinningRace: myVp >= victoryTarget - 2,
    isBehindLeader: leaderVp > myVp,
  };
}

/** Extra robber preference for players threatening victory. */
export function opponentThreatScore(state: GameState, opponentId: string): number {
  const opp = state.players.get(opponentId);
  if (!opp || opp.isEliminated) return 0;
  const target = getVictoryTarget(state);
  const vp = opp.stats.victoryPoints;
  let score = vp * 2;
  if (vp >= target - 2) score += 20;
  if (state.longestRoadOwner === opponentId) score += 8;
  if (state.largestArmyOwner === opponentId) score += 8;
  return score;
}

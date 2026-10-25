/**
 * Arbitrage course à la victoire : bonus de score selon focus horizon / menaces.
 */

import type { GameState } from '../../../types/game';
import type { HorizonFocus, HorizonProjection } from './HorizonPlan';
import { snapshotTrophyThreat } from './TrophyThreat';

export function victoryRaceBuildBonus(
  state: GameState,
  playerId: string,
  buildingId: 'city' | 'settlement' | 'road',
  horizon: HorizonProjection,
): number {
  const threat = snapshotTrophyThreat(state, playerId);
  let bonus = 0;

  const applyFocus = (focus: HorizonFocus, bid: typeof buildingId): number => {
    if (focus === 'city' && bid === 'city') return 35;
    if (focus === 'settlement' && bid === 'settlement') return 28;
    if (focus === 'road_path' && bid === 'road') return 12;
    if (focus === 'longest_road' && bid === 'road') return 22;
    if (focus === 'city' && bid === 'settlement') return -8;
    if (focus === 'settlement' && bid === 'city') return -5;
    if (focus === 'ck_defense' && bid === 'road') return -10;
    return 0;
  };

  bonus += applyFocus(horizon.focus, buildingId);

  // Fin de partie : maximiser PV immédiats
  if (threat.vpGapToWin <= 2) {
    if (buildingId === 'city') bonus += 25;
    if (buildingId === 'settlement') bonus += 18;
    if (buildingId === 'road') bonus -= 12;
  } else if (threat.vpGapToWin <= 4) {
    if (buildingId === 'city') bonus += 12;
    if (buildingId === 'settlement') bonus += 8;
  }

  // Derrière le leader : villes > routes longues
  if (threat.isBehindLeader && threat.leaderGap >= 3) {
    if (buildingId === 'city') bonus += 15;
    if (buildingId === 'road' && horizon.focus !== 'longest_road') bonus -= 6;
  }

  // C&K : défense / métropole avant routes parasites
  if (horizon.focus === 'ck_defense') {
    if (buildingId === 'road') bonus -= 15;
    if (buildingId === 'city') bonus += 8;
  }
  if (horizon.focus === 'ck_urban' && buildingId === 'city') bonus += 10;
  if (horizon.focus === 'ck_metropolis' && buildingId === 'city') bonus += 14;
  if (horizon.focus === 'largest_army' && buildingId === 'road') bonus -= 8;
  if (horizon.focus === 'us_contract' && buildingId === 'road') bonus -= 6;
  if (horizon.focus === 'us_mastery' && buildingId === 'city') bonus -= 4;
  if (horizon.focus === 'port_race' && buildingId === 'settlement') bonus += 16;
  if (horizon.focus === 'port_race' && buildingId === 'road') bonus += 10;

  return bonus;
}

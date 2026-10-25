/**
 * Titres Maître des Profondeurs / Maître des Alizés.
 */

import type { GameState } from '../../types/game';
import { isUndergroundSkyEnabled } from '../../core/extensions';
import { queueUndergroundSkyEvents } from './events';
import { ensureUndergroundSkyState } from './state';

export function undergroundMasteryScore(
  state: GameState,
  playerId: string,
): number {
  const us = state.extensions?.undergroundSky;
  if (!us) return 0;
  const tunnels = us.tunnels.filter((t) => t.playerId === playerId).length;
  const lifts = us.lifts.filter((l) => l.playerId === playerId).length;
  const extractors = us.outposts.filter(
    (o) => o.playerId === playerId && o.upgradedExtractor,
  ).length;
  return tunnels + 2 * lifts + 2 * extractors;
}

export function skyMasteryScore(state: GameState, playerId: string): number {
  const us = state.extensions?.undergroundSky;
  if (!us) return 0;
  const contracts = us.completedRegularContracts[playerId] ?? 0;
  const beacons = us.beacons.filter((b) => b.playerId === playerId).length;
  return contracts + 2 * beacons;
}

export const UNDERGROUND_MASTERY_THRESHOLD = 6;
export const SKY_MASTERY_THRESHOLD = 4;

/**
 * Recalcule les titres. Égalité → le détenteur conserve ; sans détenteur → personne.
 */
export function recomputeUndergroundSkyMastery(state: GameState): void {
  if (!isUndergroundSkyEnabled(state)) return;
  const us = ensureUndergroundSkyState(state);
  if (!us) return;

  const playerIds = state.turnOrder;

  // Profondeurs
  {
    let bestScore = -1;
    let bestId: string | null = null;
    for (const id of playerIds) {
      const score = undergroundMasteryScore(state, id);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      } else if (score === bestScore && score >= UNDERGROUND_MASTERY_THRESHOLD) {
        // égalité stricte entre challengers : conserver le détenteur s’il est à égalité
        if (us.undergroundMasteryOwnerId === id) bestId = id;
      }
    }
    const holder = us.undergroundMasteryOwnerId;
    let next: string | null = null;
    if (bestScore >= UNDERGROUND_MASTERY_THRESHOLD && bestId) {
      if (holder && undergroundMasteryScore(state, holder) === bestScore) {
        next = holder;
      } else {
        // Vérifier s’il y a égalité entre plusieurs sans détenteur à égalité
        const tied = playerIds.filter(
          (id) => undergroundMasteryScore(state, id) === bestScore,
        );
        if (tied.length === 1) next = tied[0]!;
        else if (holder && tied.includes(holder)) next = holder;
        else next = null; // égalité sans détenteur
      }
    }
    if (next !== us.undergroundMasteryOwnerId) {
      const prev = us.undergroundMasteryOwnerId;
      us.undergroundMasteryOwnerId = next;
      queueUndergroundSkyEvents(state, [
        {
          type: 'us_mastery_changed',
          payload: {
            kind: 'underground',
            previousOwnerId: prev,
            ownerId: next,
            score: bestScore,
          },
        },
      ]);
    }
  }

  // Alizés
  {
    let bestScore = -1;
    for (const id of playerIds) {
      bestScore = Math.max(bestScore, skyMasteryScore(state, id));
    }
    const holder = us.skyMasteryOwnerId;
    let next: string | null = null;
    if (bestScore >= SKY_MASTERY_THRESHOLD) {
      const tied = playerIds.filter(
        (id) => skyMasteryScore(state, id) === bestScore,
      );
      if (tied.length === 1) next = tied[0]!;
      else if (holder && tied.includes(holder)) next = holder;
      else next = null;
    }
    if (next !== us.skyMasteryOwnerId) {
      const prev = us.skyMasteryOwnerId;
      us.skyMasteryOwnerId = next;
      queueUndergroundSkyEvents(state, [
        {
          type: 'us_mastery_changed',
          payload: {
            kind: 'sky',
            previousOwnerId: prev,
            ownerId: next,
            score: bestScore,
          },
        },
      ]);
    }
  }
}

export function undergroundSkyVictoryPoints(
  state: GameState,
  playerId: string,
): number {
  const us = state.extensions?.undergroundSky;
  if (!us) return 0;
  let vp = 0;
  if (us.undergroundMasteryOwnerId === playerId) vp += 2;
  if (us.skyMasteryOwnerId === playerId) vp += 2;
  if (us.completedMajorContracts[playerId]) vp += 1;
  return vp;
}

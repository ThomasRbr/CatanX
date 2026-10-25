/**
 * Adaptateurs Saisons / CK / Souterrain & Ciel pour Pactes & Ambassades.
 */

import type { GameState } from '../../types/game';
import { isPactsEmbassiesEnabled, isSeasonsEnabled } from '../../core/extensions';
import { getPe } from './state';
import {
  onSeasonChanged,
  resolveCouncilBeforeSeasonTransition,
} from './clock';
import { onCityDowngraded, onCityRebuilt } from './commands';
import {
  undergroundPassagePartners,
  tradeWindsPartners,
  noteAlliedInfraUse,
} from './clauses';

/** Appelé avant transition de saison. */
export function peBeforeSeasonTransition(state: GameState): void {
  if (!isPactsEmbassiesEnabled(state) || !isSeasonsEnabled(state)) return;
  resolveCouncilBeforeSeasonTransition(state);
}

/** Appelé après changement de saison. */
export function peAfterSeasonChanged(state: GameState): void {
  if (!isPactsEmbassiesEnabled(state) || !isSeasonsEnabled(state)) return;
  onSeasonChanged(state);
}

/** Rounds par session : 5 si Saisons, sinon config. */
export function peRoundsPerSession(state: GameState): number {
  const pe = getPe(state);
  if (!pe) return 4;
  if (isSeasonsEnabled(state)) return 5;
  return pe.council.roundsPerSession;
}

export function peOnCityPillaged(state: GameState): void {
  if (!isPactsEmbassiesEnabled(state)) return;
  onCityDowngraded(state);
}

export function peOnCityUpgraded(state: GameState, intersectionId: string): void {
  if (!isPactsEmbassiesEnabled(state)) return;
  onCityRebuilt(state, intersectionId);
}

/** Partenaires Passage souterrain (connectivité uniquement). */
export function peUndergroundAllyIds(state: GameState, playerId: string): string[] {
  if (!isPactsEmbassiesEnabled(state)) return [];
  return undergroundPassagePartners(state, playerId);
}

/** Partenaires Accord des Alizés. */
export function peSkyAllyIds(state: GameState, playerId: string): string[] {
  if (!isPactsEmbassiesEnabled(state)) return [];
  return tradeWindsPartners(state, playerId);
}

export function peNoteAlliedTunnelUse(
  state: GameState,
  userId: string,
  ownerId: string,
): void {
  noteAlliedInfraUse(state, userId, ownerId, 'underground_passage');
}

export function peNoteAlliedSkyUse(
  state: GameState,
  userId: string,
  ownerId: string,
): void {
  noteAlliedInfraUse(state, userId, ownerId, 'trade_winds');
}

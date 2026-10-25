/**
 * Ambassades et délégués.
 */

import type { GameState } from '../../types/game';
import type { PactsEmbassiesState, PeEmbassy } from '../../types/pactsEmbassies';
import {
  PE_MAX_EMBASSIES,
  delegateCount,
  maxActivePactsForPlayer,
} from '../../types/pactsEmbassies';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { activeEmbassyCount } from './state';
import { addInfluence } from './influence';
import { queuePeEvents } from './events';
import { nextId } from '../../core/ids';

export function getDelegates(pe: PactsEmbassiesState, playerId: string): number {
  return delegateCount(activeEmbassyCount(pe, playerId));
}

export function getPactCapacity(
  pe: PactsEmbassiesState,
  playerId: string,
): { maxPacts: number; maxClauses: number } {
  return maxActivePactsForPlayer(activeEmbassyCount(pe, playerId));
}

function isMetropolisHost(state: GameState, intersectionId: string): boolean {
  if (!isCitiesKnightsEnabled(state)) return false;
  const metros = state.extensions?.citiesKnights?.metropolises;
  if (!metros) return false;
  return Object.values(metros).some((slot) => slot?.intersectionId === intersectionId);
}

function buildingAt(
  state: GameState,
  intersectionId: string,
): { ownerId: string; definitionId: string } | null {
  const board = state.classicBoard;
  if (!board) return null;
  const ownerId = board.occupiedIntersections[intersectionId];
  if (!ownerId) return null;
  const defId = board.buildingByIntersection?.[intersectionId];
  return { ownerId, definitionId: defId ?? 'settlement' };
}

export function canBuildEmbassy(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  intersectionId: string,
): { ok: true } | { ok: false; reason: string } {
  const building = buildingAt(state, intersectionId);
  if (!building) return { ok: false, reason: 'Aucune construction ici.' };
  if (building.ownerId !== playerId) {
    return { ok: false, reason: 'Ce n’est pas votre ville.' };
  }
  if (building.definitionId !== 'city' && building.definitionId !== 'metropolis') {
    return { ok: false, reason: 'L’ambassade se construit sur une ville ou métropole.' };
  }
  if (pe.embassies.some((e) => e.intersectionId === intersectionId)) {
    return { ok: false, reason: 'Une ambassade existe déjà sur cette ville.' };
  }
  const owned = pe.embassies.filter((e) => e.playerId === playerId).length;
  if (owned >= PE_MAX_EMBASSIES) {
    return { ok: false, reason: 'Maximum trois ambassades par joueur.' };
  }
  return { ok: true };
}

export function buildEmbassy(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  intersectionId: string,
): PeEmbassy {
  const embassy: PeEmbassy = {
    id: nextId('pe_embassy'),
    playerId,
    intersectionId,
    suspended: false,
  };
  pe.embassies.push(embassy);

  const ps = pe.players[playerId];
  if (ps && !ps.firstEmbassyBuilt) {
    ps.firstEmbassyBuilt = true;
    addInfluence(pe, playerId, 1);
  }

  pe.history.push({
    turn: state.currentTurn,
    round: pe.globalRound,
    kind: 'embassy_built',
    message: `Ambassade construite.`,
    data: { playerId, intersectionId, embassyId: embassy.id },
  });
  queuePeEvents(state, [
    { type: 'pe_embassy_built', payload: { playerId, intersectionId, embassyId: embassy.id } },
  ]);
  return embassy;
}

/** Suspend les ambassades sur villes rétrogradées (sans métropole). */
export function syncEmbassySuspensions(state: GameState, pe: PactsEmbassiesState): void {
  for (const embassy of pe.embassies) {
    const building = buildingAt(state, embassy.intersectionId);
    if (!building || building.ownerId !== embassy.playerId) {
      embassy.suspended = true;
      continue;
    }
    if (building.definitionId === 'metropolis' || isMetropolisHost(state, embassy.intersectionId)) {
      embassy.suspended = false;
      continue;
    }
    if (building.definitionId === 'city') {
      embassy.suspended = false;
      continue;
    }
    // Settlement / autre = rétrogradée
    embassy.suspended = true;
  }
}

/** Réactive une ambassade après reconstruction de ville. */
export function reactivateEmbassyAt(
  pe: PactsEmbassiesState,
  intersectionId: string,
): void {
  const embassy = pe.embassies.find((e) => e.intersectionId === intersectionId);
  if (embassy) embassy.suspended = false;
}

export function assignConsulate(
  pe: PactsEmbassiesState,
  playerId: string,
  pactId: string,
): void {
  const free = pe.embassies.find(
    (e) => e.playerId === playerId && !e.suspended && !e.consulatePactId,
  );
  if (free) free.consulatePactId = pactId;
}

export function clearConsulatesForPact(pe: PactsEmbassiesState, pactId: string): void {
  for (const e of pe.embassies) {
    if (e.consulatePactId === pactId) delete e.consulatePactId;
  }
}

/**
 * Progression automatique des dirigeables avant la phase d’actions.
 */

import type { GameState } from '../../types/game';
import type {
  SkyAirship,
  UndergroundSkyMaterial,
} from '../../types/undergroundSky';
import { isSeasonsEnabled, isUndergroundSkyEnabled } from '../../core/extensions';
import { getClimateDefinition } from '../seasons/definitions';
import { queueUndergroundSkyEvents } from './events';
import { grantMaterialsFromBank, syncPublicMaterialCounts } from './materials';
import { ensureUndergroundSkyState } from './state';
import { estimateAirshipEta } from './pathfinding';

export function getAirshipMoveBudget(
  state: GameState,
  airship: SkyAirship,
): number {
  let budget = airship.moveBudget;
  if (isSeasonsEnabled(state)) {
    const seasons = state.extensions?.seasons;
    if (seasons) {
      try {
        const climate = getClimateDefinition(seasons.currentClimateId);
        if (climate.severity === 'severe') {
          budget = Math.max(1, budget - 1);
        }
      } catch {
        // ignore unknown climate
      }
    }
  }
  return Math.max(1, budget);
}

/** ETA en tours du propriétaire, budget climat inclus. */
export function estimateAirshipEtaForState(
  state: GameState,
  airship: SkyAirship,
  totalCost: number,
): number {
  return estimateAirshipEta(totalCost, getAirshipMoveBudget(state, airship));
}

function revealSkyHub(state: GameState, hubId: string, visitorId: string): void {
  const us = state.extensions?.undergroundSky;
  if (!us) return;
  const hub = us.skyGraph.hubs[hubId];
  if (!hub) return;

  if (!us.revealedSkyHubIds.includes(hubId)) {
    us.revealedSkyHubIds.push(hubId);
    queueUndergroundSkyEvents(state, [
      {
        type: 'us_sky_site_revealed',
        payload: { hubId, site: hub.site, playerId: visitorId },
      },
    ]);
  }

  if (hub.site === 'aether_source' && !hub.firstVisitorRewards[visitorId]) {
    hub.firstVisitorRewards[visitorId] = true;
    grantMaterialsFromBank(us, visitorId, { us_aether: 1 });
  }

  if (hub.site === 'observatory') {
    for (const neighbor of us.skyGraph.adjacency[hubId] ?? []) {
      if (!us.revealedSkyHubIds.includes(neighbor)) {
        us.revealedSkyHubIds.push(neighbor);
        const nHub = us.skyGraph.hubs[neighbor];
        queueUndergroundSkyEvents(state, [
          {
            type: 'us_sky_site_revealed',
            payload: {
              hubId: neighbor,
              site: nHub?.site,
              playerId: visitorId,
              via: 'observatory',
            },
          },
        ]);
      }
    }
  }

  // Ruines : premier découvreur choisit un matériau — claim après choix
  if (hub.site === 'hanging_ruins' && !hub.hangingRuinsClaimed) {
    const alreadyPending = us.pendingResolutions.some(
      (p) => p.kind === 'sky_material_choice' && p.hubId === hubId,
    );
    if (!alreadyPending) {
      us.pendingResolutions.push({
        kind: 'sky_material_choice',
        playerId: visitorId,
        hubId,
        choices: ['us_crystal', 'us_aether'],
      });
    }
  }
}

function resolveArrival(state: GameState, airship: SkyAirship): void {
  if (!airship.route) return;
  const dest = airship.route.destinationHubId;
  airship.currentHubId = dest;
  airship.route = null;
  revealSkyHub(state, dest, airship.playerId);
  queueUndergroundSkyEvents(state, [
    {
      type: 'us_airship_arrived',
      payload: {
        airshipId: airship.id,
        playerId: airship.playerId,
        hubId: dest,
      },
    },
  ]);
}

function legCostAt(airship: SkyAirship, pathIndex: number): number {
  const costs = airship.route?.legCosts ?? [];
  // 0 autorisé (balise) : le tick avance immédiatement vers le hub suivant.
  return Math.max(0, costs[pathIndex] ?? 1);
}

/**
 * Avance les dirigeables du joueur avant sa phase d’actions.
 */
export function advanceAirshipsForPlayer(
  state: GameState,
  playerId: string,
): void {
  if (!isUndergroundSkyEnabled(state)) return;
  const us = ensureUndergroundSkyState(state);
  if (!us) return;

  for (const airship of us.airships) {
    if (airship.playerId !== playerId) continue;
    if (!airship.route) continue;

    let points = getAirshipMoveBudget(state, airship);
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];

    while (points > 0 && airship.route) {
      // Legs à coût 0 (balises) : avancer immédiatement sans consommer le budget.
      while (airship.route && airship.route.remainingPointsThisLeg <= 0) {
        const path = airship.route.hubPath;
        const nextIndex = airship.route.pathIndex + 1;
        if (nextIndex >= path.length - 1) {
          airship.route.pathIndex = path.length - 1;
          resolveArrival(state, airship);
          break;
        }
        airship.route.pathIndex = nextIndex;
        airship.currentHubId = path[nextIndex]!;
        airship.route.remainingPointsThisLeg = legCostAt(airship, nextIndex);
      }
      if (!airship.route) break;

      const spend = Math.min(points, airship.route.remainingPointsThisLeg);
      if (spend <= 0) break;
      airship.route.remainingPointsThisLeg -= spend;
      points -= spend;

      const budget = getAirshipMoveBudget(state, airship);
      const remainingCost =
        airship.route.remainingPointsThisLeg +
        airship.route.legCosts
          .slice(airship.route.pathIndex + 1)
          .reduce((s, c) => s + c, 0);
      airship.route.etaTurns =
        remainingCost <= 0 ? 0 : Math.max(1, Math.ceil(remainingCost / budget));

      events.push({
        type: 'us_airship_advanced',
        payload: {
          airshipId: airship.id,
          playerId,
          pathIndex: airship.route.pathIndex,
          remainingPointsThisLeg: airship.route.remainingPointsThisLeg,
          etaTurns: airship.route.etaTurns,
        },
      });

      if (airship.route.remainingPointsThisLeg <= 0) {
        const path = airship.route.hubPath;
        if (airship.route.pathIndex >= path.length - 2) {
          airship.route.pathIndex = path.length - 1;
          resolveArrival(state, airship);
          break;
        }
      }
    }

    if (events.length > 0) {
      queueUndergroundSkyEvents(state, events);
    }
  }

  syncPublicMaterialCounts(us);
}

/**
 * Deux hubs les plus proches d’une intersection (via tuiles adjacentes).
 */
export function nearestSkyHubsForIntersection(
  state: GameState,
  intersectionId: string,
  count = 2,
): string[] {
  const us = state.extensions?.undergroundSky;
  const board = state.classicBoard;
  if (!us || !board) return [];
  const intersection = board.topology.intersections[intersectionId];
  if (!intersection) return [];

  const scored = Object.values(us.skyGraph.hubs).map((hub) => {
    const tile = hub.anchorTileId ? state.map.get(hub.anchorTileId) : undefined;
    let dist = 99;
    if (tile) {
      for (const tileId of intersection.tileIds) {
        const t = state.map.get(tileId);
        if (!t) continue;
        const d =
          Math.abs(t.coord.q - tile.coord.q) +
          Math.abs(t.coord.r - tile.coord.r) +
          Math.abs(t.coord.s - tile.coord.s);
        dist = Math.min(dist, d);
      }
    }
    return { id: hub.id, dist };
  });
  scored.sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id));
  return scored.slice(0, count).map((s) => s.id);
}

/** True si le dirigeable est amarré à un hub « aéroport » (proche de son aéroport). */
export function isAirshipAtHomeAirport(
  state: GameState,
  airship: SkyAirship,
): boolean {
  const us = state.extensions?.undergroundSky;
  if (!us) return false;
  const airport = us.airports.find((a) => a.id === airship.airportId);
  if (!airport) return false;
  if (!airship.currentHubId || airship.route) return false;
  const homeHubs = nearestSkyHubsForIntersection(state, airport.intersectionId, 2);
  // Pas de topologie / hubs : autoriser (legacy tests)
  if (homeHubs.length === 0) return true;
  return homeHubs.includes(airship.currentHubId);
}

export function grantHangingRuinsMaterial(
  state: GameState,
  playerId: string,
  material: UndergroundSkyMaterial,
): void {
  const us = state.extensions?.undergroundSky;
  if (!us) return;
  grantMaterialsFromBank(us, playerId, { [material]: 1 });
}

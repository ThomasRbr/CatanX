/**
 * Politique IA Souterrain & Ciel — complète et scorée.
 *
 * Principes :
 * - ne lit jamais les découvertes / cargaisons adverses (vue publique) ;
 * - résolutions obligatoires d’abord ;
 * - candidats scorés (maîtrise, production, contrats, exploration) ;
 * - difficulté : seuil d’opportunité + pick suboptimal.
 */
import type { GameCommand } from '@catanx/protocol';
import type { GameState } from '../../types/game';
import type { AIDifficulty } from '../../types/player';
import type { ResourceType } from '../../types/resources';
import type {
  AirshipCargoItem,
  SkyAirship,
  SkyContract,
  UndergroundOutpost,
  UndergroundSkyMaterial,
  UndergroundSkyState,
} from '../../types/undergroundSky';
import { US_PIECE_LIMITS } from '../../types/undergroundSky';
import { isCitiesKnightsEnabled, isUndergroundSkyEnabled } from '../../core/extensions';
import {
  CLASSIC_RESOURCE_TYPES,
  totalClassicResources,
} from '../catan/ClassicBoard';
import { hasResources } from '../resources/ResourceSystem';
import {
  getDifficultyPolicy,
  pickSuboptimal,
  shouldTakeRiskyAction,
} from '../ai/shared/DifficultyPolicy';
import { US_BUILD_COSTS, US_DISCOVERY_OUTPUT } from './catalog';
import { getBuildCost, getTunnelBuildCost } from './costs';
import {
  canExtendTunnelToEdge,
  canSurvey,
  getAdjacentHiddenNodeIds,
  getPlayerUndergroundNodeIds,
} from './network';
import { findShortestSkyPath } from './pathfinding';
import {
  getPlayerMaterials,
  hasMaterials,
  totalMaterials,
} from './materials';
import {
  skyMasteryScore,
  undergroundMasteryScore,
} from './mastery';
import { isAirshipAtHomeAirport } from './airships';

type UsCandidate = {
  command: GameCommand;
  score: number;
  label: string;
};

const CLASSIC = CLASSIC_RESOURCE_TYPES;

function diceWeight(token: number | null | undefined): number {
  if (token == null) return 1;
  return Math.max(1, 6 - Math.abs(7 - token));
}

function canPayCost(
  state: GameState,
  playerId: string,
  resources: Partial<Record<ResourceType, number>>,
  materials: Partial<Record<UndergroundSkyMaterial, number>> = {},
): boolean {
  const player = state.players.get(playerId);
  const us = state.extensions?.undergroundSky;
  if (!player || !us) return false;
  if (!hasResources(player.resources, resources)) return false;
  return hasMaterials(getPlayerMaterials(us, playerId), materials);
}

function canAffordPiece(
  state: GameState,
  playerId: string,
  kind: keyof typeof US_BUILD_COSTS,
): boolean {
  const cost = getBuildCost(kind);
  return canPayCost(state, playerId, cost.resources, cost.materials);
}

function contractAffordableFromHand(
  state: GameState,
  playerId: string,
  contract: SkyContract,
): boolean {
  const player = state.players.get(playerId);
  const us = state.extensions?.undergroundSky;
  if (!player || !us) return false;
  if (contract.requirements.resources) {
    if (!hasResources(player.resources, contract.requirements.resources)) return false;
  }
  if (contract.requirements.materials) {
    if (!hasMaterials(getPlayerMaterials(us, playerId), contract.requirements.materials)) {
      return false;
    }
  }
  if (contract.requirements.commodities) {
    if (!isCitiesKnightsEnabled(state)) return false;
    const ck = state.extensions?.citiesKnights;
    const bag = ck?.playerCommodities[playerId] ?? {};
    for (const [key, need] of Object.entries(contract.requirements.commodities)) {
      if ((bag[key as keyof typeof bag] ?? 0) < (need ?? 0)) return false;
    }
  }
  return true;
}

function cargoCoversContract(airship: SkyAirship, contract: SkyContract): boolean {
  const req = contract.requirements;
  if (req.resources) {
    for (const [key, need] of Object.entries(req.resources)) {
      const have = airship.cargo
        .filter((c) => c.kind === 'resource' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < (need ?? 0)) return false;
    }
  }
  if (req.materials) {
    for (const [key, need] of Object.entries(req.materials)) {
      const have = airship.cargo
        .filter((c) => c.kind === 'material' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < (need ?? 0)) return false;
    }
  }
  if (req.commodities) {
    for (const [key, need] of Object.entries(req.commodities)) {
      const have = airship.cargo
        .filter((c) => c.kind === 'commodity' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < (need ?? 0)) return false;
    }
  }
  return true;
}

function buildCargoForContract(
  state: GameState,
  playerId: string,
  contract: SkyContract,
  capacity: number,
): AirshipCargoItem[] | null {
  const player = state.players.get(playerId);
  const us = state.extensions?.undergroundSky;
  if (!player || !us) return null;
  if (!contractAffordableFromHand(state, playerId, contract)) return null;

  const cargo: AirshipCargoItem[] = [];
  let used = 0;
  const push = (item: AirshipCargoItem) => {
    if (used + item.amount > capacity) return false;
    cargo.push(item);
    used += item.amount;
    return true;
  };

  if (contract.requirements.resources) {
    for (const [key, need] of Object.entries(contract.requirements.resources)) {
      const amount = need ?? 0;
      if (amount <= 0) continue;
      if (!push({ kind: 'resource', key: key as ResourceType, amount })) return null;
    }
  }
  if (contract.requirements.materials) {
    for (const [key, need] of Object.entries(contract.requirements.materials)) {
      const amount = need ?? 0;
      if (amount <= 0) continue;
      if (
        !push({
          kind: 'material',
          key: key as UndergroundSkyMaterial,
          amount,
        })
      ) {
        return null;
      }
    }
  }
  if (contract.requirements.commodities && isCitiesKnightsEnabled(state)) {
    for (const [key, need] of Object.entries(contract.requirements.commodities)) {
      const amount = need ?? 0;
      if (amount <= 0) continue;
      if (!push({ kind: 'commodity', key: key as 'ck_cloth' | 'ck_coin' | 'ck_paper', amount })) {
        return null;
      }
    }
  }
  return cargo;
}

function faceUpContracts(us: UndergroundSkyState): SkyContract[] {
  return [
    ...us.faceUpRegularContracts,
    ...(us.faceUpMajorContract ? [us.faceUpMajorContract] : []),
  ];
}

function contractEligible(
  us: UndergroundSkyState,
  playerId: string,
  contract: SkyContract,
): boolean {
  if (!contract.isMajor) return true;
  if ((us.completedRegularContracts[playerId] ?? 0) < 2) return false;
  if (us.completedMajorContracts[playerId]) return false;
  return true;
}

function contractScore(contract: SkyContract, us: UndergroundSkyState, playerId: string): number {
  let score = 55 + contract.masteryPoints * 8;
  if (contract.victoryPoints > 0) score += 35;
  if (contract.isMajor) score += 20;
  const contractsDone = us.completedRegularContracts[playerId] ?? 0;
  const beacons = us.beacons.filter((b) => b.playerId === playerId).length;
  const alizes = contractsDone + 2 * beacons;
  if (alizes >= 3 && alizes < 5) score += 18; // sprint Alizés
  if (alizes >= 5) score += 6;
  return score;
}

function resolvePending(
  state: GameState,
  playerId: string,
  us: UndergroundSkyState,
): GameCommand | null {
  const pending = us.pendingResolutions.find((p) => p.playerId === playerId);
  if (!pending) return null;
  const player = state.players.get(playerId);
  if (!player) return null;

  if (pending.kind === 'thermal_output') {
    const wheat = player.resources.wheat ?? 0;
    const sheep = player.resources.sheep ?? 0;
    const resource = wheat <= sheep ? 'wheat' : 'sheep';
    return {
      type: 'us_choose_thermal_output',
      playerId,
      outpostId: pending.outpostId,
      resource,
    };
  }

  if (pending.kind === 'sky_material_choice') {
    const mats = getPlayerMaterials(us, playerId);
    const crystal = mats.us_crystal ?? 0;
    const aether = mats.us_aether ?? 0;
    const beacons = us.beacons.filter((b) => b.playerId === playerId).length;
    const extractors = us.outposts.filter(
      (o) => o.playerId === playerId && o.upgradedExtractor,
    ).length;
    let choice: UndergroundSkyMaterial = pending.choices[0] ?? 'us_crystal';
    if (pending.choices.includes('us_aether') && beacons < US_PIECE_LIMITS.beacons && aether <= crystal) {
      choice = 'us_aether';
    } else if (
      pending.choices.includes('us_crystal') &&
      extractors < US_PIECE_LIMITS.extractors &&
      crystal <= aether
    ) {
      choice = 'us_crystal';
    }
    return {
      type: 'us_choose_discovery_reward',
      playerId,
      nodeId: pending.hubId,
      choice,
    };
  }

  if (pending.kind === 'discovery_reward') {
    const mats = getPlayerMaterials(us, playerId);
    const bank = us.materialBank;
    const preferMaterial = (['us_crystal', 'us_aether'] as UndergroundSkyMaterial[]).find(
      (m) =>
        pending.choices.includes(m as never) &&
        (bank[m] ?? 0) > 0 &&
        (mats[m] ?? 0) < 2,
    );
    if (preferMaterial) {
      return {
        type: 'us_choose_discovery_reward',
        playerId,
        nodeId: pending.nodeId,
        choice: preferMaterial,
      };
    }
    const classicPrefs = [...CLASSIC].sort(
      (a, b) => (player.resources[a] ?? 0) - (player.resources[b] ?? 0),
    );
    const classicChoice =
      classicPrefs.find((r) => pending.choices.includes(r as never)) ??
      CLASSIC.find((r) => pending.choices.includes(r as never));
    const choice = classicChoice ?? String(pending.choices[0] ?? 'wood');
    return {
      type: 'us_choose_discovery_reward',
      playerId,
      nodeId: pending.nodeId,
      choice,
    };
  }

  return null;
}

function hubForSite(
  us: UndergroundSkyState,
  site: string,
  fromHubId?: string | null,
): string | null {
  const matches = Object.values(us.skyGraph.hubs).filter((hub) => hub.site === site);
  if (matches.length === 0) return null;
  if (!fromHubId) return matches[0]!.id;
  let best: { id: string; cost: number } | null = null;
  for (const hub of matches) {
    const path = findShortestSkyPath(us.skyGraph, fromHubId, hub.id, {
      beacons: us.beacons,
    });
    if (!path) continue;
    if (!best || path.totalCost < best.cost) {
      best = { id: hub.id, cost: path.totalCost };
    }
  }
  return best?.id ?? matches[0]!.id;
}

function bestExploreHub(
  us: UndergroundSkyState,
  fromHubId: string,
  playerId: string,
): { hubId: string; cost: number } | null {
  const priorities: Array<{ site: string; bonus: number }> = [
    { site: 'aether_source', bonus: 20 },
    { site: 'hanging_ruins', bonus: 18 },
    { site: 'observatory', bonus: 14 },
    { site: 'floating_garden', bonus: 10 },
    { site: 'wind_bazaar', bonus: 8 },
    { site: 'calm_mooring', bonus: 4 },
  ];
  let best: { hubId: string; cost: number; score: number } | null = null;
  for (const hub of Object.values(us.skyGraph.hubs)) {
    if (hub.id === fromHubId) continue;
    const path = findShortestSkyPath(us.skyGraph, fromHubId, hub.id, {
      playerId,
      beacons: us.beacons,
    });
    if (!path) continue;
    const prio = priorities.find((p) => p.site === hub.site)?.bonus ?? 1;
    const unrevealed = us.revealedSkyHubIds.includes(hub.id) ? 0 : 12;
    const score = prio + unrevealed - path.totalCost * 2;
    if (!best || score > best.score) {
      best = { hubId: hub.id, cost: path.totalCost, score };
    }
  }
  return best ? { hubId: best.hubId, cost: best.cost } : null;
}

function outpostProductionScore(
  us: UndergroundSkyState,
  outpost: UndergroundOutpost,
): number {
  const node = us.undergroundGraph.nodes[outpost.nodeId];
  if (!node) return 0;
  const output = US_DISCOVERY_OUTPUT[node.discovery];
  let score = diceWeight(node.numberToken) * 4;
  if (output === 'us_crystal' || output === 'us_aether') score += 10;
  if (outpost.upgradedExtractor) score += 6;
  return score;
}

function classicReservePressure(state: GameState, playerId: string): number {
  // Plus la main est tendue pour les builds classiques, plus on pénalise US.
  const player = state.players.get(playerId);
  if (!player) return 10;
  const hand = totalClassicResources(player.resources);
  const settlements = player.settlements?.length ?? 0;
  const cities = player.cities?.length ?? 0;
  let pressure = 0;
  if (hand < 4) pressure += 8;
  else if (hand < 6) pressure += 4;
  if (settlements < 3 && (player.resources.wood ?? 0) + (player.resources.clay ?? 0) >= 2) {
    pressure += 3;
  }
  if (cities < 2 && (player.resources.ore ?? 0) >= 2 && (player.resources.wheat ?? 0) >= 1) {
    pressure += 4;
  }
  return pressure;
}

function scoreThreshold(difficulty: AIDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 18;
    case 'medium':
      return 10;
    case 'hard':
      return 6;
    case 'legendary':
      return 3;
    default:
      return 10;
  }
}

function collectCandidates(
  state: GameState,
  playerId: string,
  us: UndergroundSkyState,
  difficulty: AIDifficulty,
): UsCandidate[] {
  const player = state.players.get(playerId);
  if (!player) return [];
  const board = state.classicBoard;
  const candidates: UsCandidate[] = [];
  const pressure = classicReservePressure(state, playerId);
  const ugScore = undergroundMasteryScore(state, playerId);
  const skyScore = skyMasteryScore(state, playerId);
  const myShafts = us.shafts.filter((s) => s.playerId === playerId);
  const myTunnels = us.tunnels.filter((t) => t.playerId === playerId);
  const myOutposts = us.outposts.filter((o) => o.playerId === playerId);
  const myLifts = us.lifts.filter((l) => l.playerId === playerId);
  const myAirports = us.airports.filter((a) => a.playerId === playerId);
  const myAirships = us.airships.filter((a) => a.playerId === playerId);
  const myBeacons = us.beacons.filter((b) => b.playerId === playerId);
  const usage = us.perTurnUsage[playerId];

  const push = (command: GameCommand, score: number, label: string) => {
    candidates.push({ command, score: score - pressure, label });
  };

  // --- Déchargement (uniquement à l’aéroport d’attache) ---
  for (const ship of myAirships) {
    if (ship.route || ship.cargo.length === 0) continue;
    if (!isAirshipAtHomeAirport(state, ship)) continue;
    push(
      { type: 'us_unload_airship', playerId, airshipId: ship.id },
      72,
      'unload',
    );
  }

  // --- Contrats via cargo (dirigeable amarré obligatoire) ---
  for (const ship of myAirships) {
    if (ship.route || ship.cargo.length === 0) continue;
    for (const contract of faceUpContracts(us)) {
      if (!contractEligible(us, playerId, contract)) continue;
      if (!cargoCoversContract(ship, contract)) continue;
      if (contract.preferredSite) {
        const hub = ship.currentHubId ? us.skyGraph.hubs[ship.currentHubId] : null;
        if (hub?.site !== contract.preferredSite) continue;
      }
      push(
        {
          type: 'us_complete_contract',
          playerId,
          contractId: contract.id,
          airshipId: ship.id,
        },
        contractScore(contract, us, playerId) + 18,
        `contract-cargo:${contract.kind}`,
      );
    }
  }

  // --- Expédition / chargement à quai pour contrats ---
  for (const ship of myAirships) {
    if (ship.route || !ship.currentHubId) continue;
    const airport = myAirports.find((a) => a.id === ship.airportId);
    if (!airport || airport.suspended) continue;
    const fromHub = ship.currentHubId as string;

    for (const contract of faceUpContracts(us)) {
      if (!contractEligible(us, playerId, contract)) continue;

      // Déjà en soute → ferry vers site préféré si besoin
      if (ship.cargo.length > 0) {
        if (!cargoCoversContract(ship, contract)) continue;
        if (!contract.preferredSite) continue; // livrable ici via contract-cargo
        const hub = us.skyGraph.hubs[fromHub];
        if (hub?.site === contract.preferredSite) continue;
        const dest = hubForSite(us, contract.preferredSite, fromHub);
        if (!dest || dest === fromHub) continue;
        const path = findShortestSkyPath(us.skyGraph, fromHub, dest, {
          playerId,
          beacons: us.beacons,
        });
        if (!path) continue;
        push(
          {
            type: 'us_dispatch_airship',
            playerId,
            airshipId: ship.id,
            destinationHubId: dest,
            cargo: [],
          },
          contractScore(contract, us, playerId) - path.totalCost + 12,
          `ferry-contract:${contract.kind}`,
        );
        continue;
      }

      // Soute vide : charger (à quai ou en vol vers le site)
      const cargo = buildCargoForContract(state, playerId, contract, ship.capacity);
      if (!cargo) continue;

      if (contract.preferredSite) {
        const hub = us.skyGraph.hubs[fromHub];
        if (hub?.site === contract.preferredSite) {
          // Chargement à quai sur le bon site
          push(
            {
              type: 'us_dispatch_airship',
              playerId,
              airshipId: ship.id,
              destinationHubId: fromHub,
              cargo,
            },
            contractScore(contract, us, playerId) + 8,
            `load-contract:${contract.kind}`,
          );
          continue;
        }
        const dest = hubForSite(us, contract.preferredSite, fromHub);
        if (!dest || dest === fromHub) continue;
        const path = findShortestSkyPath(us.skyGraph, fromHub, dest, {
          playerId,
          beacons: us.beacons,
        });
        if (!path) continue;
        push(
          {
            type: 'us_dispatch_airship',
            playerId,
            airshipId: ship.id,
            destinationHubId: dest,
            cargo,
          },
          contractScore(contract, us, playerId) - path.totalCost + 5,
          `dispatch-contract:${contract.kind}`,
        );
        continue;
      }

      // Sans site préféré : charger à quai puis livrer le tour suivant
      push(
        {
          type: 'us_dispatch_airship',
          playerId,
          airshipId: ship.id,
          destinationHubId: fromHub,
          cargo,
        },
        contractScore(contract, us, playerId) + 6,
        `load-contract:${contract.kind}`,
      );
    }

    // Exploration à vide — skip si un contrat est finançable depuis la main
    if (ship.cargo.length === 0) {
      const canFundContract = faceUpContracts(us).some(
        (c) =>
          contractEligible(us, playerId, c) &&
          contractAffordableFromHand(state, playerId, c),
      );
      if (!canFundContract) {
        const explore = bestExploreHub(us, fromHub, playerId);
        if (explore) {
          push(
            {
              type: 'us_dispatch_airship',
              playerId,
              airshipId: ship.id,
              destinationHubId: explore.hubId,
              cargo: [],
            },
            28 - explore.cost + (difficulty === 'legendary' ? 6 : 0),
            'dispatch-explore',
          );
        }
      }
    }
  }

  // --- Prospection ---
  if (
    myShafts.length > 0 &&
    !usage?.surveyUsed &&
    canAffordPiece(state, playerId, 'survey')
  ) {
    const hidden = getAdjacentHiddenNodeIds(us, playerId);
    const network = getPlayerUndergroundNodeIds(us, playerId);
    const revealed = new Set(us.revealedUndergroundNodeIds);
    for (const nodeId of network) {
      if (!revealed.has(nodeId) && !hidden.includes(nodeId)) hidden.push(nodeId);
    }
    for (const nodeId of hidden) {
      if (!canSurvey(state, playerId, nodeId).ok) continue;
      push(
        { type: 'us_survey_cavern', playerId, nodeId },
        38 + (myTunnels.length < 3 ? 8 : 0),
        'survey',
      );
      break; // une seule cible suffit ; pickSuboptimal gère easy
    }
  }

  // --- Puits ---
  if (myShafts.length < US_PIECE_LIMITS.shafts && canAffordPiece(state, playerId, 'shaft') && board) {
    for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      if (us.shafts.some((s) => s.intersectionId === intersectionId)) continue;
      const buildingId = board.buildingByIntersection[intersectionId];
      const building = buildingId ? state.buildings.get(buildingId) : undefined;
      if (!building) continue;
      if (!['settlement', 'city', 'metropolis'].includes(building.definitionId)) continue;
      const tileIds = board.topology?.intersections[intersectionId]?.tileIds ?? [];
      for (const tileId of tileIds) {
        const node = Object.values(us.undergroundGraph.nodes).find(
          (n) => n.surfaceTileId === tileId,
        );
        if (!node) continue;
        const cityBonus = building.definitionId !== 'settlement' ? 6 : 0;
        push(
          {
            type: 'us_build_shaft',
            playerId,
            intersectionId,
            entryNodeId: node.id,
          },
          (myShafts.length === 0 ? 58 : 42) + cityBonus,
          'shaft',
        );
        break;
      }
    }
  }

  // --- Tunnels (vers nœuds prometteurs) ---
  if (myShafts.length > 0 && myTunnels.length < US_PIECE_LIMITS.tunnels) {
    const edgeScores: Array<{ edgeId: string; score: number }> = [];
    for (const edgeId of Object.keys(us.undergroundGraph.edges)) {
      const extend = canExtendTunnelToEdge(us, playerId, edgeId);
      if (!extend.ok) continue;
      const dest = us.undergroundGraph.nodes[extend.toNodeId];
      const unstable =
        dest?.discovery === 'unstable_fault' &&
        us.revealedUndergroundNodeIds.includes(extend.toNodeId);
      const cost = getTunnelBuildCost(state, playerId, {
        unstableFaultSurcharge: Boolean(unstable),
      });
      if (!canPayCost(state, playerId, cost.resources, cost.materials)) continue;
      let score = 36;
      if (dest) {
        if (!us.revealedUndergroundNodeIds.includes(dest.id)) score += 8;
        else {
          score += diceWeight(dest.numberToken) * 2;
          if (US_DISCOVERY_OUTPUT[dest.discovery]) score += 6;
          if (dest.discovery === 'natural_well') score += 10;
          if (dest.discovery === 'ancient_workshop') score += 9;
        }
        if (unstable) score -= 10;
      }
      if (ugScore >= 4 && ugScore < 7) score += 10; // sprint Profondeurs
      edgeScores.push({ edgeId, score });
    }
    edgeScores.sort((a, b) => b.score - a.score);
    for (const entry of edgeScores.slice(0, 3)) {
      push(
        { type: 'us_build_tunnel', playerId, edgeId: entry.edgeId },
        entry.score,
        'tunnel',
      );
    }
  }

  // --- Avant-postes ---
  if (myOutposts.length < US_PIECE_LIMITS.outposts && canAffordPiece(state, playerId, 'outpost')) {
    const network = getPlayerUndergroundNodeIds(us, playerId);
    const occupied = new Set(us.outposts.map((o) => o.nodeId));
    const scored: Array<{ nodeId: string; score: number }> = [];
    for (const nodeId of network) {
      if (occupied.has(nodeId)) continue;
      if (!us.revealedUndergroundNodeIds.includes(nodeId)) continue;
      const node = us.undergroundGraph.nodes[nodeId];
      if (!node) continue;
      let score = 34 + diceWeight(node.numberToken) * 3;
      if (US_DISCOVERY_OUTPUT[node.discovery]) score += 12;
      if (node.discovery === 'natural_well') score += 8;
      if (node.discovery === 'sealed_chamber') score += 7;
      if (node.discovery === 'ancient_workshop') score += 9;
      if (node.discovery === 'unstable_fault') score -= 15;
      scored.push({ nodeId, score });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const entry of scored.slice(0, 3)) {
      push(
        { type: 'us_build_outpost', playerId, nodeId: entry.nodeId },
        entry.score,
        'outpost',
      );
    }
  }

  // --- Extracteurs ---
  if (
    myOutposts.filter((o) => o.upgradedExtractor).length < US_PIECE_LIMITS.extractors &&
    canAffordPiece(state, playerId, 'extractor')
  ) {
    const targets = myOutposts
      .filter((o) => !o.upgradedExtractor)
      .map((o) => ({ o, score: outpostProductionScore(us, o) }))
      .filter(({ o }) => {
        const node = us.undergroundGraph.nodes[o.nodeId];
        if (!node) return false;
        return Boolean(
          US_DISCOVERY_OUTPUT[node.discovery] ||
            node.discovery === 'thermal_spring' ||
            node.discovery === 'ancient_workshop',
        );
      })
      .sort((a, b) => b.score - a.score);
    for (const { o, score } of targets.slice(0, 2)) {
      push(
        { type: 'us_upgrade_extractor', playerId, outpostId: o.id },
        50 + score + (ugScore >= 4 ? 8 : 0),
        'extractor',
      );
    }
  }

  // --- Ascenseurs ---
  if (
    myLifts.length < US_PIECE_LIMITS.lifts &&
    canAffordPiece(state, playerId, 'lift') &&
    board
  ) {
    const network = getPlayerUndergroundNodeIds(us, playerId);
    const used = new Set(us.lifts.map((l) => l.nodeId));
    for (const nodeId of network) {
      if (used.has(nodeId)) continue;
      const node = us.undergroundGraph.nodes[nodeId];
      if (!node || node.discovery !== 'natural_well') continue;
      if (!us.revealedUndergroundNodeIds.includes(nodeId)) continue;
      if (!node.surfaceEdgeId) continue;
      if (board.roadsByEdge[node.surfaceEdgeId]) continue;
      if (us.lifts.some((l) => l.surfaceEdgeId === node.surfaceEdgeId)) continue;
      push(
        { type: 'us_build_lift', playerId, nodeId },
        54 + (ugScore >= 4 ? 10 : 0),
        'lift',
      );
    }
  }

  // --- Aéroports ---
  if (
    myAirports.length < US_PIECE_LIMITS.airports &&
    canAffordPiece(state, playerId, 'airport') &&
    board
  ) {
    for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      if (us.airports.some((a) => a.intersectionId === intersectionId)) continue;
      const buildingId = board.buildingByIntersection[intersectionId];
      const building = buildingId ? state.buildings.get(buildingId) : undefined;
      if (!building) continue;
      if (building.definitionId !== 'city' && building.definitionId !== 'metropolis') continue;
      push(
        { type: 'us_build_airport', playerId, intersectionId },
        myAirports.length === 0 ? 52 : 40,
        'airport',
      );
    }
  }

  // --- Dirigeables ---
  if (
    myAirships.length < US_PIECE_LIMITS.airships &&
    canAffordPiece(state, playerId, 'airship')
  ) {
    for (const airport of myAirports) {
      if (airport.suspended) continue;
      const docked = myAirships.filter((a) => a.airportId === airport.id).length;
      if (docked >= 1 && myAirships.length >= 1) {
        // second ship lower priority
      }
      push(
        { type: 'us_build_airship', playerId, airportId: airport.id },
        myAirships.length === 0 ? 50 : 36,
        'airship',
      );
    }
  }

  // --- Balises (hubs déjà révélés uniquement) ---
  if (myBeacons.length < US_PIECE_LIMITS.beacons && canAffordPiece(state, playerId, 'beacon')) {
    const taken = new Set(us.beacons.map((b) => b.hubId));
    const scored: Array<{ hubId: string; score: number }> = [];
    for (const hubId of us.revealedSkyHubIds) {
      if (taken.has(hubId)) continue;
      const hub = us.skyGraph.hubs[hubId];
      if (!hub) continue;
      let score = 32;
      const degree = (us.skyGraph.adjacency[hubId] ?? []).length;
      score += degree * 3;
      if (hub.site === 'turbulent_zone') score += 8;
      if (hub.site === 'calm_mooring') score += 4;
      if (skyScore >= 2 && skyScore < 5) score += 12;
      scored.push({ hubId, score });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const entry of scored.slice(0, 2)) {
      push(
        { type: 'us_build_beacon', playerId, hubId: entry.hubId },
        entry.score,
        'beacon',
      );
    }
  }

  // --- Upgrades dirigeable ---
  for (const ship of myAirships) {
    if (!ship.etherSails && canAffordPiece(state, playerId, 'ether_sails')) {
      push(
        {
          type: 'us_upgrade_airship',
          playerId,
          airshipId: ship.id,
          upgrade: 'ether_sails',
        },
        40 + (myAirships.some((s) => s.route) ? 8 : 0),
        'ether_sails',
      );
    }
    if (!ship.reinforcedHold && canAffordPiece(state, playerId, 'reinforced_hold')) {
      const wantsCargo = faceUpContracts(us).some(
        (c) =>
          contractEligible(us, playerId, c) &&
          ((c.requirements.resources &&
            Object.values(c.requirements.resources).reduce((s, n) => s + (n ?? 0), 0) >= 2) ||
            c.requirements.materials),
      );
      push(
        {
          type: 'us_upgrade_airship',
          playerId,
          airshipId: ship.id,
          upgrade: 'reinforced_hold',
        },
        34 + (wantsCargo ? 10 : 0),
        'reinforced_hold',
      );
    }
  }

  // Matériaux inutilisés + banque : hint via score déjà dans extractor/beacon

  // Easy : moins de candidats « exploration »
  if (difficulty === 'easy') {
    return candidates.filter((c) => c.score >= 20 || c.label.startsWith('contract'));
  }

  return candidates;
}

/**
 * Propose au plus une commande US, ou null si l’investissement n’est pas rentable.
 * @param options.urgentOnly — uniquement unload / contrats cargo prêts (+ pendings).
 */
export function chooseUndergroundSkyAction(
  state: GameState,
  playerId: string,
  options?: { difficulty?: AIDifficulty; urgentOnly?: boolean },
): GameCommand | null {
  if (!isUndergroundSkyEnabled(state)) return null;
  if (state.turnPhase !== 'player_action') return null;
  const us = state.extensions?.undergroundSky;
  if (!us) return null;
  if (!state.players.get(playerId)) return null;

  const difficulty = options?.difficulty ?? 'medium';

  // Toujours résoudre les pendings (sinon softlock end_turn).
  const pending = resolvePending(state, playerId, us);
  if (pending) return pending;

  // Économie trop faible → laisser le planner classique (sauf urgences US).
  const player = state.players.get(playerId)!;
  const hand = totalClassicResources(player.resources);
  const mats = totalMaterials(us.playerMaterials[playerId] ?? {});
  const hasCargoToUnload = us.airships.some(
    (a) =>
      a.playerId === playerId &&
      !a.route &&
      a.cargo.length > 0 &&
      isAirshipAtHomeAirport(state, a),
  );
  const hasUsFootprint =
    us.shafts.some((s) => s.playerId === playerId) ||
    us.airports.some((a) => a.playerId === playerId) ||
    us.outposts.some((o) => o.playerId === playerId);
  if (!hasCargoToUnload && !hasUsFootprint && hand < 2 && mats === 0) {
    return null;
  }

  let candidates = collectCandidates(state, playerId, us, difficulty);
  if (candidates.length === 0) return null;

  const isUrgent = (c: UsCandidate) =>
    c.label === 'unload' || c.label.startsWith('contract-cargo');

  if (options?.urgentOnly) {
    candidates = candidates.filter(isUrgent);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return candidates[0]!.command;
  }

  // Difficulté basse : souvent skip l’investissement US, jamais les urgences.
  if (!shouldTakeRiskyAction(difficulty)) {
    candidates = candidates.filter(isUrgent);
    if (candidates.length === 0) return null;
  }

  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const threshold = scoreThreshold(difficulty);
  const viable = candidates.filter(
    (c) => c.score >= threshold || isUrgent(c),
  );
  if (viable.length === 0) return null;

  const policy = getDifficultyPolicy(difficulty);
  const picked =
    policy.suboptimalChance > 0
      ? pickSuboptimal(viable, difficulty)
      : viable[0]!;
  return picked?.command ?? null;
}

/** Candidats US scorés pour fusion L1 (hors urgences déjà gérées à part). */
export function listUndergroundSkyScoredActions(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty = 'medium',
): Array<{ command: GameCommand; score: number; label: string }> {
  if (!isUndergroundSkyEnabled(state)) return [];
  if (state.turnPhase !== 'player_action') return [];
  const us = state.extensions?.undergroundSky;
  if (!us) return [];

  const isUrgent = (label: string) =>
    label === 'unload' || label.startsWith('contract-cargo');

  return collectCandidates(state, playerId, us, difficulty)
    .filter((c) => !isUrgent(c.label))
    .map((c) => ({
      command: c.command,
      // Normalise vers l’échelle CandidateGen (~0–80) via Δeval-friendly offset
      score: Math.min(78, c.score * 0.85),
      label: `us:${c.label}`,
    }));
}

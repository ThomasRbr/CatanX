/**
 * Commandes us_* — Souterrain & Ciel.
 */

import type { GameState } from '../../types/game';
import type { ResourceType } from '../../types/resources';
import type {
  AirshipCargoItem,
  SkyAirship,
  UndergroundSkyMaterial,
} from '../../types/undergroundSky';
import {
  US_AIRSHIP_BASE_CAPACITY,
  US_AIRSHIP_REINFORCED_CAPACITY,
  US_PIECE_LIMITS,
} from '../../types/undergroundSky';
import { CK_COMMODITIES } from '../../types/citiesKnights';
import {
  isCitiesKnightsEnabled,
  isUndergroundSkyEnabled,
} from '../../core/extensions';
import { peUndergroundAllyIds, peNoteAlliedTunnelUse, peSkyAllyIds, peNoteAlliedSkyUse } from '../pactsEmbassies/adapters';
import { commandError, commandSuccess, type CommandResult } from '../../core/errors';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import {
  hasResources,
  subtractResources,
  addResources,
} from '../resources/ResourceSystem';
import { returnResourcesToBank, CLASSIC_RESOURCE_TYPES } from '../catan/ClassicBoard';
import {
  addCkCommodities,
  ensureCitiesKnightsState,
  subtractCkCommodities,
  hasCkCommodities,
} from '../citiesKnights/state';
import {
  getBuildCost,
  getExtractorBuildCost,
  getOutpostBuildCost,
  getTunnelBuildCost,
  markTunnelWorksUsed,
} from './costs';
import {
  canExtendTunnelToEdge,
  canSurvey,
  geologyHintsNearNode,
  isNodeConnectedToPlayer,
} from './network';
import {
  getPlayerMaterials,
  hasMaterials,
  spendPlayerMaterials,
  syncPublicMaterialCounts,
  grantMaterialsFromBank,
  returnMaterialsToBank,
} from './materials';
import { queueUndergroundSkyEvents, drainUndergroundSkyEvents } from './events';
import { ensureUndergroundSkyState } from './state';
import { findShortestSkyPath } from './pathfinding';
import { nearestSkyHubsForIntersection, estimateAirshipEtaForState } from './airships';
import {
  findFaceUpContract,
  replaceCompletedContract,
} from './contracts';
import { recomputeUndergroundSkyMastery } from './mastery';
import { refreshTrophiesAndVictory } from '../game/GameEngine';

function disabled(): CommandResult {
  return commandError(
    'extension_disabled',
    'Extension Souterrain & Ciel inactive.',
  );
}

function requireUs(state: GameState): CommandResult | null {
  if (!isUndergroundSkyEnabled(state)) return disabled();
  return null;
}

function requireActionTurn(
  state: GameState,
  playerId: string,
): CommandResult | null {
  if (state.phase !== 'playing' || state.turnPhase !== 'player_action') {
    return commandError(
      'wrong_phase',
      'Action indisponible dans cette phase.',
    );
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return commandError('not_your_turn', "Ce n'est pas votre tour.");
  }
  return null;
}

function log(
  state: GameState,
  playerId: string,
  description: string,
  data: Record<string, unknown> = {},
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId,
    type: 'build',
    description,
    data,
    timestamp: now(),
  });
}

function intersectionBuilding(
  state: GameState,
  intersectionId: string,
): { ownerId: string; definitionId: string } | null {
  const board = state.classicBoard;
  if (!board) return null;
  const ownerId = board.occupiedIntersections[intersectionId];
  if (!ownerId) return null;
  const buildingId = board.buildingByIntersection[intersectionId];
  const building = buildingId ? state.buildings.get(buildingId) : undefined;
  if (!building) return null;
  return { ownerId, definitionId: building.definitionId };
}

function payCost(
  state: GameState,
  playerId: string,
  resources: Record<string, number | undefined>,
  materials: Record<string, number | undefined>,
): CommandResult | null {
  const us = state.extensions!.undergroundSky!;
  const player = state.players.get(playerId);
  if (!player) return commandError('invalid_player', 'Joueur inconnu.');

  const resBundle = { ...resources } as Parameters<typeof hasResources>[1];
  if (!hasResources(player.resources, resBundle)) {
    return commandError(
      'insufficient_resources',
      'Ressources insuffisantes.',
    );
  }
  const matBundle = { ...materials };
  if (!hasMaterials(getPlayerMaterials(us, playerId), matBundle)) {
    return commandError(
      'insufficient_materials',
      'Matériaux insuffisants.',
    );
  }
  player.resources = subtractResources(player.resources, resBundle);
  returnResourcesToBank(state, resBundle);
  if (!spendPlayerMaterials(us, playerId, matBundle)) {
    return commandError(
      'insufficient_materials',
      'Matériaux insuffisants.',
    );
  }
  return null;
}

function revealUndergroundNode(
  state: GameState,
  nodeId: string,
  playerId: string,
): void {
  const us = state.extensions!.undergroundSky!;
  if (us.revealedUndergroundNodeIds.includes(nodeId)) return;
  us.revealedUndergroundNodeIds.push(nodeId);
  const node = us.undergroundGraph.nodes[nodeId];
  queueUndergroundSkyEvents(state, [
    {
      type: 'us_cavern_revealed',
      payload: {
        nodeId,
        playerId,
        discovery: node?.discovery,
        numberToken: node?.numberToken,
        geologyCategory: node?.geologyCategory,
      },
    },
  ]);
}

function finish(state: GameState, events: ReturnType<typeof drainUndergroundSkyEvents>): CommandResult {
  recomputeUndergroundSkyMastery(state);
  refreshTrophiesAndVictory(state);
  const drained = drainUndergroundSkyEvents(state);
  return commandSuccess(state, [...events, ...drained]);
}

// ---------------------------------------------------------------------------
// Shaft
// ---------------------------------------------------------------------------

export function usBuildShaft(
  state: GameState,
  playerId: string,
  intersectionId: string,
  entryNodeId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  const building = intersectionBuilding(state, intersectionId);
  if (!building || building.ownerId !== playerId) {
    return commandError(
      'invalid_intersection',
      'Le puits doit être sur une de vos colonies ou villes.',
    );
  }
  if (
    building.definitionId !== 'settlement' &&
    building.definitionId !== 'city' &&
    building.definitionId !== 'metropolis'
  ) {
    return commandError(
      'invalid_building',
      'Le puits exige une colonie, ville ou métropole.',
    );
  }
  if (us.shafts.filter((s) => s.playerId === playerId).length >= US_PIECE_LIMITS.shafts) {
    return commandError('piece_limit', 'Limite de puits atteinte.');
  }
  if (us.shafts.some((s) => s.intersectionId === intersectionId)) {
    return commandError('occupied', 'Cette intersection a déjà un puits.');
  }

  const node = us.undergroundGraph.nodes[entryNodeId];
  if (!node) {
    return commandError('invalid_node', 'Nœud d’entrée inconnu.');
  }
  // Le nœud d’entrée doit être sous une tuile touchant l’intersection
  const board = state.classicBoard!;
  const intersection = board.topology.intersections[intersectionId];
  if (!intersection?.tileIds.includes(node.surfaceTileId)) {
    return commandError(
      'invalid_entry',
      'Le nœud d’entrée doit être adjacent à cette intersection.',
    );
  }

  const cost = getBuildCost('shaft');
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;

  const shaft = {
    id: nextId('us_shaft'),
    playerId,
    intersectionId,
    entryNodeId,
  };
  us.shafts.push(shaft);
  revealUndergroundNode(state, entryNodeId, playerId);

  const hints = geologyHintsNearNode(us, entryNodeId);
  queueUndergroundSkyEvents(state, [
    {
      type: 'us_shaft_opened',
      payload: { shaftId: shaft.id, playerId, intersectionId, entryNodeId, hints },
    },
  ]);
  log(state, playerId, 'Puits d’accès construit', { intersectionId, entryNodeId });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------

export function usSurveyCavern(
  state: GameState,
  playerId: string,
  nodeId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  const check = canSurvey(state, playerId, nodeId);
  if (!check.ok) {
    return commandError('survey_illegal', check.reason);
  }

  const cost = getBuildCost('survey');
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;

  us.perTurnUsage[playerId] = { surveyUsed: true };
  revealUndergroundNode(state, nodeId, playerId);
  log(state, playerId, 'Prospection de caverne', { nodeId });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Tunnel
// ---------------------------------------------------------------------------

export function usBuildTunnel(
  state: GameState,
  playerId: string,
  edgeId: string,
  useSeasonPreparation?: boolean,
  pactId?: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  if (us.tunnels.filter((t) => t.playerId === playerId).length >= US_PIECE_LIMITS.tunnels) {
    return commandError('piece_limit', 'Limite de tunnels atteinte.');
  }

  const allies = peUndergroundAllyIds(state, playerId);
  const solo = canExtendTunnelToEdge(us, playerId, edgeId, []);
  const extend = canExtendTunnelToEdge(us, playerId, edgeId, allies);
  if (!extend.ok) {
    return commandError('tunnel_illegal', extend.reason);
  }

  // Influence uniquement si le réseau allié a rendu l’extension possible
  if (!solo.ok && extend.ok) {
    void pactId;
    const soloAllies = allies.filter(
      (allyId) => canExtendTunnelToEdge(us, playerId, edgeId, [allyId]).ok,
    );
    const toCredit = soloAllies.length > 0 ? soloAllies : allies;
    for (const allyId of toCredit) {
      peNoteAlliedTunnelUse(state, playerId, allyId);
    }
  }

  const destNode = us.undergroundGraph.nodes[extend.toNodeId];
  const unstable =
    destNode?.discovery === 'unstable_fault' &&
    us.revealedUndergroundNodeIds.includes(extend.toNodeId);

  const cost = getTunnelBuildCost(state, playerId, {
    useSeasonPreparation,
    unstableFaultSurcharge: Boolean(unstable),
  });
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;
  markTunnelWorksUsed(state, playerId, { useSeasonPreparation });

  const tunnel = {
    id: nextId('us_tunnel'),
    playerId,
    edgeId,
  };
  us.tunnels.push(tunnel);

  queueUndergroundSkyEvents(state, [
    {
      type: 'us_tunnel_built',
      payload: { tunnelId: tunnel.id, playerId, edgeId },
    },
  ]);
  log(state, playerId, 'Tunnel construit', { edgeId });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Outpost
// ---------------------------------------------------------------------------

export function usBuildOutpost(
  state: GameState,
  playerId: string,
  nodeId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  if (us.outposts.filter((o) => o.playerId === playerId).length >= US_PIECE_LIMITS.outposts) {
    return commandError('piece_limit', 'Limite d’avant-postes atteinte.');
  }
  if (us.outposts.some((o) => o.nodeId === nodeId)) {
    return commandError('occupied', 'Ce nœud a déjà un avant-poste.');
  }
  if (!us.revealedUndergroundNodeIds.includes(nodeId)) {
    return commandError('hidden', 'Le nœud doit être révélé.');
  }
  if (!isNodeConnectedToPlayer(us, playerId, nodeId)) {
    return commandError(
      'not_connected',
      'Le nœud doit être connecté à votre réseau.',
    );
  }

  const node = us.undergroundGraph.nodes[nodeId];
  if (!node) return commandError('invalid_node', 'Nœud inconnu.');

  const workshopDiscount =
    node.discovery === 'ancient_workshop' && !node.workshopDiscountClaimed;
  const cost = getOutpostBuildCost({ workshopOreDiscount: workshopDiscount });
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;
  if (workshopDiscount) node.workshopDiscountClaimed = true;

  const outpost = {
    id: nextId('us_outpost'),
    playerId,
    nodeId,
    upgradedExtractor: false,
  };
  us.outposts.push(outpost);

  if (node.discovery === 'thermal_spring' && !node.thermalChoice) {
    us.pendingResolutions.push({
      kind: 'thermal_output',
      playerId,
      outpostId: outpost.id,
      nodeId,
    });
  }
  if (node.discovery === 'sealed_chamber' && !node.sealedChamberClaimed) {
    us.pendingResolutions.push({
      kind: 'discovery_reward',
      playerId,
      nodeId,
      discovery: 'sealed_chamber',
      choices: [...CLASSIC_RESOURCE_TYPES],
    });
  }

  queueUndergroundSkyEvents(state, [
    {
      type: 'us_outpost_built',
      payload: { outpostId: outpost.id, playerId, nodeId },
    },
  ]);
  log(state, playerId, 'Avant-poste souterrain construit', { nodeId });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export function usUpgradeExtractor(
  state: GameState,
  playerId: string,
  outpostId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  const outpost = us.outposts.find((o) => o.id === outpostId);
  if (!outpost || outpost.playerId !== playerId) {
    return commandError('invalid_outpost', 'Avant-poste introuvable.');
  }
  if (outpost.upgradedExtractor) {
    return commandError('already_upgraded', 'Extracteur déjà installé.');
  }
  if (
    us.outposts.filter((o) => o.playerId === playerId && o.upgradedExtractor)
      .length >= US_PIECE_LIMITS.extractors
  ) {
    return commandError('piece_limit', 'Limite d’extracteurs atteinte.');
  }

  const node = us.undergroundGraph.nodes[outpost.nodeId];
  if (!node) return commandError('invalid_node', 'Nœud inconnu.');
  // Sites productifs seulement
  const productive = [
    'fossil_roots',
    'clay_bank',
    'fungiculture',
    'woolly_lichen',
    'iron_vein',
    'crystal_geode',
    'aether_breath',
    'thermal_spring',
    'ancient_workshop',
  ];
  if (!productive.includes(node.discovery)) {
    return commandError(
      'not_productive',
      'Seul un site productif peut recevoir un extracteur.',
    );
  }

  const workshopDiscount =
    node.discovery === 'ancient_workshop' && !node.workshopDiscountClaimed;
  const cost = getExtractorBuildCost({ workshopOreDiscount: workshopDiscount });
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;
  if (workshopDiscount) node.workshopDiscountClaimed = true;

  outpost.upgradedExtractor = true;
  log(state, playerId, 'Extracteur amélioré', { outpostId });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Lift
// ---------------------------------------------------------------------------

export function usBuildLift(
  state: GameState,
  playerId: string,
  nodeId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;
  const board = state.classicBoard;
  if (!board) return commandError('no_board', 'Plateau topologique requis.');

  if (us.lifts.filter((l) => l.playerId === playerId).length >= US_PIECE_LIMITS.lifts) {
    return commandError('piece_limit', 'Limite d’ascenseurs atteinte.');
  }
  const node = us.undergroundGraph.nodes[nodeId];
  if (!node || node.discovery !== 'natural_well') {
    return commandError('not_well', 'Un ascenseur exige un Puits naturel.');
  }
  if (!us.revealedUndergroundNodeIds.includes(nodeId)) {
    return commandError('hidden', 'Le puits naturel doit être révélé.');
  }
  if (!isNodeConnectedToPlayer(us, playerId, nodeId)) {
    return commandError(
      'not_connected',
      'Connectez votre réseau jusqu’au Puits naturel.',
    );
  }
  if (!node.surfaceEdgeId) {
    return commandError('no_surface_edge', 'Arête de surface manquante.');
  }
  if (board.roadsByEdge[node.surfaceEdgeId]) {
    return commandError(
      'edge_occupied',
      'L’arête de surface liée est déjà occupée.',
    );
  }
  if (us.lifts.some((l) => l.surfaceEdgeId === node.surfaceEdgeId)) {
    return commandError('lift_exists', 'Ascenseur déjà présent sur cette arête.');
  }

  const cost = getBuildCost('lift');
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;

  const lift = {
    id: nextId('us_lift'),
    playerId,
    nodeId,
    surfaceEdgeId: node.surfaceEdgeId,
    roadBuilt: false,
  };
  us.lifts.push(lift);
  // Réserve l’arête (marqueur propriétaire sans route encore)
  // roadsByEdge reste libre jusqu’à construction de route normale

  queueUndergroundSkyEvents(state, [
    {
      type: 'us_lift_connected',
      payload: {
        liftId: lift.id,
        playerId,
        nodeId,
        surfaceEdgeId: node.surfaceEdgeId,
      },
    },
  ]);
  log(state, playerId, 'Ascenseur naturel construit', { nodeId });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Thermal / discovery choices
// ---------------------------------------------------------------------------

export function usChooseThermalOutput(
  state: GameState,
  playerId: string,
  outpostId: string,
  resource: 'wheat' | 'sheep',
): CommandResult {
  const blocked = requireUs(state);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  const pending = us.pendingResolutions.find(
    (p) =>
      p.kind === 'thermal_output' &&
      p.playerId === playerId &&
      p.outpostId === outpostId,
  );
  if (!pending || pending.kind !== 'thermal_output') {
    return commandError('no_pending', 'Aucun choix thermique en attente.');
  }
  const node = us.undergroundGraph.nodes[pending.nodeId];
  if (!node) return commandError('invalid_node', 'Nœud inconnu.');
  node.thermalChoice = resource;
  us.pendingResolutions = us.pendingResolutions.filter((p) => p !== pending);
  log(state, playerId, 'Sortie thermale choisie', { resource, outpostId });
  return finish(state, []);
}

export function usChooseDiscoveryReward(
  state: GameState,
  playerId: string,
  nodeId: string,
  choice: string,
): CommandResult {
  const blocked = requireUs(state);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  const skyPending = us.pendingResolutions.find(
    (p) =>
      p.kind === 'sky_material_choice' &&
      p.playerId === playerId &&
      p.hubId === nodeId,
  );
  if (skyPending && skyPending.kind === 'sky_material_choice') {
    if (!skyPending.choices.includes(choice as UndergroundSkyMaterial)) {
      return commandError('invalid_choice', 'Choix invalide.');
    }
    const hub = us.skyGraph.hubs[nodeId];
    if (!hub) return commandError('invalid_hub', 'Site céleste inconnu.');
    grantMaterialsFromBank(us, playerId, {
      [choice as UndergroundSkyMaterial]: 1,
    });
    hub.hangingRuinsClaimed = true;
    us.pendingResolutions = us.pendingResolutions.filter((p) => p !== skyPending);
    log(state, playerId, 'Ruines suspendues — matériau choisi', {
      hubId: nodeId,
      choice,
    });
    return finish(state, []);
  }

  const pending = us.pendingResolutions.find(
    (p) =>
      p.kind === 'discovery_reward' &&
      p.playerId === playerId &&
      p.nodeId === nodeId,
  );
  if (!pending || pending.kind !== 'discovery_reward') {
    return commandError('no_pending', 'Aucune récompense en attente.');
  }
  if (!pending.choices.includes(choice as never)) {
    return commandError('invalid_choice', 'Choix invalide.');
  }

  const player = state.players.get(playerId);
  if (!player) return commandError('invalid_player', 'Joueur inconnu.');

  if (CLASSIC_RESOURCE_TYPES.includes(choice as (typeof CLASSIC_RESOURCE_TYPES)[number])) {
    const resource = choice as ResourceType;
    if (state.bank && (state.bank[resource] ?? 0) < 1) {
      return commandError(
        'bank_empty',
        'La banque n’a plus cette ressource.',
      );
    }
    const node = us.undergroundGraph.nodes[nodeId];
    if (node?.discovery === 'sealed_chamber' && !node.sealedChamberClaimed) {
      const prior = us.history.filter(
        (h) =>
          h.type === 'sealed_chamber_pick' &&
          h.playerId === playerId &&
          h.detail?.nodeId === nodeId,
      );
      player.resources = addResources(player.resources, {
        [resource]: 1,
      });
      if (state.bank) {
        state.bank[resource] = Math.max(0, (state.bank[resource] ?? 0) - 1);
      }
      if (prior.length === 0) {
        us.history.push({
          turn: state.currentTurn,
          type: 'sealed_chamber_pick',
          playerId,
          detail: { nodeId, choice },
        });
        return finish(state, []);
      }
      node.sealedChamberClaimed = true;
      us.pendingResolutions = us.pendingResolutions.filter((p) => p !== pending);
    } else {
      player.resources = addResources(player.resources, {
        [resource]: 1,
      });
      if (state.bank) {
        state.bank[resource] = Math.max(0, (state.bank[resource] ?? 0) - 1);
      }
      us.pendingResolutions = us.pendingResolutions.filter((p) => p !== pending);
    }
  } else if (choice === 'us_crystal' || choice === 'us_aether') {
    grantMaterialsFromBank(us, playerId, {
      [choice as UndergroundSkyMaterial]: 1,
    });
    us.pendingResolutions = us.pendingResolutions.filter((p) => p !== pending);
  } else {
    return commandError('invalid_choice', 'Choix invalide.');
  }

  log(state, playerId, 'Récompense de découverte', { nodeId, choice });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Airport / airship / beacon
// ---------------------------------------------------------------------------

export function usBuildAirport(
  state: GameState,
  playerId: string,
  intersectionId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  if (us.airports.filter((a) => a.playerId === playerId).length >= US_PIECE_LIMITS.airports) {
    return commandError('piece_limit', 'Limite d’aéroports atteinte.');
  }
  const building = intersectionBuilding(state, intersectionId);
  if (!building || building.ownerId !== playerId) {
    return commandError(
      'invalid_intersection',
      'L’aéroport exige une de vos villes.',
    );
  }
  if (
    building.definitionId !== 'city' &&
    building.definitionId !== 'metropolis'
  ) {
    return commandError(
      'need_city',
      'L’aéroport exige une ville ou métropole.',
    );
  }
  if (us.airports.some((a) => a.intersectionId === intersectionId)) {
    return commandError('occupied', 'Un aéroport existe déjà ici.');
  }

  const cost = getBuildCost('airport');
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;

  const airport = {
    id: nextId('us_airport'),
    playerId,
    intersectionId,
    suspended: false,
  };
  us.airports.push(airport);
  // Lier mentalement aux 2 hubs les plus proches (info pour le client)
  const hubs = nearestSkyHubsForIntersection(state, intersectionId, 2);
  log(state, playerId, 'Aéroport construit', { intersectionId, hubs });
  return finish(state, []);
}

export function usBuildAirship(
  state: GameState,
  playerId: string,
  airportId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  if (us.airships.filter((a) => a.playerId === playerId).length >= US_PIECE_LIMITS.airships) {
    return commandError('piece_limit', 'Limite de dirigeables atteinte.');
  }
  const airport = us.airports.find((a) => a.id === airportId);
  if (!airport || airport.playerId !== playerId) {
    return commandError('invalid_airport', 'Aéroport introuvable.');
  }
  if (airport.suspended) {
    return commandError(
      'airport_suspended',
      'Aéroport suspendu (ville rétrogradée).',
    );
  }

  const cost = getBuildCost('airship');
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;

  const hubs = nearestSkyHubsForIntersection(state, airport.intersectionId, 1);
  const airship: SkyAirship = {
    id: nextId('us_airship'),
    playerId,
    airportId,
    capacity: US_AIRSHIP_BASE_CAPACITY,
    moveBudget: 2,
    etherSails: false,
    reinforcedHold: false,
    cargo: [],
    route: null,
    currentHubId: hubs[0] ?? null,
  };
  us.airships.push(airship);
  log(state, playerId, 'Dirigeable construit', { airportId });
  return finish(state, []);
}

export function usUpgradeAirship(
  state: GameState,
  playerId: string,
  airshipId: string,
  upgrade: 'ether_sails' | 'reinforced_hold',
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  const airship = us.airships.find((a) => a.id === airshipId);
  if (!airship || airship.playerId !== playerId) {
    return commandError('invalid_airship', 'Dirigeable introuvable.');
  }
  if (airship.route) {
    return commandError('in_flight', 'Amélioration impossible en vol.');
  }

  if (upgrade === 'ether_sails') {
    if (airship.etherSails) {
      return commandError('already_upgraded', 'Voiles d’Éther déjà installées.');
    }
    const cost = getBuildCost('ether_sails');
    const pay = payCost(state, playerId, cost.resources, cost.materials);
    if (pay) return pay;
    airship.etherSails = true;
    airship.moveBudget += 1;
  } else {
    if (airship.reinforcedHold) {
      return commandError('already_upgraded', 'Soute renforcée déjà installée.');
    }
    const cost = getBuildCost('reinforced_hold');
    const pay = payCost(state, playerId, cost.resources, cost.materials);
    if (pay) return pay;
    airship.reinforcedHold = true;
    airship.capacity = US_AIRSHIP_REINFORCED_CAPACITY;
  }

  log(state, playerId, 'Dirigeable amélioré', { airshipId, upgrade });
  return finish(state, []);
}

export function usBuildBeacon(
  state: GameState,
  playerId: string,
  hubId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;

  if (us.beacons.filter((b) => b.playerId === playerId).length >= US_PIECE_LIMITS.beacons) {
    return commandError('piece_limit', 'Limite de balises atteinte.');
  }
  if (!us.skyGraph.hubs[hubId]) {
    return commandError('invalid_hub', 'Hub céleste inconnu.');
  }
  if (us.beacons.some((b) => b.hubId === hubId)) {
    return commandError('occupied', 'Une balise occupe déjà ce nœud.');
  }
  if (!us.revealedSkyHubIds.includes(hubId)) {
    return commandError('hidden', 'Le site doit être révélé.');
  }

  const cost = getBuildCost('beacon');
  const pay = payCost(state, playerId, cost.resources, cost.materials);
  if (pay) return pay;

  us.beacons.push({
    id: nextId('us_beacon'),
    playerId,
    hubId,
  });
  log(state, playerId, 'Balise céleste construite', { hubId });
  return finish(state, []);
}

// ---------------------------------------------------------------------------
// Dispatch / unload / contract
// ---------------------------------------------------------------------------

export function usDispatchAirship(
  state: GameState,
  playerId: string,
  airshipId: string,
  destinationHubId: string,
  cargo: AirshipCargoItem[],
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;
  const player = state.players.get(playerId);
  if (!player) return commandError('invalid_player', 'Joueur inconnu.');

  const airship = us.airships.find((a) => a.id === airshipId);
  if (!airship || airship.playerId !== playerId) {
    return commandError('invalid_airship', 'Dirigeable introuvable.');
  }
  if (airship.route) {
    return commandError('already_dispatched', 'Trajet déjà verrouillé.');
  }
  const airport = us.airports.find((a) => a.id === airship.airportId);
  if (!airport || airport.suspended) {
    return commandError(
      'airport_suspended',
      'Impossible d’expédier depuis un aéroport suspendu.',
    );
  }
  if (!airship.currentHubId) {
    return commandError('no_hub', 'Dirigeable sans position céleste.');
  }
  if (!us.skyGraph.hubs[destinationHubId]) {
    return commandError('invalid_hub', 'Destination inconnue.');
  }

  const cargoAmount = cargo.reduce((s, c) => s + c.amount, 0);
  if (cargoAmount > airship.capacity) {
    return commandError('over_capacity', 'Cargaison trop lourde.');
  }

  // Ferry : cargo vide = conserver la soute existante (ne pas l’effacer).
  // Chargement : soute doit être vide, sinon conflit.
  const keepExistingHold = cargo.length === 0;
  if (!keepExistingHold && airship.cargo.length > 0) {
    return commandError(
      'hold_occupied',
      'Déchargez la soute avant de charger une nouvelle cargaison.',
    );
  }
  if (keepExistingHold && airship.cargo.length > airship.capacity) {
    return commandError('over_capacity', 'Cargaison trop lourde.');
  }

  // Chargement à quai (même hub) : pas de trajet, soute remplie immédiatement.
  if (destinationHubId === airship.currentHubId) {
    if (cargo.length === 0) {
      return commandError('already_here', 'Déjà amarré à ce hub.');
    }
    for (const item of cargo) {
      if (item.amount <= 0) {
        return commandError('invalid_cargo', 'Cargaison invalide.');
      }
      if (item.kind === 'resource') {
        if (!hasResources(player.resources, { [item.key]: item.amount })) {
          return commandError(
            'insufficient_resources',
            'Ressources insuffisantes pour charger.',
          );
        }
      } else if (item.kind === 'commodity') {
        const ck = ensureCitiesKnightsState(state);
        if (
          !ck ||
          !hasCkCommodities(ck.playerCommodities[playerId] ?? {}, {
            [item.key]: item.amount,
          })
        ) {
          return commandError(
            'insufficient_commodities',
            'Marchandises insuffisantes.',
          );
        }
      } else if (
        !hasMaterials(getPlayerMaterials(us, playerId), {
          [item.key]: item.amount,
        })
      ) {
        return commandError(
          'insufficient_materials',
          'Matériaux insuffisants pour charger.',
        );
      }
    }
    for (const item of cargo) {
      if (item.kind === 'resource') {
        player.resources = subtractResources(player.resources, {
          [item.key]: item.amount,
        });
      } else if (item.kind === 'commodity') {
        const ck = ensureCitiesKnightsState(state)!;
        ck.playerCommodities[playerId] = subtractCkCommodities(
          ck.playerCommodities[playerId] ?? {},
          { [item.key]: item.amount },
        );
      } else {
        const hand = getPlayerMaterials(us, playerId);
        const next = { ...hand };
        next[item.key] = (next[item.key] ?? 0) - item.amount;
        if ((next[item.key] ?? 0) <= 0) delete next[item.key];
        us.playerMaterials[playerId] = next;
      }
    }
    syncPublicMaterialCounts(us);
    airship.cargo = cargo.map((c) => ({ ...c }));
    log(state, playerId, 'Cargaison chargée à quai', {
      airshipId,
      cargoCount: cargoAmount,
    });
    return finish(state, []);
  }

  // Vérifier et retirer la cargaison (uniquement si on charge depuis la main)
  for (const item of cargo) {
    if (item.amount <= 0) {
      return commandError('invalid_cargo', 'Cargaison invalide.');
    }
    if (item.kind === 'resource') {
      if (!hasResources(player.resources, { [item.key]: item.amount })) {
        return commandError(
          'insufficient_resources',
          'Ressources insuffisantes pour charger.',
        );
      }
    } else if (item.kind === 'commodity') {
      const ck = ensureCitiesKnightsState(state);
      if (!ck || !hasCkCommodities(ck.playerCommodities[playerId] ?? {}, {
        [item.key]: item.amount,
      })) {
        return commandError(
          'insufficient_commodities',
          'Marchandises insuffisantes.',
        );
      }
    } else {
      if (
        !hasMaterials(getPlayerMaterials(us, playerId), {
          [item.key]: item.amount,
        })
      ) {
        return commandError(
          'insufficient_materials',
          'Matériaux insuffisants pour charger.',
        );
      }
    }
  }

  const allies = peSkyAllyIds(state, playerId);
  const path = findShortestSkyPath(
    us.skyGraph,
    airship.currentHubId,
    destinationHubId,
    { playerId, beacons: us.beacons, alliedPlayerIds: allies },
  );
  if (!path) {
    return commandError('no_path', 'Aucun trajet céleste légal.');
  }

  // Influence pour propriétaires de balises alliées utilisées
  for (const hubId of path.hubPath.slice(1)) {
    const beacon = us.beacons.find((b) => b.hubId === hubId);
    if (beacon && beacon.playerId !== playerId && allies.includes(beacon.playerId)) {
      peNoteAlliedSkyUse(state, playerId, beacon.playerId);
    }
  }

  // Déduire la cargaison seulement après validation du trajet.
  for (const item of cargo) {
    if (item.kind === 'resource') {
      player.resources = subtractResources(player.resources, {
        [item.key]: item.amount,
      });
    } else if (item.kind === 'commodity') {
      const ck = ensureCitiesKnightsState(state)!;
      ck.playerCommodities[playerId] = subtractCkCommodities(
        ck.playerCommodities[playerId] ?? {},
        { [item.key]: item.amount },
      );
    } else {
      us.playerMaterials[playerId] = (() => {
        const hand = getPlayerMaterials(us, playerId);
        const next = { ...hand };
        next[item.key] = (next[item.key] ?? 0) - item.amount;
        if ((next[item.key] ?? 0) <= 0) delete next[item.key];
        return next;
      })();
      // Matériaux en soute : pas remis en banque
    }
  }
  syncPublicMaterialCounts(us);

  const firstLegCost = path.legCosts[0] ?? 1;
  const eta = estimateAirshipEtaForState(state, airship, path.totalCost);

  if (!keepExistingHold) {
    airship.cargo = cargo.map((c) => ({ ...c }));
  }
  airship.route = {
    hubPath: path.hubPath,
    pathIndex: 0,
    remainingPointsThisLeg: firstLegCost,
    destinationHubId,
    etaTurns: eta,
    legCosts: [...path.legCosts],
  };

  queueUndergroundSkyEvents(state, [
    {
      type: 'us_airship_dispatched',
      payload: {
        airshipId,
        playerId,
        destinationHubId,
        hubPath: path.hubPath,
        totalCost: path.totalCost,
        etaTurns: airship.route.etaTurns,
        cargoCount: cargoAmount,
      },
    },
  ]);
  log(state, playerId, 'Dirigeable expédié', {
    airshipId,
    destinationHubId,
    eta: airship.route.etaTurns,
  });
  return finish(state, []);
}

export function usUnloadAirship(
  state: GameState,
  playerId: string,
  airshipId: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;
  const player = state.players.get(playerId);
  if (!player) return commandError('invalid_player', 'Joueur inconnu.');

  const airship = us.airships.find((a) => a.id === airshipId);
  if (!airship || airship.playerId !== playerId) {
    return commandError('invalid_airship', 'Dirigeable introuvable.');
  }
  if (airship.route) {
    return commandError('in_flight', 'Déchargement impossible en vol.');
  }
  if (airship.cargo.length === 0) {
    return commandError('empty', 'Soute vide.');
  }

  // Doit être à l’aéroport (hub lié) ou n’importe quel hub amarré — spec : déchargement à l’aéroport
  const airport = us.airports.find((a) => a.id === airship.airportId);
  if (!airport) {
    return commandError('invalid_airport', 'Aéroport introuvable.');
  }
  // Suspendu : peut toujours décharger
  const homeHubs = nearestSkyHubsForIntersection(
    state,
    airport.intersectionId,
    2,
  );
  if (
    airship.currentHubId &&
    homeHubs.length > 0 &&
    !homeHubs.includes(airship.currentHubId)
  ) {
    return commandError(
      'not_at_airport',
      'Le dirigeable doit être amarré à son aéroport.',
    );
  }

  for (const item of airship.cargo) {
    if (item.kind === 'resource') {
      player.resources = addResources(player.resources, {
        [item.key]: item.amount,
      });
    } else if (item.kind === 'commodity') {
      const ck = ensureCitiesKnightsState(state);
      if (ck) {
        ck.playerCommodities[playerId] = addCkCommodities(
          ck.playerCommodities[playerId] ?? {},
          { [item.key]: item.amount },
        );
      }
    } else {
      const hand = getPlayerMaterials(us, playerId);
      hand[item.key] = (hand[item.key] ?? 0) + item.amount;
      us.playerMaterials[playerId] = hand;
    }
  }
  airship.cargo = [];
  syncPublicMaterialCounts(us);
  log(state, playerId, 'Dirigeable déchargé', { airshipId });
  return finish(state, []);
}

export function usCompleteContract(
  state: GameState,
  playerId: string,
  contractId: string,
  airshipId?: string,
  rewardClassic?: string,
): CommandResult {
  const blocked = requireUs(state) ?? requireActionTurn(state, playerId);
  if (blocked) return blocked;
  const us = ensureUndergroundSkyState(state)!;
  const player = state.players.get(playerId);
  if (!player) return commandError('invalid_player', 'Joueur inconnu.');

  const contract = findFaceUpContract(us, contractId);
  if (!contract) {
    return commandError('unknown_contract', 'Contrat non disponible.');
  }

  if (contract.isMajor) {
    if ((us.completedRegularContracts[playerId] ?? 0) < 2) {
      return commandError(
        'major_locked',
        'Deux contrats ordinaires sont requis.',
      );
    }
    if (us.completedMajorContracts[playerId]) {
      return commandError(
        'major_done',
        'Vous avez déjà livré un contrat majeur.',
      );
    }
  }

  // Livraison exclusivement via soute d’un dirigeable amarré.
  if (!airshipId) {
    return commandError(
      'airship_required',
      'Un dirigeable amarré avec la cargaison est requis pour livrer.',
    );
  }
  const airship = us.airships.find((a) => a.id === airshipId && a.playerId === playerId);
  if (!airship) {
    return commandError('invalid_airship', 'Dirigeable introuvable.');
  }
  if (airship.route) {
    return commandError('in_flight', 'Le dirigeable est encore en vol.');
  }
  if (!airship.currentHubId) {
    return commandError('no_hub', 'Dirigeable sans position céleste.');
  }
  if (contract.preferredSite) {
    const hub = us.skyGraph.hubs[airship.currentHubId];
    if (!hub || hub.site !== contract.preferredSite) {
      return commandError(
        'wrong_site',
        contract.preferredSite === 'floating_garden'
          ? 'Livraison alimentaire au Jardin flottant requise.'
          : 'Le dirigeable doit être amarré au site du contrat.',
      );
    }
  }

  const req = contract.requirements;

  // Vérifier disponibilité en soute uniquement
  if (req.resources) {
    for (const [key, amount] of Object.entries(req.resources)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      const have = airship.cargo
        .filter((c) => c.kind === 'resource' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < need) {
        return commandError(
          'cargo_short',
          'Cargaison insuffisante pour le contrat.',
        );
      }
    }
  }
  if (req.commodities) {
    if (!isCitiesKnightsEnabled(state)) {
      return commandError('ck_required', 'Contrats CK indisponibles.');
    }
    for (const [key, amount] of Object.entries(req.commodities)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      const have = airship.cargo
        .filter((c) => c.kind === 'commodity' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < need) {
        return commandError('cargo_short', 'Marchandises insuffisantes.');
      }
    }
  }
  if (req.materials) {
    for (const [key, amount] of Object.entries(req.materials)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      const have = airship.cargo
        .filter((c) => c.kind === 'material' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < need) {
        return commandError('cargo_short', 'Matériaux insuffisants.');
      }
    }
  }

  // Consommer la soute et renvoyer aux banques
  const consumeCargo = (
    kind: AirshipCargoItem['kind'],
    key: string,
    amount: number,
  ) => {
    let left = amount;
    for (const item of airship.cargo) {
      if (left <= 0) break;
      if (item.kind !== kind || item.key !== key) continue;
      const take = Math.min(left, item.amount);
      item.amount -= take;
      left -= take;
    }
    airship.cargo = airship.cargo.filter((c) => c.amount > 0);
  };

  if (req.resources) {
    for (const [key, amount] of Object.entries(req.resources)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      consumeCargo('resource', key, need);
      returnResourcesToBank(state, { [key as ResourceType]: need });
    }
  }
  if (req.commodities) {
    const ck = ensureCitiesKnightsState(state)!;
    for (const [key, amount] of Object.entries(req.commodities)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      consumeCargo('commodity', key, need);
      if (CK_COMMODITIES.includes(key as (typeof CK_COMMODITIES)[number])) {
        ck.commodityBank[key as (typeof CK_COMMODITIES)[number]] =
          (ck.commodityBank[key as (typeof CK_COMMODITIES)[number]] ?? 0) +
          need;
      }
    }
  }
  if (req.materials) {
    for (const [key, amount] of Object.entries(req.materials)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      consumeCargo('material', key, need);
      returnMaterialsToBank(us, {
        [key as UndergroundSkyMaterial]: need,
      });
    }
  }

  // Récompense matériau : déjà réservée en banque → crédit direct en main
  {
    const hand = getPlayerMaterials(us, playerId);
    hand[contract.rewardMaterial] = (hand[contract.rewardMaterial] ?? 0) + 1;
    us.playerMaterials[playerId] = hand;
    us._secret.reservedMaterialContractIds =
      us._secret.reservedMaterialContractIds.filter((id) => id !== contract.id);
    syncPublicMaterialCounts(us);
  }

  if (
    rewardClassic &&
    contract.rewardClassicChoices.includes(rewardClassic as ResourceType)
  ) {
    player.resources = addResources(player.resources, {
      [rewardClassic as ResourceType]: 1,
    });
    if (state.bank) {
      state.bank[rewardClassic as ResourceType] = Math.max(
        0,
        (state.bank[rewardClassic as ResourceType] ?? 0) - 1,
      );
    }
  } else if (contract.rewardClassicChoices[0]) {
    const auto = contract.rewardClassicChoices[0];
    player.resources = addResources(player.resources, { [auto]: 1 });
    if (state.bank) {
      state.bank[auto] = Math.max(0, (state.bank[auto] ?? 0) - 1);
    }
  }

  if (contract.isMajor) {
    us.completedMajorContracts[playerId] = contract.id;
  } else {
    us.completedRegularContracts[playerId] =
      (us.completedRegularContracts[playerId] ?? 0) + 1;
  }

  replaceCompletedContract(us, contract);

  queueUndergroundSkyEvents(state, [
    {
      type: 'us_contract_completed',
      payload: {
        playerId,
        contractId: contract.id,
        isMajor: contract.isMajor,
        victoryPoints: contract.victoryPoints,
      },
    },
  ]);
  log(state, playerId, 'Contrat aérien livré', {
    contractId,
    isMajor: contract.isMajor,
  });
  return finish(state, []);
}

/**
 * Dispatch unique pour applyCommand.
 */
export function handleUndergroundSkyCommand(
  state: GameState,
  command: { type: string; playerId: string; [key: string]: unknown },
): CommandResult {
  switch (command.type) {
    case 'us_build_shaft':
      return usBuildShaft(
        state,
        command.playerId,
        command.intersectionId as string,
        command.entryNodeId as string,
      );
    case 'us_survey_cavern':
      return usSurveyCavern(state, command.playerId, command.nodeId as string);
    case 'us_build_tunnel':
      return usBuildTunnel(
        state,
        command.playerId,
        command.edgeId as string,
        command.useSeasonPreparation as boolean | undefined,
        (command as { pactId?: string }).pactId,
      );
    case 'us_build_outpost':
      return usBuildOutpost(state, command.playerId, command.nodeId as string);
    case 'us_upgrade_extractor':
      return usUpgradeExtractor(
        state,
        command.playerId,
        command.outpostId as string,
      );
    case 'us_build_lift':
      return usBuildLift(state, command.playerId, command.nodeId as string);
    case 'us_choose_thermal_output':
      return usChooseThermalOutput(
        state,
        command.playerId,
        command.outpostId as string,
        command.resource as 'wheat' | 'sheep',
      );
    case 'us_choose_discovery_reward':
      return usChooseDiscoveryReward(
        state,
        command.playerId,
        command.nodeId as string,
        command.choice as string,
      );
    case 'us_build_airport':
      return usBuildAirport(
        state,
        command.playerId,
        command.intersectionId as string,
      );
    case 'us_build_airship':
      return usBuildAirship(
        state,
        command.playerId,
        command.airportId as string,
      );
    case 'us_upgrade_airship':
      return usUpgradeAirship(
        state,
        command.playerId,
        command.airshipId as string,
        command.upgrade as 'ether_sails' | 'reinforced_hold',
      );
    case 'us_build_beacon':
      return usBuildBeacon(state, command.playerId, command.hubId as string);
    case 'us_dispatch_airship':
      return usDispatchAirship(
        state,
        command.playerId,
        command.airshipId as string,
        command.destinationHubId as string,
        (command.cargo as AirshipCargoItem[]) ?? [],
      );
    case 'us_unload_airship':
      return usUnloadAirship(
        state,
        command.playerId,
        command.airshipId as string,
      );
    case 'us_complete_contract':
      return usCompleteContract(
        state,
        command.playerId,
        command.contractId as string,
        command.airshipId as string | undefined,
        command.rewardClassic as string | undefined,
      );
    default:
      return commandError('unknown_command', 'Commande US inconnue.');
  }
}

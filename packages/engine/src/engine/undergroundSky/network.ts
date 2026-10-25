/**
 * Connectivité souterraine du joueur (puits + tunnels).
 */

import type { GameState } from '../../types/game';
import type {
  UndergroundGraph,
  UndergroundSkyState,
} from '../../types/undergroundSky';

/** Nœuds accessibles via puits et tunnels du joueur (+ Passage souterrain allié). */
export function getPlayerUndergroundNodeIds(
  us: UndergroundSkyState,
  playerId: string,
  alliedPlayerIds: string[] = [],
): Set<string> {
  const nodes = new Set<string>();
  const owners = new Set([playerId, ...alliedPlayerIds]);
  for (const shaft of us.shafts) {
    if (owners.has(shaft.playerId)) nodes.add(shaft.entryNodeId);
  }

  const ownedEdges = new Set(
    us.tunnels.filter((t) => owners.has(t.playerId)).map((t) => t.edgeId),
  );
  if (ownedEdges.size === 0) return nodes;

  const graph = us.undergroundGraph;
  const queue = [...nodes];
  const seen = new Set(nodes);
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of graph.adjacency[u] ?? []) {
      const edgeId = edgeIdBetween(graph, u, v);
      if (!edgeId || !ownedEdges.has(edgeId)) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      nodes.add(v);
      queue.push(v);
    }
  }
  return nodes;
}

export function edgeIdBetween(
  graph: UndergroundGraph,
  a: string,
  b: string,
): string | null {
  for (const edge of Object.values(graph.edges)) {
    if ((edge.a === a && edge.b === b) || (edge.a === b && edge.b === a)) {
      return edge.id;
    }
  }
  return null;
}

export function isUndergroundEdgeOccupied(
  us: UndergroundSkyState,
  edgeId: string,
): boolean {
  return us.tunnels.some((t) => t.edgeId === edgeId);
}

export function getTunnelOwner(
  us: UndergroundSkyState,
  edgeId: string,
): string | null {
  return us.tunnels.find((t) => t.edgeId === edgeId)?.playerId ?? null;
}

/** Nœuds cachés adjacents au réseau du joueur. */
export function getAdjacentHiddenNodeIds(
  us: UndergroundSkyState,
  playerId: string,
): string[] {
  const network = getPlayerUndergroundNodeIds(us, playerId);
  const revealed = new Set(us.revealedUndergroundNodeIds);
  const hidden = new Set<string>();
  for (const nodeId of network) {
    for (const neighbor of us.undergroundGraph.adjacency[nodeId] ?? []) {
      if (!revealed.has(neighbor)) hidden.add(neighbor);
    }
  }
  return [...hidden].sort((a, b) => a.localeCompare(b));
}

export function canSurvey(
  state: GameState,
  playerId: string,
  nodeId: string,
): { ok: true } | { ok: false; reason: string } {
  const us = state.extensions?.undergroundSky;
  if (!us) return { ok: false, reason: 'Extension inactive' };
  if (us.perTurnUsage[playerId]?.surveyUsed) {
    return { ok: false, reason: 'Prospection déjà utilisée ce tour' };
  }
  if (us.revealedUndergroundNodeIds.includes(nodeId)) {
    return { ok: false, reason: 'Cette caverne est déjà révélée' };
  }
  if (!us.undergroundGraph.nodes[nodeId]) {
    return { ok: false, reason: 'Nœud souterrain inconnu' };
  }
  const network = getPlayerUndergroundNodeIds(us, playerId);
  // Pointe de tunnel déjà dans le réseau mais encore cachée
  if (network.has(nodeId)) {
    return { ok: true };
  }
  const adjacent = getAdjacentHiddenNodeIds(us, playerId);
  if (!adjacent.includes(nodeId)) {
    return {
      ok: false,
      reason: 'La caverne doit être adjacente à votre réseau souterrain',
    };
  }
  return { ok: true };
}

export function canExtendTunnelToEdge(
  us: UndergroundSkyState,
  playerId: string,
  edgeId: string,
  alliedPlayerIds: string[] = [],
): { ok: true; fromNodeId: string; toNodeId: string } | { ok: false; reason: string } {
  const edge = us.undergroundGraph.edges[edgeId];
  if (!edge) return { ok: false, reason: 'Arête souterraine inconnue' };
  if (isUndergroundEdgeOccupied(us, edgeId)) {
    return { ok: false, reason: 'Cette galerie est déjà occupée' };
  }
  const network = getPlayerUndergroundNodeIds(us, playerId, alliedPlayerIds);
  const aIn = network.has(edge.a);
  const bIn = network.has(edge.b);
  if (!aIn && !bIn) {
    return {
      ok: false,
      reason: 'Le tunnel doit prolonger votre réseau souterrain',
    };
  }
  // Depuis le réseau vers l’extérieur (ou entre deux nœuds du réseau)
  const fromNodeId = aIn ? edge.a : edge.b;
  const toNodeId = aIn ? edge.b : edge.a;
  return { ok: true, fromNodeId, toNodeId };
}

export function isNodeConnectedToPlayer(
  us: UndergroundSkyState,
  playerId: string,
  nodeId: string,
  alliedPlayerIds: string[] = [],
): boolean {
  return getPlayerUndergroundNodeIds(us, playerId, alliedPlayerIds).has(nodeId);
}

/** Catégories géologiques visibles depuis un puits (nœuds adjacents). */
export function geologyHintsNearNode(
  us: UndergroundSkyState,
  nodeId: string,
): Array<{ nodeId: string; category: string }> {
  const hints: Array<{ nodeId: string; category: string }> = [];
  for (const neighbor of us.undergroundGraph.adjacency[nodeId] ?? []) {
    const node = us.undergroundGraph.nodes[neighbor];
    if (!node) continue;
    hints.push({ nodeId: neighbor, category: node.geologyCategory });
  }
  return hints;
}

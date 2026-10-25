/**
 * Pistes urbaines, métropoles et Aqueduc (Villes & Chevaliers).
 */
import type { GameState } from '../../types/game';
import type { ResourceBundle, ResourceType } from '../../types/resources';
import type { CkCommodity, CkUrbanTrack } from '../../types/citiesKnights';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import {
  ensureCitiesKnightsState,
  hasCkCommodities,
  subtractCkCommodities,
  syncPublicCommodityCounts,
} from './state';
import { returnCommoditiesToBank } from './commodities';
import { addResources, resolveBuildingProductionTileIds } from '../resources/ResourceSystem';
import { takeResourcesFromBank, usesLimitedBank } from '../catan/ClassicBoard';
import { refreshTrophiesAndVictory } from '../game/GameEngine';

const TRACK_COMMODITY: Record<CkUrbanTrack, CkCommodity> = {
  trade: 'ck_cloth',
  politics: 'ck_coin',
  science: 'ck_paper',
};

const TRACK_LABELS: Record<CkUrbanTrack, string> = {
  trade: 'Commerce',
  politics: 'Politique',
  science: 'Science',
};

const CLASSIC_FIVE: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];

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
    type: 'system',
    description,
    data,
    timestamp: now(),
  });
}

export function urbanTrackCommodity(track: CkUrbanTrack): CkCommodity {
  return TRACK_COMMODITY[track];
}

/** Coût pour passer au niveau `nextLevel` : `nextLevel` marchandises. */
export function urbanImproveCost(nextLevel: number): number {
  return nextLevel;
}

/** Coût d’amélioration (Grue : −1, minimum 1). */
export function urbanImproveCostForPlayer(
  state: GameState,
  playerId: string,
  nextLevel: number,
): number {
  const base = urbanImproveCost(nextLevel);
  const discount = state.extensions?.citiesKnights?.progressBuffs?.craneDiscount?.[playerId] ?? 0;
  if (discount <= 0) return base;
  return Math.max(1, base - 1);
}

function consumeCraneDiscount(state: GameState, playerId: string): void {
  const ck = state.extensions?.citiesKnights;
  if (!ck?.progressBuffs?.craneDiscount) return;
  const n = ck.progressBuffs.craneDiscount[playerId] ?? 0;
  if (n <= 0) return;
  if (n === 1) delete ck.progressBuffs.craneDiscount[playerId];
  else ck.progressBuffs.craneDiscount[playerId] = n - 1;
}

export function getUrbanLevel(state: GameState, playerId: string, track: CkUrbanTrack): number {
  return state.extensions?.citiesKnights?.urbanLevels[playerId]?.[track] ?? 0;
}

export function canImproveUrban(
  state: GameState,
  playerId: string,
  track: CkUrbanTrack,
): { ok: boolean; reason?: string; nextLevel?: number; cost?: number } {
  if (!isCitiesKnightsEnabled(state)) {
    return { ok: false, reason: 'Extension Villes & Chevaliers inactive' };
  }
  if (state.phase !== 'playing' || state.turnPhase !== 'player_action') {
    return { ok: false, reason: 'Amélioration indisponible dans cette phase' };
  }
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { ok: false, reason: "Ce n'est pas votre tour" };
  }
  const current = getUrbanLevel(state, playerId, track);
  if (current >= 5) return { ok: false, reason: 'Niveau maximum atteint (5)' };
  const nextLevel = current + 1;
  const cost = urbanImproveCostForPlayer(state, playerId, nextLevel);
  const commodity = TRACK_COMMODITY[track];
  const hand = state.extensions?.citiesKnights?.playerCommodities[playerId] ?? {};
  if (!hasCkCommodities(hand, { [commodity]: cost })) {
    return { ok: false, reason: `Il faut ${cost} ${commodity}` };
  }
  return { ok: true, nextLevel, cost };
}

/**
 * Améliore une piste urbaine. Gère la prise / vol de métropole au niveau 4+.
 */
export function ckImproveUrban(
  playerId: string,
  track: CkUrbanTrack,
  state: GameState,
  metropolisIntersectionId?: string,
): { success: boolean; reason?: string } {
  const check = canImproveUrban(state, playerId, track);
  if (!check.ok) return { success: false, reason: check.reason };

  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État C&K manquant' };

  const nextLevel = check.nextLevel!;
  const cost = check.cost!;
  const commodity = TRACK_COMMODITY[track];
  const payment = { [commodity]: cost };
  const consumeCrane = (ck.progressBuffs?.craneDiscount?.[playerId] ?? 0) > 0;

  ck.playerCommodities[playerId] = subtractCkCommodities(
    ck.playerCommodities[playerId] ?? {},
    payment,
  );
  returnCommoditiesToBank(state, payment);
  syncPublicCommodityCounts(ck);
  if (consumeCrane) {
    consumeCraneDiscount(state, playerId);
  }

  if (!ck.urbanLevels[playerId]) {
    ck.urbanLevels[playerId] = { trade: 0, politics: 0, science: 0 };
  }
  ck.urbanLevels[playerId]![track] = nextLevel;

  // Métropole : niveau 4+ — premier à 4 la prend ; pour voler il faut dépasser le niveau du détenteur
  if (nextLevel >= 4) {
    const slot = ck.metropolises[track];
    const ownerLevel = slot.ownerId ? getUrbanLevel(state, slot.ownerId, track) : 0;
    const alreadyOurs = slot.ownerId === playerId && Boolean(slot.intersectionId);
    const lockedByOther = Boolean(slot.ownerId && slot.ownerId !== playerId && ownerLevel >= 5);
    const canClaim =
      !lockedByOther &&
      !alreadyOurs &&
      (!slot.ownerId || slot.ownerId === playerId || nextLevel > ownerLevel);

    if (canClaim) {
      const existingPending = ck.pendingResolutions.some(
        (r) => r.kind === 'place_metropolis' && r.playerId === playerId && r.data?.track === track,
      );
      // Sans choix explicite, toujours laisser le joueur désigner sa ville.
      // L'ancien auto-choix de la « meilleure production » rendait l'obtention
      // de la métropole difficile à comprendre et impossible à anticiper.
      if (!metropolisIntersectionId) {
        if (!existingPending) {
          ck.pendingResolutions.push({
            id: nextId('ckres'),
            kind: 'place_metropolis',
            playerId,
            data: { track },
          });
        }
        log(
          state,
          playerId,
          `Amélioration ${TRACK_LABELS[track]} → niveau ${nextLevel} (métropole à placer)`,
          {
            track,
            nextLevel,
          },
        );
        refreshTrophiesAndVictory(state);
        return { success: true };
      }
      const host = resolveMetropolisHost(state, playerId, track, metropolisIntersectionId);
      if (!host.ok) return { success: false, reason: host.reason };
      assignMetropolis(state, track, playerId, host.intersectionId!);
    }
  }

  log(state, playerId, `Amélioration ${TRACK_LABELS[track]} → niveau ${nextLevel}`, {
    track,
    nextLevel,
  });
  refreshTrophiesAndVictory(state);
  return { success: true };
}

function playerCityIntersections(state: GameState, playerId: string): string[] {
  const board = state.classicBoard;
  if (!board) return [];
  const out: string[] = [];
  for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
    if (owner !== playerId) continue;
    const buildingId = board.buildingByIntersection[intersectionId];
    const building = buildingId ? state.buildings.get(buildingId) : undefined;
    if (building?.definitionId === 'city' || building?.definitionId === 'metropolis') {
      out.push(intersectionId);
    }
  }
  return out;
}

function metropolisHostsUsed(state: GameState): Set<string> {
  const ck = state.extensions?.citiesKnights;
  const used = new Set<string>();
  if (!ck) return used;
  for (const slot of Object.values(ck.metropolises)) {
    if (slot.intersectionId) used.add(slot.intersectionId);
  }
  return used;
}

function resolveMetropolisHost(
  state: GameState,
  playerId: string,
  track: CkUrbanTrack,
  preferred?: string,
): { ok: boolean; reason?: string; intersectionId?: string } {
  const cities = playerCityIntersections(state, playerId);
  const used = metropolisHostsUsed(state);
  // Libérer l'hôte actuel de cette piste si on la reprend
  const current = state.extensions?.citiesKnights?.metropolises[track];
  if (current?.intersectionId) used.delete(current.intersectionId);

  const free = cities.filter((id) => !used.has(id));
  if (preferred) {
    if (!cities.includes(preferred)) {
      return { ok: false, reason: 'La métropole doit être sur une de vos villes' };
    }
    if (used.has(preferred) && preferred !== current?.intersectionId) {
      return { ok: false, reason: 'Cette ville accueille déjà une métropole' };
    }
    return { ok: true, intersectionId: preferred };
  }
  if (free.length === 0) {
    return { ok: false, reason: 'Aucune ville libre pour la métropole' };
  }
  // Auto-choix : meilleure production adjacente (évite un pending inutile)
  let best = free[0]!;
  let bestScore = -1;
  for (const id of free) {
    const score = cityProductionScore(state, id);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return { ok: true, intersectionId: best };
}

function cityProductionScore(state: GameState, intersectionId: string): number {
  const board = state.classicBoard;
  if (!board) return 0;
  const buildingId = board.buildingByIntersection[intersectionId];
  const building = buildingId ? state.buildings.get(buildingId) : undefined;
  const tileIds = building
    ? resolveBuildingProductionTileIds(state, building)
    : (board.topology.intersections[intersectionId]?.tileIds ?? []);
  let score = 0;
  for (const tileId of tileIds) {
    const tile = state.map.get(tileId);
    if (!tile?.diceValue) continue;
    score += 6 - Math.abs(7 - tile.diceValue);
  }
  return score;
}

/** Villes (et métropoles CatanX) du joueur encore libres pour une métropole C&K. */
export function listFreeMetropolisHosts(
  state: GameState,
  playerId: string,
  track?: CkUrbanTrack,
): string[] {
  const cities = playerCityIntersections(state, playerId);
  const used = metropolisHostsUsed(state);
  if (track) {
    const current = state.extensions?.citiesKnights?.metropolises[track];
    if (current?.intersectionId) used.delete(current.intersectionId);
  }
  return cities.filter((id) => !used.has(id));
}

export function playerHasCity(state: GameState, playerId: string): boolean {
  return playerCityIntersections(state, playerId).length > 0;
}

export function assignMetropolis(
  state: GameState,
  track: CkUrbanTrack,
  ownerId: string,
  intersectionId: string,
): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  ck.metropolises[track] = { ownerId, intersectionId };
  // Retirer pending place_metropolis pour ce joueur/piste
  ck.pendingResolutions = ck.pendingResolutions.filter(
    (r) => !(r.kind === 'place_metropolis' && r.playerId === ownerId && r.data?.track === track),
  );
  log(state, ownerId, `Métropole ${TRACK_LABELS[track]} placée`, { track, intersectionId });
  refreshTrophiesAndVictory(state);
}

export function ckPlaceMetropolis(
  playerId: string,
  track: CkUrbanTrack,
  intersectionId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État C&K manquant' };

  const pending = ck.pendingResolutions.find(
    (r) => r.kind === 'place_metropolis' && r.playerId === playerId && r.data?.track === track,
  );
  const level = getUrbanLevel(state, playerId, track);
  if (!pending && level < 4) {
    return { success: false, reason: 'Niveau 4 requis pour une métropole' };
  }

  const slot = ck.metropolises[track];
  if (slot.ownerId && slot.ownerId !== playerId) {
    if (getUrbanLevel(state, slot.ownerId, track) >= 5) {
      return { success: false, reason: 'Métropole sécurisée (niveau 5)' };
    }
    if (level <= getUrbanLevel(state, slot.ownerId, track)) {
      return { success: false, reason: 'Il faut dépasser le niveau du détenteur' };
    }
  }

  const host = resolveMetropolisHost(state, playerId, track, intersectionId);
  if (!host.ok) return { success: false, reason: host.reason };
  assignMetropolis(state, track, playerId, host.intersectionId!);
  return { success: true };
}

/** Après production : Aqueduc si science ≥ 3, au moins une ville, et aucune production reçue. */
export function maybeQueueAqueduct(
  state: GameState,
  diceTotal: number,
  collectedPlayerIds: Set<string>,
): void {
  if (!isCitiesKnightsEnabled(state) || diceTotal === 7) return;
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;

  for (const playerId of state.turnOrder) {
    if (getUrbanLevel(state, playerId, 'science') < 3) continue;
    if (!playerHasCity(state, playerId)) continue;
    if (collectedPlayerIds.has(playerId)) continue;
    const already = ck.pendingResolutions.some(
      (r) => r.kind === 'aqueduct' && r.playerId === playerId,
    );
    if (already) continue;
    ck.pendingResolutions.push({
      id: nextId('ckres'),
      kind: 'aqueduct',
      playerId,
      data: { turn: state.currentTurn },
    });
  }
}

export function ckChooseAqueduct(
  playerId: string,
  resource: ResourceType,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!CLASSIC_FIVE.includes(resource)) {
    return { success: false, reason: 'Choisissez une ressource classique' };
  }
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État C&K manquant' };
  const idx = ck.pendingResolutions.findIndex(
    (r) => r.kind === 'aqueduct' && r.playerId === playerId,
  );
  if (idx < 0) return { success: false, reason: 'Aucun Aqueduc en attente' };

  const player = state.players.get(playerId);
  if (!player) return { success: false, reason: 'Joueur introuvable' };

  const grant: ResourceBundle = { [resource]: 1 };
  const taken = usesLimitedBank(state) ? takeResourcesFromBank(state, grant) : grant;
  if ((taken[resource] ?? 0) < 1 && usesLimitedBank(state)) {
    return { success: false, reason: "La banque n'a plus cette ressource" };
  }
  player.resources = addResources(player.resources, taken);
  ck.pendingResolutions.splice(idx, 1);
  log(state, playerId, `Aqueduc : +1 ${resource}`, { resource });
  return { success: true };
}

export function playerWallCount(state: GameState, playerId: string): number {
  const walls = state.extensions?.citiesKnights?.walls ?? {};
  return Object.values(walls).filter((id) => id === playerId).length;
}

/** Seuil de main avant défausse : 7 + 2 × murailles. */
export function ckHandLimit(state: GameState, playerId: string): number {
  return 7 + playerWallCount(state, playerId) * 2;
}

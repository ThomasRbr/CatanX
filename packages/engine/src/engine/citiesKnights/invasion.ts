/**
 * Invasion barbare C&K (phase 6).
 * Règles essentielles : force = villes (+métropoles), défense = rangs chevaliers actifs.
 */
import type { GameState } from '../../types/game';
import type { CkProgressDeckId } from '../../types/citiesKnights';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import { ensureCitiesKnightsState } from './state';
import { removeWallAt } from './walls';
import { drawProgressCard } from './progress';
import {
  CLASSIC_PIECE_LIMITS,
  ensureClassicRuntimeState,
} from '../catan/ClassicBoard';
import { refreshTrophiesAndVictory } from '../game/GameEngine';
import { peOnCityPillaged } from '../pactsEmbassies/adapters';

const DEFENDER_VP_MAX = 6;

export interface CkInvasionResult {
  turn: number;
  barbarianStrength: number;
  defenseStrength: number;
  outcome: 'defenders_win' | 'barbarians_win';
  defenderVpAwardedTo: string | null;
  progressDrawPlayerIds: string[];
  pillagedPlayerIds: string[];
}

function log(
  state: GameState,
  playerId: string | null,
  description: string,
  data: Record<string, unknown> = {},
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId: playerId ?? state.turnOrder[state.currentPlayerIndex] ?? 'system',
    type: 'system',
    description,
    data,
    timestamp: now(),
  });
}

/** Villes (y compris hôtes de métropole C&K) sur le plateau. */
export function countCitiesOnBoard(state: GameState): number {
  const board = state.classicBoard;
  if (!board) return 0;
  let n = 0;
  for (const [, buildingId] of Object.entries(board.buildingByIntersection)) {
    const b = state.buildings.get(buildingId);
    if (b?.definitionId === 'city' || b?.definitionId === 'metropolis') n += 1;
  }
  return n;
}

export function playerDefenseContribution(state: GameState, playerId: string): number {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return 0;
  return ck.knights
    .filter((k) => k.ownerId === playerId && k.activated && k.intersectionId)
    .reduce((sum, k) => sum + k.rank, 0);
}

export function totalDefenseStrength(state: GameState): number {
  return (state.turnOrder ?? []).reduce(
    (sum, id) => sum + playerDefenseContribution(state, id),
    0,
  );
}

function metropolisHostSet(state: GameState): Set<string> {
  const used = new Set<string>();
  const ck = state.extensions?.citiesKnights;
  if (!ck) return used;
  for (const slot of Object.values(ck.metropolises)) {
    if (slot.intersectionId) used.add(slot.intersectionId);
  }
  return used;
}

/** Villes pillables : villes sans métropole C&K. */
export function listPillagableCities(state: GameState, playerId: string): string[] {
  const board = state.classicBoard;
  if (!board) return [];
  const metro = metropolisHostSet(state);
  const out: string[] = [];
  for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
    if (owner !== playerId) continue;
    if (metro.has(intersectionId)) continue;
    const bid = board.buildingByIntersection[intersectionId];
    const b = bid ? state.buildings.get(bid) : undefined;
    if (b?.definitionId === 'city') out.push(intersectionId);
  }
  return out;
}

export function deactivateAllKnights(state: GameState): void {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return;
  for (const knight of ck.knights) {
    knight.activated = false;
    knight.activatedThisTurn = false;
  }
}

/**
 * Rétrograde une ville en colonie (pillage). Retire la muraille.
 */
export function pillageCity(
  state: GameState,
  playerId: string,
  intersectionId: string,
): { success: boolean; reason?: string } {
  const board = state.classicBoard;
  const player = state.players.get(playerId);
  if (!board || !player) return { success: false, reason: 'État invalide' };
  if (board.occupiedIntersections[intersectionId] !== playerId) {
    return { success: false, reason: 'Pas votre ville' };
  }
  if (metropolisHostSet(state).has(intersectionId)) {
    return { success: false, reason: 'Une métropole ne peut pas être pillée' };
  }
  const buildingId = board.buildingByIntersection[intersectionId];
  const building = buildingId ? state.buildings.get(buildingId) : undefined;
  if (!building || building.definitionId !== 'city') {
    return { success: false, reason: 'Pas une ville pillable' };
  }

  ensureClassicRuntimeState(state);
  const stock = board.piecesRemaining[playerId];
  building.definitionId = 'settlement';
  building.level = 1;
  removeWallAt(state, intersectionId);

  if (stock) {
    // Règle officielle : si plus de colonie en réserve, le jeton ville reste
    // « sur le côté » (ne pas le rendre au stock villes).
    if (stock.settlements > 0) {
      stock.cities = Math.min(CLASSIC_PIECE_LIMITS.cities, (stock.cities ?? 0) + 1);
      stock.settlements -= 1;
    }
  }

  const tileId = building.tileId;
  player.cities = player.cities.filter((id) => id !== tileId);
  if (!player.settlements.includes(tileId)) player.settlements.push(tileId);

  // Souterrain & Ciel : suspendre l’aéroport (métropole déjà protégée plus haut)
  const us = state.extensions?.undergroundSky;
  if (us) {
    for (const airport of us.airports) {
      if (airport.intersectionId === intersectionId && airport.playerId === playerId) {
        airport.suspended = true;
      }
    }
  }

  // Pactes & Ambassades : suspendre ambassade (métropole protège)
  peOnCityPillaged(state);

  log(state, playerId, 'Ville pillée par les barbares', { intersectionId });
  return { success: true };
}

export function ckChoosePillageCity(
  playerId: string,
  intersectionId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État C&K manquant' };

  const idx = ck.pendingResolutions.findIndex(
    (r) => r.kind === 'pillage_city' && r.playerId === playerId,
  );
  if (idx < 0) return { success: false, reason: 'Aucun pillage en attente' };

  const options = (ck.pendingResolutions[idx]!.data?.options as string[] | undefined) ?? [];
  if (options.length > 0 && !options.includes(intersectionId)) {
    return { success: false, reason: 'Ville hors des options de pillage' };
  }

  const result = pillageCity(state, playerId, intersectionId);
  if (!result.success) return result;
  ck.pendingResolutions.splice(idx, 1);
  refreshTrophiesAndVictory(state);
  return { success: true };
}

function queueOrPillage(
  state: GameState,
  playerId: string,
  pillagedPlayerIds: string[],
): void {
  const cities = listPillagableCities(state, playerId);
  if (cities.length === 0) return;
  if (cities.length === 1) {
    pillageCity(state, playerId, cities[0]!);
    pillagedPlayerIds.push(playerId);
    return;
  }
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  const already = ck.pendingResolutions.some(
    (r) => r.kind === 'pillage_city' && r.playerId === playerId,
  );
  if (!already) {
    ck.pendingResolutions.push({
      id: nextId('ckres'),
      kind: 'pillage_city',
      playerId,
      data: { options: cities },
    });
  }
  pillagedPlayerIds.push(playerId);
}

function resolveBarbariansWin(state: GameState, result: CkInvasionResult): void {
  // Tiers de contribution croissants ; au premier tier où quelqu’un peut être pillé,
  // chaque joueur de ce tier qui a une ville pillable perd une ville (égalité).
  // Si personne du tier ne peut, passer au suivant (cascade FAQ).
  type Row = { playerId: string; strength: number; canPillage: boolean };
  const rows: Row[] = state.turnOrder.map((playerId) => ({
    playerId,
    strength: playerDefenseContribution(state, playerId),
    canPillage: listPillagableCities(state, playerId).length > 0,
  }));

  const strengths = [...new Set(rows.map((r) => r.strength))].sort((a, b) => a - b);
  for (const strength of strengths) {
    const tier = rows.filter((r) => r.strength === strength);
    const victims = tier.filter((r) => r.canPillage);
    if (victims.length === 0) continue;
    for (const v of victims) {
      queueOrPillage(state, v.playerId, result.pillagedPlayerIds);
    }
    break;
  }

  if (result.pillagedPlayerIds.length === 0) {
    log(state, null, 'Invasion : aucune ville pillable', {});
  }
}

function totalDefenderVpAwarded(state: GameState): number {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return 0;
  return Object.values(ck.defenderVp).reduce((s, n) => s + (n ?? 0), 0);
}

function resolveDefendersWin(state: GameState, result: CkInvasionResult): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;

  const contributions = state.turnOrder.map((playerId) => ({
    playerId,
    strength: playerDefenseContribution(state, playerId),
  }));
  const max = Math.max(0, ...contributions.map((c) => c.strength));
  if (max <= 0) {
    log(state, null, 'Victoire sans contribution de chevaliers', {});
    return;
  }
  const tops = contributions.filter((c) => c.strength === max).map((c) => c.playerId);

  if (tops.length === 1) {
    const winner = tops[0]!;
    if (totalDefenderVpAwarded(state) < DEFENDER_VP_MAX) {
      ck.defenderVp[winner] = (ck.defenderVp[winner] ?? 0) + 1;
      result.defenderVpAwardedTo = winner;
      log(state, winner, 'Défenseur de Catan (+1 PV)', {});
    } else {
      // Jetons épuisés → pioche Progress au choix
      queueProgressDeckChoice(state, winner);
      result.progressDrawPlayerIds.push(winner);
    }
    return;
  }

  // Égalité au sommet → chaque joueur pioche une carte Progrès (choix du deck)
  for (const playerId of tops) {
    queueProgressDeckChoice(state, playerId);
    result.progressDrawPlayerIds.push(playerId);
  }
  log(state, null, 'Égalité Défenseurs : pioche Progress', {
    players: tops,
  });
}

function queueProgressDeckChoice(state: GameState, playerId: string): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  const already = ck.pendingResolutions.some(
    (r) => r.kind === 'choose_progress_deck' && r.playerId === playerId,
  );
  if (already) return;
  ck.pendingResolutions.push({
    id: nextId('ckres'),
    kind: 'choose_progress_deck',
    playerId,
    data: { reason: 'invasion' },
  });
}

export function ckChooseProgressDeck(
  playerId: string,
  deck: CkProgressDeckId,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État C&K manquant' };
  const idx = ck.pendingResolutions.findIndex(
    (r) => r.kind === 'choose_progress_deck' && r.playerId === playerId,
  );
  if (idx < 0) return { success: false, reason: 'Aucun choix de deck en attente' };

  const drawn = drawProgressCard(state, playerId, deck);
  if (!drawn.ok) {
    return { success: false, reason: drawn.reason ?? 'Pioche impossible' };
  }
  ck.pendingResolutions.splice(idx, 1);
  log(state, playerId, `Carte Progrès piochée (${deck})`, {
    cardType: drawn.card?.type,
    needsDiscard: drawn.needsDiscard,
  });
  return { success: true };
}

/**
 * Déclenche l’invasion : compare forces, applique win/lose, reset piste, unlock brigand.
 */
export function resolveCkInvasion(state: GameState): CkInvasionResult {
  const ck = ensureCitiesKnightsState(state);
  const empty: CkInvasionResult = {
    turn: state.currentTurn,
    barbarianStrength: 0,
    defenseStrength: 0,
    outcome: 'defenders_win',
    defenderVpAwardedTo: null,
    progressDrawPlayerIds: [],
    pillagedPlayerIds: [],
  };
  if (!ck) return empty;

  const barbarianStrength = countCitiesOnBoard(state);
  const defenseStrength = totalDefenseStrength(state);
  const outcome: CkInvasionResult['outcome'] =
    defenseStrength >= barbarianStrength ? 'defenders_win' : 'barbarians_win';

  const result: CkInvasionResult = {
    turn: state.currentTurn,
    barbarianStrength,
    defenseStrength,
    outcome,
    defenderVpAwardedTo: null,
    progressDrawPlayerIds: [],
    pillagedPlayerIds: [],
  };

  log(state, null, `Invasion barbare : ${defenseStrength} vs ${barbarianStrength}`, {
    outcome,
    barbarianStrength,
    defenseStrength,
  });

  if (outcome === 'defenders_win') {
    resolveDefendersWin(state, result);
  } else {
    resolveBarbariansWin(state, result);
  }

  deactivateAllKnights(state);
  ck.barbarianTrackPosition = 0;
  ck.invasionCount += 1;
  ck.robberUnlocked = true;
  ck.lastInvasionResult = result;
  refreshTrophiesAndVictory(state);
  return result;
}

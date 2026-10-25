import { GameState } from '../../types/game';
import { Player } from '../../types/player';
import { ResourceBundle, ResourceType } from '../../types/resources';
import { TechId } from '../../types/technology';
import { UnitInstance, UnitType } from '../../types/military';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import {
  hasResources,
  subtractResources,
} from '../resources/ResourceSystem';
import { applyEventEffects } from '../events/EventSystem';
import { TechTreeEngine } from '../tech/TechTree';
import {
  DiplomacyActionType,
  processDiplomacyAction,
} from '../diplomacy/DiplomacyEngine';
import {
  canMoveTo,
  resolveCombat,
  resolveRangedAttack,
  UNIT_BASE_STATS,
} from '../military/CombatEngine';
import { hexDistance, hexToId } from '../hex/HexMath';

export interface ModuleActionResult {
  success: boolean;
  reason?: string;
}

const BASIC_RECRUIT_COSTS: Partial<Record<UnitType, ResourceBundle>> = {
  warrior: { ore: 1, wheat: 1, sheep: 1 },
  spearman: { wood: 1, ore: 1, wheat: 1 },
  archer: { wood: 1, wheat: 1, sheep: 1 },
  swordsman: { ore: 2, wheat: 1, sheep: 1 },
  cavalry: { sheep: 2, ore: 1, wheat: 1 },
};

function logModuleAction(
  state: GameState,
  playerId: string,
  type:
    | 'event_choice'
    | 'research'
    | 'diplomacy'
    | 'train_unit'
    | 'attack'
    | 'system'
    | 'production_order'
    | 'move_unit',
  description: string,
  data: Record<string, unknown>,
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId,
    type,
    description,
    data,
    timestamp: now(),
  });
}

export function ensurePendingEventChoices(state: GameState): void {
  if (!state.config.enableEvents) return;
  const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
  if (!currentPlayerId) return;

  for (const event of state.activeEvents) {
    if (!event.choices?.length) continue;
    const existing = state.pendingChoices.find(
      (pending) => pending.eventId === event.id && pending.playerId === currentPlayerId,
    );
    if (existing) continue;

    state.pendingChoices.push({
      id: `pending_${event.id}_${currentPlayerId}`,
      eventId: event.id,
      playerId: currentPlayerId,
      choices: event.choices,
      deadline: state.currentTurn + 2,
    });
  }
}

export function chooseEvent(
  playerId: string,
  eventId: string,
  choiceId: string,
  state: GameState,
): ModuleActionResult {
  if (!state.config.enableEvents) {
    return { success: false, reason: 'Les événements sont désactivés.' };
  }

  const pending = state.pendingChoices.find(
    (item) => item.playerId === playerId && item.eventId === eventId,
  );
  if (!pending) {
    return { success: false, reason: "Aucun choix d'événement en attente." };
  }

  const player = state.players.get(playerId);
  const event = state.activeEvents.find((entry) => entry.id === eventId);
  if (!player || !event) {
    state.pendingChoices = state.pendingChoices.filter((entry) => entry.id !== pending.id);
    return { success: false, reason: 'Événement non disponible.' };
  }

  const choice = event.choices?.find((entry) => entry.id === choiceId);
  if (!choice) {
    return { success: false, reason: 'Choix introuvable.' };
  }

  if (choice.cost && !hasResources(player.resources, choice.cost)) {
    return { success: false, reason: 'Ressources insuffisantes pour ce choix.' };
  }

  if (choice.cost) {
    player.resources = subtractResources(player.resources, choice.cost);
  }

  applyEventEffects(event, state, choice.id);
  state.pendingChoices = state.pendingChoices.filter((entry) => entry.id !== pending.id);

  if (event.duration === 0) {
    state.activeEvents = state.activeEvents.filter((entry) => entry.id !== event.id);
    state.eventHistory.push({ ...event, followUp: choiceId });
  } else {
    event.followUp = choiceId;
  }

  logModuleAction(state, playerId, 'event_choice', `Choix « ${choiceId} » pour ${event.name}`, {
    eventId,
    choiceId,
  });

  return { success: true };
}

export function startResearch(
  playerId: string,
  techId: string,
  state: GameState,
): ModuleActionResult {
  if (!state.config.enableTechTree) {
    return { success: false, reason: "L'arbre technologique est désactivé." };
  }

  const player = state.players.get(playerId);
  if (!player) return { success: false, reason: 'Joueur introuvable.' };

  const verdict = TechTreeEngine.canResearch(techId as TechId, player);
  if (!verdict.canResearch) {
    return { success: false, reason: verdict.reason ?? 'Recherche impossible.' };
  }

  if (!player.currentResearch) {
    player.currentResearch = techId as TechId;
    player.researchProgress = 0;
  } else if (!player.researchQueue.includes(techId as TechId)) {
    player.researchQueue.push(techId as TechId);
  }

  logModuleAction(state, playerId, 'research', `Recherche démarrée : ${techId}`, { techId });
  return { success: true };
}

export function runDiplomacyCommand(
  playerId: string,
  toPlayerId: string,
  actionType: string,
  data: unknown,
  state: GameState,
): ModuleActionResult {
  if (!state.config.enableDiplomacy) {
    return { success: false, reason: 'La diplomatie est désactivée.' };
  }

  const result = processDiplomacyAction(
    {
      type: actionType as DiplomacyActionType,
      fromPlayerId: playerId,
      toPlayerId,
      data,
    },
    state,
  );

  if (!result.success) {
    return { success: false, reason: result.reason ?? 'Action diplomatique impossible.' };
  }

  logModuleAction(state, playerId, 'diplomacy', `Diplomatie : ${actionType} → ${toPlayerId}`, {
    actionType,
    toPlayerId,
  });
  return { success: true };
}

export function castCouncilVote(
  playerId: string,
  optionId: string,
  state: GameState,
): ModuleActionResult {
  if (!state.config.worldCouncil || !state.worldCouncil.active) {
    return { success: false, reason: 'Le conseil mondial est désactivé.' };
  }

  const resolution = state.worldCouncil.currentResolution;
  if (!resolution) {
    return { success: false, reason: 'Aucune résolution en cours.' };
  }

  if (!resolution.options.some((option) => option.id === optionId)) {
    return { success: false, reason: 'Option de vote invalide.' };
  }

  state.worldCouncil.votes[playerId] = optionId;
  logModuleAction(state, playerId, 'system', `Vote conseil : ${optionId}`, {
    optionId,
    resolutionId: resolution.id,
  });
  return { success: true };
}

function getRecruitCost(unitType: UnitType): ResourceBundle {
  return BASIC_RECRUIT_COSTS[unitType] ?? { ore: 1, wheat: 1, sheep: 1 };
}

function createUnit(
  type: UnitType,
  ownerId: string,
  tileId: string,
  state: GameState,
): UnitInstance {
  const tile = state.map.get(tileId)!;
  const stats = UNIT_BASE_STATS[type];
  return {
    id: nextId('unit'),
    type,
    ownerId,
    position: { ...tile.coord },
    stats: { ...stats },
    name: `${type}_${ownerId.slice(-2)}`,
    experience: 0,
    level: 1,
    promotions: [],
    status: 'idle',
    hasMoved: false,
    hasAttacked: false,
    facing: 0,
    isEmbark: false,
  };
}

function refreshMilitaryStats(state: GameState, playerId: string): void {
  const player = state.players.get(playerId);
  if (!player) return;
  player.stats.totalUnits = player.units.length;
  player.stats.militaryStrength = player.units.reduce((sum, unitId) => {
    const unit = state.units.get(unitId);
    if (!unit) return sum;
    return sum + unit.stats.attack + unit.stats.defense + Math.floor(unit.stats.currentHealth / 12);
  }, 0);
}

function removeUnitFromState(state: GameState, unitId: string): void {
  const unit = state.units.get(unitId);
  if (!unit) return;
  const tileId = hexToId(unit.position);
  const tile = state.map.get(tileId);
  if (tile) {
    tile.units = tile.units.filter((id) => id !== unitId);
  }
  const owner = state.players.get(unit.ownerId);
  if (owner) {
    owner.units = owner.units.filter((id) => id !== unitId);
  }
  state.units.delete(unitId);
}

export function recruitUnit(
  playerId: string,
  tileId: string,
  unitTypeRaw: string,
  state: GameState,
): ModuleActionResult {
  if (!state.config.enableMilitary) {
    return { success: false, reason: 'Le module militaire est désactivé.' };
  }

  const unitType = unitTypeRaw as UnitType;
  if (!UNIT_BASE_STATS[unitType]) {
    return { success: false, reason: "Type d'unité inconnu." };
  }

  const player = state.players.get(playerId);
  const tile = state.map.get(tileId);
  if (!player || !tile) {
    return { success: false, reason: 'Tuile ou joueur introuvable.' };
  }

  if (tile.owner !== player.id) {
    return { success: false, reason: 'Vous ne contrôlez pas cette tuile.' };
  }

  const canRecruitHere =
    player.settlements.includes(tileId) ||
    player.cities.includes(tileId) ||
    player.metropolis.includes(tileId) ||
    tile.buildings.some((buildingId) => {
      const building = state.buildings.get(buildingId);
      return building?.ownerId === player.id && building.definitionId === 'barracks';
    });

  if (!canRecruitHere) {
    return {
      success: false,
      reason: 'Recrutement possible seulement dans une zone urbaine ou avec caserne.',
    };
  }

  const cost = getRecruitCost(unitType);
  if (!hasResources(player.resources, cost)) {
    return { success: false, reason: 'Ressources insuffisantes pour recruter cette unité.' };
  }

  if (tile.units.length >= 8) {
    return { success: false, reason: 'Cette tuile est déjà saturée en unités.' };
  }

  const trainingLimit = state.worldCouncil?.activeEffects?.find(
    (effect) => effect.kind === 'unit_training_limit' && effect.expiresTurn >= state.currentTurn,
  );
  if (trainingLimit) {
    const max = Number(trainingLimit.data?.max ?? 1);
    const trainedThisTurn = state.actionLog.filter(
      (entry) =>
        entry.playerId === playerId &&
        entry.type === 'train_unit' &&
        entry.turn === state.currentTurn,
    ).length;
    if (trainedThisTurn >= max) {
      return {
        success: false,
        reason: `Limitation du conseil : maximum ${max} recrutement(s) par tour.`,
      };
    }
  }

  player.resources = subtractResources(player.resources, cost);
  const unit = createUnit(unitType, player.id, tileId, state);
  state.units.set(unit.id, unit);
  tile.units.push(unit.id);
  player.units.push(unit.id);
  refreshMilitaryStats(state, player.id);

  logModuleAction(state, playerId, 'train_unit', `Recrutement : ${unitType} à ${tileId}`, {
    unitType,
    tileId,
  });
  return { success: true };
}

export function attackUnit(
  playerId: string,
  attackerId: string,
  defenderId: string,
  state: GameState,
): ModuleActionResult {
  if (!state.config.enableMilitary) {
    return { success: false, reason: 'Le module militaire est désactivé.' };
  }

  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  if (!attacker || !defender) {
    return { success: false, reason: 'Unité attaquante ou défensive introuvable.' };
  }

  if (attacker.ownerId !== playerId) {
    return { success: false, reason: 'Vous ne contrôlez pas cette unité.' };
  }

  if (attacker.hasAttacked) {
    return { success: false, reason: 'Cette unité a déjà attaqué ce tour.' };
  }

  const distance = hexDistance(attacker.position, defender.position);
  const canMelee = distance === 1;
  const canRanged =
    distance > 1 && attacker.stats.rangedAttack > 0 && distance <= attacker.stats.range;

  if (!canMelee && !canRanged) {
    return { success: false, reason: 'Cible hors de portée.' };
  }

  const defenderOwnerId = defender.ownerId;
  const result = canRanged
    ? resolveRangedAttack(attackerId, defenderId, state)
    : resolveCombat(attackerId, defenderId, state);

  attacker.hasAttacked = true;
  attacker.status = 'attacking';
  if (canMelee) {
    attacker.hasMoved = true;
  }

  if (result.defenderDestroyed) {
    removeUnitFromState(state, defenderId);
    const attackerPlayer = state.players.get(attacker.ownerId);
    const defenderPlayer = state.players.get(defenderOwnerId);
    if (attackerPlayer) attackerPlayer.stats.battlesWon += 1;
    if (defenderPlayer) defenderPlayer.stats.battlesLost += 1;
  }

  if (result.attackerDestroyed) {
    removeUnitFromState(state, attackerId);
    const attackerPlayer = state.players.get(attacker.ownerId);
    const defenderPlayer = state.players.get(defenderOwnerId);
    if (attackerPlayer) attackerPlayer.stats.battlesLost += 1;
    if (defenderPlayer) defenderPlayer.stats.battlesWon += 1;
  }

  refreshMilitaryStats(state, playerId);
  if (defenderOwnerId !== playerId) {
    refreshMilitaryStats(state, defenderOwnerId);
  }

  logModuleAction(state, playerId, 'attack', `Combat ${attackerId} → ${defenderId}`, {
    attackerId,
    defenderId,
    ranged: canRanged,
  });
  return { success: true };
}

export function moveUnit(
  playerId: string,
  unitId: string,
  targetTileId: string,
  state: GameState,
): ModuleActionResult {
  if (!state.config.enableMilitary) {
    return { success: false, reason: 'Le module militaire est désactivé.' };
  }

  const unit = state.units.get(unitId);
  const targetTile = state.map.get(targetTileId);
  if (!unit || !targetTile) {
    return { success: false, reason: 'Unité ou destination introuvable.' };
  }
  if (unit.ownerId !== playerId) {
    return { success: false, reason: 'Vous ne contrôlez pas cette unité.' };
  }

  const moveVerdict = canMoveTo(unitId, targetTileId, state);
  if (!moveVerdict.canMove) {
    return { success: false, reason: moveVerdict.reason ?? 'Déplacement impossible.' };
  }

  const enemyOnTarget = targetTile.units.some((candidateId) => {
    const candidate = state.units.get(candidateId);
    return Boolean(candidate && candidate.ownerId !== unit.ownerId);
  });
  if (enemyOnTarget) {
    return { success: false, reason: 'Tuile occupée par des unités ennemies.' };
  }

  const fromTileId = hexToId(unit.position);
  const fromTile = state.map.get(fromTileId);
  if (fromTile) {
    fromTile.units = fromTile.units.filter((id) => id !== unit.id);
  }

  targetTile.units.push(unit.id);
  unit.position = { ...targetTile.coord };
  unit.hasMoved = true;
  unit.status = 'moving';

  logModuleAction(state, playerId, 'move_unit', `Déplacement vers ${targetTileId}`, {
    unitId,
    from: fromTileId,
    to: targetTileId,
  });
  return { success: true };
}

/** Science de base quand le tech tree est actif sans chaînes de production. */
export function baselineScienceForPlayer(player: Player, state: GameState): number {
  if (!state.config.enableTechTree) return 0;
  if (state.config.enableProductionChains) return 0;

  const settlements = player.settlements.length;
  const cities = player.cities.length;
  const metropolis = player.metropolis.length;
  return Math.max(1, settlements + cities * 2 + metropolis * 3);
}

export type { ResourceType };

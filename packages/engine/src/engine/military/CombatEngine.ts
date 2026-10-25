// ============================================================
// CombatEngine — Résolution des combats, sièges, batailles navales
// ============================================================

import {
  UnitInstance,
  UnitDefinition,
  UnitType,
  CombatResult,
  CombatLogEntry,
  CombatModifier,
  SiegeState,
  UnitStats,
} from '../../types/military';
import { HexTile } from '../../types/hex';
import { Player } from '../../types/player';
import { GameState } from '../../types/game';
import { hexDistance, hexToId, hexAllNeighbors } from '../hex/HexMath';
import { CIVILIZATIONS } from '../civilizations/Civilizations';
import { randomInt } from '../../core/rng';

// ============================================================
// STATS DE BASE PAR TYPE D'UNITÉ
// ============================================================

export const UNIT_BASE_STATS: Record<UnitType, UnitStats> = {
  warrior: {
    attack: 5,
    defense: 4,
    rangedAttack: 0,
    range: 0,
    movement: 2,
    health: 100,
    currentHealth: 100,
    armor: 0,
    sight: 2,
  },
  spearman: {
    attack: 5,
    defense: 6,
    rangedAttack: 0,
    range: 0,
    movement: 2,
    health: 100,
    currentHealth: 100,
    armor: 1,
    sight: 2,
  },
  swordsman: {
    attack: 8,
    defense: 7,
    rangedAttack: 0,
    range: 0,
    movement: 2,
    health: 100,
    currentHealth: 100,
    armor: 2,
    sight: 2,
  },
  pikeman: {
    attack: 6,
    defense: 9,
    rangedAttack: 0,
    range: 0,
    movement: 1,
    health: 100,
    currentHealth: 100,
    armor: 2,
    sight: 2,
  },
  knight: {
    attack: 12,
    defense: 9,
    rangedAttack: 0,
    range: 0,
    movement: 4,
    health: 120,
    currentHealth: 120,
    armor: 3,
    sight: 3,
  },
  berserker: {
    attack: 14,
    defense: 5,
    rangedAttack: 0,
    range: 0,
    movement: 3,
    health: 110,
    currentHealth: 110,
    armor: 1,
    sight: 2,
  },
  legionary: {
    attack: 9,
    defense: 10,
    rangedAttack: 0,
    range: 0,
    movement: 2,
    health: 110,
    currentHealth: 110,
    armor: 3,
    sight: 2,
  },
  archer: {
    attack: 3,
    defense: 3,
    rangedAttack: 7,
    range: 2,
    movement: 2,
    health: 80,
    currentHealth: 80,
    armor: 0,
    sight: 3,
  },
  crossbowman: {
    attack: 3,
    defense: 4,
    rangedAttack: 9,
    range: 2,
    movement: 2,
    health: 85,
    currentHealth: 85,
    armor: 1,
    sight: 3,
  },
  longbowman: {
    attack: 3,
    defense: 3,
    rangedAttack: 11,
    range: 3,
    movement: 2,
    health: 85,
    currentHealth: 85,
    armor: 0,
    sight: 4,
  },
  gunner: {
    attack: 4,
    defense: 4,
    rangedAttack: 13,
    range: 2,
    movement: 2,
    health: 90,
    currentHealth: 90,
    armor: 1,
    sight: 3,
  },
  cavalry: {
    attack: 10,
    defense: 6,
    rangedAttack: 0,
    range: 0,
    movement: 5,
    health: 110,
    currentHealth: 110,
    armor: 1,
    sight: 4,
  },
  heavy_cavalry: {
    attack: 13,
    defense: 8,
    rangedAttack: 0,
    range: 0,
    movement: 4,
    health: 130,
    currentHealth: 130,
    armor: 4,
    sight: 3,
  },
  horse_archer: {
    attack: 7,
    defense: 5,
    rangedAttack: 8,
    range: 2,
    movement: 5,
    health: 100,
    currentHealth: 100,
    armor: 1,
    sight: 4,
  },
  cataphract: {
    attack: 15,
    defense: 12,
    rangedAttack: 0,
    range: 0,
    movement: 3,
    health: 140,
    currentHealth: 140,
    armor: 6,
    sight: 3,
  },
  battering_ram: {
    attack: 2,
    defense: 3,
    rangedAttack: 0,
    range: 0,
    movement: 1,
    health: 150,
    currentHealth: 150,
    armor: 5,
    sight: 1,
  },
  catapult: {
    attack: 2,
    defense: 2,
    rangedAttack: 14,
    range: 3,
    movement: 1,
    health: 100,
    currentHealth: 100,
    armor: 1,
    sight: 2,
  },
  trebuchet: {
    attack: 2,
    defense: 2,
    rangedAttack: 17,
    range: 4,
    movement: 1,
    health: 100,
    currentHealth: 100,
    armor: 1,
    sight: 2,
  },
  cannon: {
    attack: 3,
    defense: 3,
    rangedAttack: 20,
    range: 3,
    movement: 2,
    health: 110,
    currentHealth: 110,
    armor: 2,
    sight: 3,
  },
  galley: {
    attack: 5,
    defense: 4,
    rangedAttack: 0,
    range: 0,
    movement: 4,
    health: 100,
    currentHealth: 100,
    armor: 0,
    sight: 4,
  },
  war_galley: {
    attack: 9,
    defense: 7,
    rangedAttack: 3,
    range: 1,
    movement: 4,
    health: 110,
    currentHealth: 110,
    armor: 1,
    sight: 4,
  },
  carrack: {
    attack: 4,
    defense: 5,
    rangedAttack: 5,
    range: 2,
    movement: 5,
    health: 130,
    currentHealth: 130,
    armor: 2,
    sight: 5,
  },
  warship: {
    attack: 10,
    defense: 10,
    rangedAttack: 12,
    range: 3,
    movement: 5,
    health: 150,
    currentHealth: 150,
    armor: 4,
    sight: 5,
  },
  fire_ship: {
    attack: 15,
    defense: 2,
    rangedAttack: 0,
    range: 0,
    movement: 3,
    health: 80,
    currentHealth: 80,
    armor: 0,
    sight: 3,
  },
  spy: {
    attack: 3,
    defense: 2,
    rangedAttack: 0,
    range: 0,
    movement: 3,
    health: 60,
    currentHealth: 60,
    armor: 0,
    sight: 5,
  },
  diplomat: {
    attack: 1,
    defense: 1,
    rangedAttack: 0,
    range: 0,
    movement: 3,
    health: 60,
    currentHealth: 60,
    armor: 0,
    sight: 3,
  },
  missionary: {
    attack: 1,
    defense: 1,
    rangedAttack: 0,
    range: 0,
    movement: 3,
    health: 60,
    currentHealth: 60,
    armor: 0,
    sight: 3,
  },
  explorer: {
    attack: 2,
    defense: 2,
    rangedAttack: 0,
    range: 0,
    movement: 5,
    health: 70,
    currentHealth: 70,
    armor: 0,
    sight: 6,
  },
  merchant: {
    attack: 1,
    defense: 1,
    rangedAttack: 0,
    range: 0,
    movement: 3,
    health: 70,
    currentHealth: 70,
    armor: 0,
    sight: 3,
  },
  worker: {
    attack: 1,
    defense: 1,
    rangedAttack: 0,
    range: 0,
    movement: 2,
    health: 70,
    currentHealth: 70,
    armor: 0,
    sight: 2,
  },
  hero: {
    attack: 18,
    defense: 15,
    rangedAttack: 8,
    range: 2,
    movement: 4,
    health: 200,
    currentHealth: 200,
    armor: 5,
    sight: 5,
  },
};

// ============================================================
// 2.10D — STATS EFFECTIVES (inclut bonus unité unique de civ)
// ============================================================

/**
 * Retourne les stats réelles d'une unité en tenant compte du bonus
 * de l'unité unique de la civilisation du propriétaire.
 */
export function getEffectiveUnitStats(unit: UnitInstance, player: Player): UnitStats {
  const base = { ...(UNIT_BASE_STATS[unit.type] ?? unit.stats) };
  const civDef = CIVILIZATIONS[player.civilization];
  if (!civDef) return base;

  const uniqueUnit = civDef.uniqueUnit;
  if (uniqueUnit.replaces !== unit.type) return base;

  // Appliquer les bonus stat de l'unité unique
  const bonus = uniqueUnit.statBonus;
  return {
    attack: base.attack + (bonus.attack ?? 0),
    defense: base.defense + (bonus.defense ?? 0),
    rangedAttack: base.rangedAttack + (bonus.rangedAttack ?? 0),
    range: base.range + (bonus.range ?? 0),
    movement: base.movement + (bonus.movement ?? 0),
    health: base.health + (bonus.health ?? 0),
    currentHealth: unit.stats.currentHealth, // conserver les HP actuels
    armor: base.armor + (bonus.armor ?? 0),
    sight: base.sight + (bonus.sight ?? 0),
  };
}

// ============================================================
// TERRAIN BONUSES (% de force défensive)
// ============================================================

const TERRAIN_DEFENSE_BONUS: Record<string, number> = {
  forest: 25, // +25% défense
  mountain: 50, // +50% défense
  hill: 25, // +25% défense
  swamp: 15,
  glacier: 20,
  jungle: 20,
  plains: 0,
  desert: 0,
  coast: -10, // -10% défense
};

// ============================================================
// MODIFICATEURS DE COMBAT
// ============================================================

function collectCombatModifiers(
  unit: UnitInstance,
  isAttacker: boolean,
  tile: HexTile,
  opponent: UnitInstance,
  state: GameState,
): CombatModifier[] {
  const modifiers: CombatModifier[] = [];

  // Bonus terrain (défenseur uniquement)
  if (!isAttacker) {
    const terrainBonus = TERRAIN_DEFENSE_BONUS[tile.terrain] ?? 0;
    if (terrainBonus !== 0) {
      modifiers.push({
        source: 'terrain',
        value: terrainBonus,
        description: `Terrain ${tile.terrain} : ${terrainBonus > 0 ? '+' : ''}${terrainBonus}%`,
      });
    }
  }

  // Fortification
  if (unit.status === 'fortified') {
    modifiers.push({ source: 'fortified', value: 25, description: '+25% fortifié' });
  }

  // Niveaux d'expérience
  const xpBonus = (unit.level - 1) * 10;
  if (xpBonus > 0) {
    modifiers.push({
      source: 'experience',
      value: xpBonus,
      description: `+${xpBonus}% expérience`,
    });
  }

  // Promotions
  for (const promo of unit.promotions) {
    if (promo.startsWith('combat_')) {
      modifiers.push({ source: promo, value: 10, description: '+10% promotion combat' });
    }
    if (promo.startsWith('defense_') && !isAttacker) {
      modifiers.push({ source: promo, value: 10, description: '+10% promotion défense' });
    }
    if (promo === 'veteran') {
      modifiers.push({ source: 'veteran', value: 25, description: '+25% vétéran' });
    }
    if (promo === 'elite') {
      modifiers.push({ source: 'elite', value: 50, description: '+50% élite' });
    }
  }

  // Anti-unité (bonus vs certain type)
  const attackerDef = UNIT_BONUS_VS[unit.type];
  if (attackerDef && attackerDef.bonus.includes(opponent.type)) {
    modifiers.push({ source: 'unit_bonus', value: 33, description: `+33% vs ${opponent.type}` });
  }

  // Berserker rage
  if (unit.type === 'berserker' && unit.stats.currentHealth < unit.stats.health * 0.5) {
    modifiers.push({
      source: 'berserker_rage',
      value: 30,
      description: '+30% Berserk rage (HP bas)',
    });
  }

  // Fortification dans ville
  const ownedCity = tile.buildings.length > 0 && !isAttacker;
  if (ownedCity) {
    modifiers.push({ source: 'city_defense', value: 20, description: '+20% défense en ville' });
  }

  // Cavalerie vs anti-cavalerie (malus)
  if (['cavalry', 'heavy_cavalry', 'cataphract', 'horse_archer'].includes(unit.type)) {
    if (['spearman', 'pikeman'].includes(opponent.type)) {
      modifiers.push({
        source: 'anti_cavalry',
        value: -33,
        description: '-33% vs lanciers/piquiers',
      });
    }
  }

  return modifiers;
}

const UNIT_BONUS_VS: Partial<Record<UnitType, { bonus: UnitType[] }>> = {
  spearman: { bonus: ['cavalry', 'heavy_cavalry', 'cataphract', 'horse_archer'] },
  pikeman: { bonus: ['cavalry', 'heavy_cavalry', 'cataphract'] },
  catapult: { bonus: ['warrior', 'spearman', 'swordsman', 'pikeman'] },
  trebuchet: { bonus: ['warrior', 'spearman', 'swordsman', 'pikeman', 'knight'] },
  cannon: { bonus: ['warrior', 'spearman', 'swordsman', 'pikeman', 'knight', 'cavalry'] },
  fire_ship: { bonus: ['galley', 'war_galley', 'carrack'] },
  battering_ram: { bonus: [] }, // bonus vs fortifications géré séparément
};

// ============================================================
// RÉSOLUTION DE COMBAT
// ============================================================

function calculateCombatStrength(
  unit: UnitInstance,
  isAttacker: boolean,
  modifiers: CombatModifier[],
): number {
  const baseStrength = isAttacker ? unit.stats.attack : unit.stats.defense;

  const totalModifierPercent = modifiers.reduce((sum, m) => sum + m.value, 0);
  return Math.max(1, baseStrength * (1 + totalModifierPercent / 100));
}

function rollDice(): number {
  return randomInt(1, 20); // d20
}

/**
 * Formule de dégâts logistique (courbe en S) : plage [5, 60].
 * Un ratio 1:1 et un roll médian (10) = ~25 dégâts.
 * Un ratio 3:1 et roll max = ~55 dégâts. Un ratio 1:3 et roll min = ~5 dégâts.
 */
function calculateDamage(attackerStrength: number, defenderStrength: number, roll: number): number {
  const ratio = attackerStrength / Math.max(1, defenderStrength);
  // Facteur roll : [0.7, 1.3] autour de 1
  const rollFactor = 0.7 + (roll / 20) * 0.6;
  // Logistique : 30 / (1 + e^(-2*(ratio-1)))  → ~15 à ratio 0, ~30 à ratio 1, ~45 à ratio 2
  const logistic = 60 / (1 + Math.exp(-2.5 * (ratio - 1)));
  const damage = logistic * rollFactor;
  return Math.round(Math.min(60, Math.max(5, damage)));
}

/**
 * Calcule le bonus de flanquement pour un attaquant :
 * +10% par allié adjacent au défenseur (max +30%).
 */
function calculateFlankingBonus(
  attacker: UnitInstance,
  defender: UnitInstance,
  state: GameState,
): number {
  const defenderHex = defender.position;
  const neighborIds = hexAllNeighbors(defenderHex).map((h) => hexToId(h));

  let flankCount = 0;
  for (const [, unit] of state.units) {
    if (unit.id === attacker.id) continue;
    if (unit.ownerId !== attacker.ownerId) continue;
    if (unit.stats.currentHealth <= 0) continue;
    if (neighborIds.includes(hexToId(unit.position))) {
      flankCount++;
    }
  }

  return Math.min(3, flankCount) * 10; // +10% par flanqueur, max +30%
}

export function resolveCombat(
  attackerId: string,
  defenderId: string,
  state: GameState,
): CombatResult {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);

  if (!attacker || !defender) {
    throw new Error('Unité introuvable');
  }

  // BUG FIX: utiliser la position du DÉFENSEUR (pas de l'attaquant) pour le bonus terrain
  const defenderTile = state.map.get(hexToId(defender.position));

  const log: CombatLogEntry[] = [];

  // === Phase 1 : Attaque ===
  const attackerMods = collectCombatModifiers(attacker, true, defenderTile!, defender, state);
  const defenderMods = collectCombatModifiers(defender, false, defenderTile!, attacker, state);

  // Bonus flanquement
  const flankBonus = calculateFlankingBonus(attacker, defender, state);
  if (flankBonus > 0) {
    attackerMods.push({
      source: 'flanking',
      value: flankBonus,
      description: `+${flankBonus}% flanquement`,
    });
  }

  // 2.10D — Bonus unité unique de civilisation
  const attackerPlayer = state.players.get(attacker.ownerId);
  const defenderPlayer = state.players.get(defender.ownerId);

  if (attackerPlayer) {
    const effectiveStats = getEffectiveUnitStats(attacker, attackerPlayer);
    const attackBonus = effectiveStats.attack - attacker.stats.attack;
    if (attackBonus > 0) {
      attackerMods.push({
        source: 'unique_unit',
        value: attackBonus,
        description: `+${attackBonus} attaque unité unique`,
      });
    }
  }
  if (defenderPlayer) {
    const effectiveStats = getEffectiveUnitStats(defender, defenderPlayer);
    const defBonus = effectiveStats.defense - defender.stats.defense;
    if (defBonus > 0) {
      defenderMods.push({
        source: 'unique_unit',
        value: defBonus,
        description: `+${defBonus} défense unité unique`,
      });
    }
  }

  // 2.5D — Moral de l'armée
  const attackerArmy = attackerPlayer?.army.find((a) => a.unitIds.includes(attackerId));
  const defenderArmy = defenderPlayer?.army.find((a) => a.unitIds.includes(defenderId));

  if (attackerArmy) {
    const moralePct = Math.round(getMoraleModifier(attackerArmy.morale) * 100);
    if (moralePct !== 0) {
      attackerMods.push({
        source: 'morale',
        value: moralePct,
        description: `${moralePct > 0 ? '+' : ''}${moralePct}% moral`,
      });
    }
  }
  if (defenderArmy) {
    const moralePct = Math.round(getMoraleModifier(defenderArmy.morale) * 100);
    if (moralePct !== 0) {
      defenderMods.push({
        source: 'morale',
        value: moralePct,
        description: `${moralePct > 0 ? '+' : ''}${moralePct}% moral`,
      });
    }
  }

  const attackStrength = calculateCombatStrength(attacker, true, attackerMods);
  const defenseStrength = calculateCombatStrength(defender, false, defenderMods);

  const attackRoll = rollDice();
  const defenseRoll = rollDice();

  const defenderDamage = calculateDamage(attackStrength, defenseStrength, attackRoll);
  const attackerDamage = calculateDamage(defenseStrength, attackStrength, defenseRoll);

  log.push({
    phase: 'main',
    attacker: attackerId,
    defender: defenderId,
    roll: attackRoll,
    modifiers: attackerMods,
    damage: defenderDamage,
    message: `${attacker.name} attaque ${defender.name} : ${defenderDamage} dégâts (roll: ${attackRoll})`,
  });

  log.push({
    phase: 'main',
    attacker: defenderId,
    defender: attackerId,
    roll: defenseRoll,
    modifiers: defenderMods,
    damage: attackerDamage,
    message: `${defender.name} riposte : ${attackerDamage} dégâts (roll: ${defenseRoll})`,
  });

  // Appliquer les dégâts
  attacker.stats.currentHealth = Math.max(0, attacker.stats.currentHealth - attackerDamage);
  defender.stats.currentHealth = Math.max(0, defender.stats.currentHealth - defenderDamage);

  const attackerDestroyed = attacker.stats.currentHealth <= 0;
  const defenderDestroyed = defender.stats.currentHealth <= 0;

  // XP
  if (!attackerDestroyed) {
    attacker.experience += defenderDestroyed ? 20 : 10;
    checkLevelUp(attacker);
  }
  if (!defenderDestroyed) {
    defender.experience += attackerDestroyed ? 20 : 10;
    checkLevelUp(defender);
  }

  // Retraite automatique : < 25% HP OU blessé et adversaire supérieur en force
  const attackerRetreats =
    !attackerDestroyed &&
    (attacker.stats.currentHealth < attacker.stats.health * 0.25 ||
      (attacker.stats.currentHealth < attacker.stats.health * 0.4 &&
        defenseStrength > attackStrength * 1.5));
  const defenderRetreats =
    !defenderDestroyed &&
    (defender.stats.currentHealth < defender.stats.health * 0.25 ||
      (defender.stats.currentHealth < defender.stats.health * 0.4 &&
        attackStrength > defenseStrength * 1.5));

  if (attackerRetreats) {
    log.push({
      phase: 'closing',
      attacker: attackerId,
      defender: defenderId,
      roll: 0,
      modifiers: [],
      damage: 0,
      message: `${attacker.name} bat en retraite`,
    });
  }
  if (defenderRetreats) {
    log.push({
      phase: 'closing',
      attacker: defenderId,
      defender: attackerId,
      roll: 0,
      modifiers: [],
      damage: 0,
      message: `${defender.name} bat en retraite`,
    });
  }

  return {
    attackerId,
    defenderId,
    attackerDamage,
    defenderDamage,
    attackerRetreats,
    defenderRetreats,
    attackerDestroyed,
    defenderDestroyed,
    log,
  };
}

// ============================================================
// COMBAT À DISTANCE
// ============================================================

export function resolveRangedAttack(
  attackerId: string,
  targetId: string,
  state: GameState,
): CombatResult {
  const attacker = state.units.get(attackerId);
  const target = state.units.get(targetId);

  if (!attacker || !target) throw new Error('Unité introuvable');

  const dist = hexDistance(attacker.position, target.position);
  if (dist > attacker.stats.range) {
    throw new Error(`Cible hors portée (portée: ${attacker.stats.range}, distance: ${dist})`);
  }

  // Bonus précision à courte portée
  const rangePenalty = dist === 1 ? 10 : dist === attacker.stats.range ? -10 : 0;

  const targetTile = state.map.get(
    target.position.q + ',' + target.position.r + ',' + target.position.s,
  );
  const defenderMods = collectCombatModifiers(target, false, targetTile!, attacker, state);
  defenderMods.push({
    source: 'range_modifier',
    value: rangePenalty,
    description: `Distance ${dist}: ${rangePenalty}%`,
  });

  const attackStrength = attacker.stats.rangedAttack;
  const defenseStrength = calculateCombatStrength(target, false, defenderMods);

  const roll = rollDice();
  const damage = calculateDamage(attackStrength, defenseStrength, roll);

  target.stats.currentHealth = Math.max(0, target.stats.currentHealth - damage);
  attacker.experience += target.stats.currentHealth <= 0 ? 15 : 5;

  return {
    attackerId,
    defenderId: targetId,
    attackerDamage: 0, // pas de riposte sur distance
    defenderDamage: damage,
    attackerRetreats: false,
    defenderRetreats: target.stats.currentHealth < target.stats.health * 0.2,
    attackerDestroyed: false,
    defenderDestroyed: target.stats.currentHealth <= 0,
    log: [
      {
        phase: 'main',
        attacker: attackerId,
        defender: targetId,
        roll,
        modifiers: defenderMods,
        damage,
        message: `${attacker.name} tir à distance sur ${target.name} : ${damage} dégâts`,
      },
    ],
  };
}

// ============================================================
// SIÈGE
// ============================================================

export function initiateSiege(
  siegerId: string,
  targetTileId: string,
  state: GameState,
): SiegeState {
  const tile = state.map.get(targetTileId);
  if (!tile) throw new Error('Tuile introuvable');

  const siegerUnits = [...state.units.values()].filter(
    (u) => u.ownerId === siegerId && hexDistance(u.position, tile.coord) <= 1,
  );

  const siegeStrength = siegerUnits.reduce(
    (sum, u) =>
      sum +
      u.stats.attack +
      (u.type === 'catapult' || u.type === 'trebuchet' || u.type === 'cannon' ? 20 : 0),
    0,
  );

  return {
    siegerId,
    defenderId: tile.owner ?? '',
    targetTileId,
    startedTurn: state.currentTurn,
    siegeProgress: 0,
    siegeStrength,
    garrisonStrength: calculateGarrisonStrength(targetTileId, state),
    supplyBlocked: false,
    log: [],
  };
}

function calculateGarrisonStrength(tileId: string, state: GameState): number {
  const tile = state.map.get(tileId);
  if (!tile) return 0;

  let strength = 0;

  // Unités dans la ville
  for (const unitId of tile.units) {
    const unit = state.units.get(unitId);
    if (unit) strength += unit.stats.defense;
  }

  // Bonus bâtiments défensifs
  for (const buildingId of tile.buildings) {
    const building = state.buildings.get(buildingId);
    if (!building) continue;
    if (building.definitionId === 'wall') strength += 15;
    if (building.definitionId === 'fortress') strength += 30;
    if (building.definitionId === 'watchtower') strength += 10;
    if (building.definitionId === 'gate') strength += 10;
  }

  return strength;
}

export function advanceSiege(siege: SiegeState, turn: number): SiegeState {
  const progressGain = Math.max(0, siege.siegeStrength - siege.garrisonStrength * 0.5);
  const newProgress = Math.min(100, siege.siegeProgress + progressGain);

  return {
    ...siege,
    siegeProgress: newProgress,
    log: [
      ...siege.log,
      {
        turn,
        event: `Progression du siège : +${progressGain.toFixed(1)} (total: ${newProgress.toFixed(1)}%)`,
        progressDelta: progressGain,
      },
    ],
  };
}

// ============================================================
// LEVEL UP & PROMOTIONS
// ============================================================

const XP_THRESHOLDS = [0, 30, 70, 120, 200, 300];

function checkLevelUp(unit: UnitInstance): void {
  // BUG FIX: boucle pour gérer les montées de niveaux multiples en un seul combat
  while (unit.level < 5) {
    const threshold = XP_THRESHOLDS[unit.level];
    if (threshold !== undefined && unit.experience >= threshold) {
      unit.level++;
    } else {
      break;
    }
  }
}

// ============================================================
// VALIDATIONS DE MOUVEMENT
// ============================================================

export function canMoveTo(
  unitId: string,
  targetTileId: string,
  state: GameState,
): { canMove: boolean; reason?: string } {
  const unit = state.units.get(unitId);
  if (!unit) return { canMove: false, reason: 'Unité introuvable' };

  if (unit.hasMoved) return { canMove: false, reason: 'Unité déjà déplacée ce tour' };

  const targetTile = state.map.get(targetTileId);
  if (!targetTile) return { canMove: false, reason: 'Tuile introuvable' };

  const dist = hexDistance(unit.position, targetTile.coord);
  if (dist > unit.stats.movement) {
    return { canMove: false, reason: `Trop loin (mouvement max: ${unit.stats.movement})` };
  }

  // Naval : ne peut aller sur mer qu'avec bateau
  const navalUnits: UnitType[] = ['galley', 'war_galley', 'carrack', 'warship', 'fire_ship'];
  const isNaval = navalUnits.includes(unit.type);
  const targetIsWater = ['ocean', 'coast'].includes(targetTile.terrain);

  if (targetIsWater && !isNaval) {
    return { canMove: false, reason: "Unité terrestre ne peut pas aller sur l'eau" };
  }
  if (!targetIsWater && isNaval) {
    return { canMove: false, reason: 'Unité navale ne peut pas aller sur terre' };
  }

  // Unité embarquée : peut se déplacer avec le navire, pas indépendamment
  if (unit.isEmbark && !isNaval) {
    return { canMove: false, reason: 'Unité embarquée — utiliser le navire pour se déplacer' };
  }

  // Territoire ennemi avec zone de contrôle
  if (targetTile.owner && targetTile.owner !== unit.ownerId) {
    const player = state.players.get(unit.ownerId);
    const tileOwner = targetTile.owner;
    const relation = player?.relations[tileOwner];
    if (!relation || relation.status === 'war' || relation.status === 'hostile') {
      // OK, c'est la guerre
    } else if (!relation.openBorders) {
      return { canMove: false, reason: 'Frontières fermées' };
    }
  }

  return { canMove: true };
}

// ============================================================
// 2.5C — TRANSPORT NAVAL
// embark / disembark avec contraintes de capacité
// ============================================================

const NAVAL_CAPACITY: Partial<Record<UnitType, number>> = {
  galley: 2,
  carrack: 4,
  warship: 3,
  war_galley: 1,
};

const NAVAL_UNIT_TYPES: UnitType[] = ['galley', 'war_galley', 'carrack', 'warship', 'fire_ship'];

/**
 * Embarque une unité terrestre sur un navire allié situé sur la même tuile ou adjacente.
 */
export function embarkUnit(
  unitId: string,
  shipId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  const unit = state.units.get(unitId);
  const ship = state.units.get(shipId);
  if (!unit) return { success: false, reason: 'Unité introuvable' };
  if (!ship) return { success: false, reason: 'Navire introuvable' };

  if (NAVAL_UNIT_TYPES.includes(unit.type)) {
    return { success: false, reason: "Une unité navale ne peut pas s'embarquer" };
  }
  if (!NAVAL_UNIT_TYPES.includes(ship.type)) {
    return { success: false, reason: "La cible n'est pas un navire" };
  }
  if (unit.ownerId !== ship.ownerId) {
    return { success: false, reason: 'Le navire appartient à un autre joueur' };
  }
  if (unit.isEmbark) {
    return { success: false, reason: 'Déjà embarqué' };
  }

  const dist = hexDistance(unit.position, ship.position);
  if (dist > 1) {
    return { success: false, reason: 'Navire trop éloigné (doit être adjacent ou même tuile)' };
  }

  // Vérifier la capacité
  const capacity = NAVAL_CAPACITY[ship.type] ?? 0;
  const alreadyEmbedded = [...state.units.values()].filter(
    (u) => u.shipId === shipId && u.isEmbark,
  ).length;
  if (alreadyEmbedded >= capacity) {
    return { success: false, reason: `Navire plein (capacité: ${capacity})` };
  }

  unit.isEmbark = true;
  unit.shipId = shipId;
  unit.position = { ...ship.position };
  unit.hasMoved = true; // Embarquement consomme le mouvement du tour
  return { success: true };
}

/**
 * Débarque une unité d'un navire sur une tuile terrestre adjacente.
 */
export function disembarkUnit(
  unitId: string,
  targetTileId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  const unit = state.units.get(unitId);
  if (!unit) return { success: false, reason: 'Unité introuvable' };
  if (!unit.isEmbark) return { success: false, reason: 'Unité non embarquée' };

  const targetTile = state.map.get(targetTileId);
  if (!targetTile) return { success: false, reason: 'Tuile introuvable' };
  if (['ocean', 'coast'].includes(targetTile.terrain)) {
    return { success: false, reason: 'Doit débarquer sur terre ferme' };
  }

  const dist = hexDistance(unit.position, targetTile.coord);
  if (dist > 1) {
    return { success: false, reason: 'Tuile cible trop éloignée' };
  }

  // Pénalité amphibie : -50% combat ce tour sauf si promotion 'amphibious'
  const hasAmphibious = unit.promotions.includes('amphibious');

  unit.isEmbark = false;
  unit.shipId = undefined;
  unit.position = { ...targetTile.coord };
  unit.hasMoved = true;

  return {
    success: true,
    reason: hasAmphibious ? undefined : 'Pénalité amphibie : -50% combat ce tour',
  };
}

// ============================================================
// 2.5D — SYSTÈME DE MORAL DES ARMÉES
// ============================================================

/**
 * Met à jour le moral de tous les groupes d'armée d'un joueur
 * après un événement (victoire, défaite, saison).
 */
export function updateArmyMorale(
  player: import('../../types/player').Player,
  event: 'victory' | 'defeat' | 'siege_win' | 'siege_loss' | 'winter' | 'supply_cut' | 'rest',
  state: GameState,
): void {
  const MORALE_DELTA: Record<string, number> = {
    victory: +15,
    defeat: -20,
    siege_win: +10,
    siege_loss: -15,
    winter: -8,
    supply_cut: -12,
    rest: +5,
  };

  const delta = MORALE_DELTA[event] ?? 0;

  for (const army of player.army) {
    army.morale = Math.min(100, Math.max(0, army.morale + delta));
  }
}

/**
 * Calcule le modificateur de combat issu du moral d'une armée.
 * < 30 → -15%  |  31-50 → 0%  |  51-80 → 0%  |  > 80 → +10%
 */
export function getMoraleModifier(morale: number): number {
  if (morale < 30) return -0.15;
  if (morale > 80) return 0.1;
  return 0;
}

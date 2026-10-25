// ============================================================
// MILITAIRE — Unités, combat, siège, naval
// ============================================================

import { CubeCoord } from './hex';
import { ResourceBundle } from './resources';

export type UnitType =
  // Infanterie
  | 'warrior' // Guerrier : basique, pas cher
  | 'spearman' // Lancier : anti-cavalerie
  | 'swordsman' // Épéiste : polyvalent
  | 'pikeman' // Piquier : défense renforcée
  | 'knight' // Chevalier : fort en mêlée
  | 'berserker' // Berserker : berserk, Viking
  | 'legionary' // Légionnaire : Empire, bonus formation
  // Archerie & Distance
  | 'archer' // Archer : distance, faible mêlée
  | 'crossbowman' // Arbalétrier : distance améliorée
  | 'longbowman' // Archer galois : portée max
  | 'gunner' // Mousquetaire : poudre, âge renaissance
  // Cavalerie
  | 'cavalry' // Cavalerie légère : rapide
  | 'heavy_cavalry' // Cavalerie lourde : puissante
  | 'horse_archer' // Archer monté : mobilité + distance
  | 'cataphract' // Cataphracte : armure totale
  // Siège
  | 'battering_ram' // Bélier : anti-muraille
  | 'catapult' // Catapulte : bombardement indirect
  | 'trebuchet' // Trébuchet : portée max, siège
  | 'cannon' // Canon : âge renaissance
  // Naval
  | 'galley' // Galère : rapide, transport
  | 'war_galley' // Galère de guerre : combat naval
  | 'carrack' // Caraque : transport lourd
  | 'warship' // Navire de guerre : puissant
  | 'fire_ship' // Brûlot : destruction
  // Spécial
  | 'spy' // Espion : invisible, sabotage
  | 'diplomat' // Diplomate : +influence
  | 'missionary' // Missionnaire : propagation foi
  | 'explorer' // Explorateur : révèle carte
  | 'merchant' // Marchand : caravane commerciale
  | 'worker' // Ouvrier : construction, travaux
  | 'hero'; // Héros : unique, très puissant

export interface UnitStats {
  attack: number; // 1-20
  defense: number; // 1-20
  rangedAttack: number; // 0 si pas de distance
  range: number; // portée en hexagones (0 = mêlée uniquement)
  movement: number; // cases par tour
  health: number; // HP max
  currentHealth: number;
  armor: number; // réduction dégâts
  sight: number; // portée de vision
}

export interface UnitCost {
  resources: ResourceBundle;
  turns: number; // tours de formation
  requiredBuilding: string;
  requiredTech?: string;
}

export interface UnitDefinition {
  type: UnitType;
  name: string;
  description: string;
  stats: UnitStats;
  cost: UnitCost;
  maintenanceCost: ResourceBundle; // coût par tour
  bonusVs: UnitType[]; // unités contre lesquelles bonus
  penaltyVs: UnitType[]; // unités contre lesquelles malus
  terrainBonuses: Partial<Record<string, number>>; // terrain -> bonus combat
  abilities: UnitAbilityType[];
  civilizationExclusive?: string; // uniquement pour une civ
  era: string; // âge requis
}

export type UnitAbilityType =
  | 'pillage' // vole des ressources à une tuile
  | 'fortify' // se fortifie pour bonus défense
  | 'ambush' // attaque surprise depuis forêt/colline
  | 'naval_transport' // peut transporter des unités
  | 'siege_bonus' // bonus contre les fortifications
  | 'zone_of_control' // empêche passage ennemi adjacent
  | 'heal_adjacent' // soigne les unités adjacentes
  | 'infiltrate' // peut entrer en territoire ennemi sans déclencher guerre
  | 'sabotage' // détruit bâtiment ennemi
  | 'convert' // convertit à la religion
  | 'trade_mission' // établit une route commerciale
  | 'scout' // ignore terrain difficile
  | 'counter_charge' // riposte renforcée vs cavalerie
  | 'shield_wall' // formation défensive (légionnaires)
  | 'berserker_rage' // +attaque quand HP bas
  | 'fire_arrow' // brûle bâtiments en bois
  | 'naval_superiority' // bonus vs unités navales
  | 'invisible' // non détectable par défaut
  | 'hero_aura'; // aura qui boost unités adjacentes

export interface UnitInstance {
  id: string;
  type: UnitType;
  ownerId: string;
  position: CubeCoord;
  stats: UnitStats; // stats actuelles (peut différer du template)
  name: string;
  experience: number; // XP accumulée
  level: number; // niveau (1-5)
  promotions: PromotionType[]; // améliorations gagnées
  status: UnitStatus;
  hasMoved: boolean;
  hasAttacked: boolean;
  armyId?: string; // appartient à une armée
  facing: number; // direction 0-5
  isEmbark: boolean; // embarqué sur navire
  shipId?: string;
}

export type UnitStatus =
  | 'idle'
  | 'moving'
  | 'attacking'
  | 'fortified'
  | 'garrisoned'
  | 'healing'
  | 'sieging'
  | 'patrolling'
  | 'sleeping'
  | 'dead';

export type PromotionType =
  // Combat
  | 'combat_i'
  | 'combat_ii'
  | 'combat_iii' // +10% attaque chaque
  | 'defense_i'
  | 'defense_ii'
  | 'defense_iii' // +10% défense chaque
  | 'veteran' // +25% tous combats
  | 'elite' // +50% tous combats
  | 'legendary' // double XP, +75%
  // Terrain
  | 'forest_fighter' // +25% forêt
  | 'mountain_fighter' // +25% montagne
  | 'amphibious' // pas de pénalité débarquement
  | 'rough_terrain' // ignore terrain difficile
  // Spécial
  | 'medic' // soigne unités adjacentes
  | 'logistics' // peut se déplacer après attaque
  | 'shock' // détruit les fortifications
  | 'accuracy' // +30% distance
  | 'cover' // -25% dégâts distance reçus
  | 'leadership' // boost armée entière
  | 'loyalty'; // jamais démoralisé;

// ============================================================
// COMBAT
// ============================================================

export interface CombatResult {
  attackerId: string;
  defenderId: string;
  attackerDamage: number; // dégâts subis par l'attaquant
  defenderDamage: number; // dégâts subis par le défenseur
  attackerRetreats: boolean;
  defenderRetreats: boolean;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  capturedTile?: string; // tuile capturée si victoire totale
  log: CombatLogEntry[];
}

export interface CombatLogEntry {
  phase: 'opening' | 'main' | 'closing';
  attacker: string;
  defender: string;
  roll: number;
  modifiers: CombatModifier[];
  damage: number;
  message: string;
}

export interface CombatModifier {
  source: string;
  value: number;
  description: string;
}

// ============================================================
// SIÈGE
// ============================================================

export interface SiegeState {
  siegerId: string;
  defenderId: string;
  targetTileId: string;
  startedTurn: number;
  siegeProgress: number; // 0-100, quand 100 = assaut possible
  siegeStrength: number; // force totale siège
  garrisonStrength: number; // défense actuelle
  supplyBlocked: boolean; // ravitaillement coupé
  log: SiegeLogEntry[];
}

export interface SiegeLogEntry {
  turn: number;
  event: string;
  progressDelta: number;
}

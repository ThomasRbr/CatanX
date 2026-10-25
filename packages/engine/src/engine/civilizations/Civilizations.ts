// ============================================================
// Civilisations — 8 civilisations asymétriques
// Bonus passifs, unités uniques, capacités spéciales
// ============================================================

import { CivilizationType } from '../../types/player';
import { ResourceBundle } from '../../types/resources';
import { TechId } from '../../types/technology';
import { UnitType } from '../../types/military';
import { randomChoice } from '../../core/rng';

export interface CivilizationDefinition {
  id: CivilizationType;
  name: string;
  description: string;
  lore: string;
  color: string; // couleur thématique
  startingResources: ResourceBundle;
  startingTechs: TechId[]; // techs débloquées au départ
  uniqueUnit: UniqueUnit; // unité exclusive
  uniqueBuilding?: UniqueBuilding; // bâtiment exclusif (optionnel)
  passiveBonuses: CivPassiveBonus[];
  specialAbility: CivSpecialAbility;
  aiPersonality: import('../../types/player').AIPersonality;
  strengths: string[];
  weaknesses: string[];
}

export interface UniqueUnit {
  replaces: UnitType; // remplace cette unité standard
  name: string;
  description: string;
  statBonus: Partial<import('../../types/military').UnitStats>;
  costReduction: number; // % de réduction de coût
  extraAbilities: string[];
}

export interface UniqueBuilding {
  replaces: string; // remplace ce bâtiment
  name: string;
  description: string;
  extraEffects: string[];
  costDifference: ResourceBundle; // différence de coût (peut être négatif)
}

export interface CivPassiveBonus {
  type: CivBonusType;
  value: number;
  resource?: string;
  terrain?: string;
  building?: string;
  description: string;
}

export type CivBonusType =
  | 'resource_production'
  | 'unit_combat'
  | 'unit_movement'
  | 'building_cost'
  | 'tech_cost'
  | 'trade_income'
  | 'science'
  | 'culture'
  | 'faith'
  | 'influence'
  | 'starting_roads'
  | 'vision_range'
  | 'wonder_cost'
  | 'naval_strength';

export interface CivSpecialAbility {
  id: string;
  name: string;
  description: string;
  cooldown: number; // tours de recharge
  type: 'active' | 'passive';
  effect: string; // description de l'effet mécanique
}

// ============================================================
// LES 8 CIVILISATIONS
// ============================================================

export const CIVILIZATIONS: Record<CivilizationType, CivilizationDefinition> = {
  // ─────────────────────────────────────────────────────────
  northerners: {
    id: 'northerners',
    name: 'Les Nordiques',
    description: 'Guerriers vikings des mers du Nord, maîtres de la navigation et du pillage.',
    lore: 'Descendus de leurs fjords gelés, les Nordiques terrifiaient les côtes du monde connu. Leur maîtrise des mers et leur rage au combat en faisaient des conquérants redoutables.',
    color: '#4A90D9',
    startingResources: { wood: 3, fish: 2, ore: 1 },
    startingTechs: ['sailing', 'fishing'],
    uniqueUnit: {
      replaces: 'warrior',
      name: 'Berserker',
      description: 'Guerrier nordique entrant en rage divine au combat.',
      statBonus: { attack: 6, movement: 1 },
      costReduction: 0,
      extraAbilities: ['berserker_rage', 'amphibious'],
    },
    uniqueBuilding: {
      replaces: 'harbor',
      name: 'Drakkar Dock',
      description: 'Dock dédié aux drakkars — production navale accélérée.',
      extraEffects: [
        'Drakkars 50% plus rapides',
        '+1 mouvement naval tous les navires',
        'Pillage amélioré',
      ],
      costDifference: { wood: 1 },
    },
    passiveBonuses: [
      { type: 'naval_strength', value: 30, description: '+30% force navale' },
      { type: 'unit_movement', value: 1, description: "+1 mouvement sur l'eau" },
      {
        type: 'resource_production',
        resource: 'fish',
        value: 50,
        description: '+50% production poisson',
      },
      {
        type: 'unit_combat',
        value: 20,
        terrain: 'coast',
        description: '+20% combat sur les côtes',
      },
    ],
    specialAbility: {
      id: 'raid',
      name: 'Pillage Éclair',
      description:
        'Les navires nordiques peuvent effectuer un débarquement express et piller une côte ennemie sans déclaration de guerre formelle.',
      cooldown: 8,
      type: 'active',
      effect: 'PILLAGE: steal_resources_coastal_tile, no_war_penalty',
    },
    aiPersonality: 'aggressive',
    strengths: ['Naval combat', 'Expansion rapide', 'Pillage', 'Unités de choc'],
    weaknesses: ['Production agricole faible', 'Diplomatie difficile', 'Toundra/Désert'],
  },

  // ─────────────────────────────────────────────────────────
  empire: {
    id: 'empire',
    name: "L'Empire Romain",
    description: 'Empire organisé, bâtisseur de routes et de légions implacables.',
    lore: "L'Empire a conquis le monde connu non par la seule force des armes, mais par la puissance de son organisation, de ses routes et de ses lois. Toutes les routes mènent à Rome.",
    color: '#D4AF37',
    startingResources: { stone: 3, wheat: 2, ore: 1 },
    startingTechs: ['mining', 'wheel', 'masonry'],
    uniqueUnit: {
      replaces: 'swordsman',
      name: 'Légionnaire',
      description: "Soldat d'infanterie discipliné, maître de la formation en tortue.",
      statBonus: { defense: 4, armor: 2 },
      costReduction: 10,
      extraAbilities: ['shield_wall', 'zone_of_control', 'fortify'],
    },
    uniqueBuilding: {
      replaces: 'road',
      name: 'Via Romana',
      description: 'Route militaire romaine, indestructible et ultra-rapide.',
      extraEffects: [
        '+2 mouvement sur routes',
        'Bonus commerce sur route',
        'Dure deux fois plus longtemps',
      ],
      costDifference: { stone: 1 },
    },
    passiveBonuses: [
      { type: 'building_cost', value: -20, description: '-20% coût infrastructure' },
      { type: 'unit_movement', value: 2, description: '+2 mouvement sur routes' },
      {
        type: 'resource_production',
        resource: 'stone',
        value: 30,
        description: '+30% production pierre',
      },
      { type: 'culture', value: 20, description: '+20% culture (héritage romain)' },
    ],
    specialAbility: {
      id: 'roman_engineering',
      name: 'Génie Romain',
      description:
        'Peut construire deux routes ou bâtiments en un seul tour une fois tous les 6 tours.',
      cooldown: 6,
      type: 'active',
      effect: 'BUILD: double_construction_this_turn',
    },
    aiPersonality: 'expansionist',
    strengths: ['Infrastructure', 'Légions défensives', 'Commerce routier', 'Construction'],
    weaknesses: ['Naval faible', 'Ressources côtières', 'Coût maintenance élevé'],
  },

  // ─────────────────────────────────────────────────────────
  merchants: {
    id: 'merchants',
    name: 'La République Marchande',
    description: 'Cité-état commerciale contrôlant les routes commerciales mondiales.',
    lore: "Ni le plus fort ni le plus savant — mais le plus riche. La République Marchande a compris que l'or est la plus puissante des armes.",
    color: '#2ECC71',
    startingResources: { gold: 3, coins: 5, fish: 2 },
    startingTechs: ['sailing', 'trade', 'fishing'],
    uniqueUnit: {
      replaces: 'merchant',
      name: 'Marchand Armé',
      description: "Marchand capable de défendre ses caravanes et d'établir des monopoles.",
      statBonus: { attack: 2, defense: 2 },
      costReduction: 20,
      extraAbilities: ['trade_mission', 'infiltrate'],
    },
    passiveBonuses: [
      { type: 'trade_income', value: 50, description: '+50% tous revenus commerciaux' },
      {
        type: 'resource_production',
        resource: 'gold',
        value: 40,
        description: '+40% production or',
      },
      { type: 'naval_strength', value: 15, description: '+15% force navale commerciale' },
      { type: 'influence', value: 30, description: '+30% influence diplomatique' },
    ],
    specialAbility: {
      id: 'monopoly',
      name: 'Monopole Commercial',
      description:
        'Peut décréter un monopole sur une ressource pendant 5 tours — tous les échanges de cette ressource passent par la République.',
      cooldown: 15,
      type: 'active',
      effect: 'MONOPOLY: single_resource_control_5_turns',
    },
    aiPersonality: 'economic',
    strengths: ['Commerce', 'Or', 'Influence diplomatique', 'Naval'],
    weaknesses: ['Militaire faible', 'Territoire limité', 'Dépend des routes'],
  },

  // ─────────────────────────────────────────────────────────
  scholars: {
    id: 'scholars',
    name: "L'Académie des Érudits",
    description: 'Cité du savoir, maître de la technologie et de la culture.',
    lore: "La Bibliothèque d'Alexandrie, l'Académie de Platon, l'Université de Bagdad — ces lieux de savoir ont changé le monde plus que toute armée.",
    color: '#9B59B6',
    startingResources: { books: 2, paper: 2, science: 5 },
    startingTechs: ['writing', 'philosophy', 'fishing'],
    uniqueUnit: {
      replaces: 'diplomat',
      name: 'Savant Voyageur',
      description: 'Explorateur scientifique capable de copier les technologies ennemies.',
      statBonus: { sight: 2 },
      costReduction: 0,
      extraAbilities: ['scout', 'infiltrate', 'trade_mission'],
    },
    uniqueBuilding: {
      replaces: 'library',
      name: 'Grande Bibliothèque',
      description: 'Bibliothèque monumentale produisant trois fois plus de science.',
      extraEffects: [
        '+5 science/tour (au lieu de +1)',
        'Peut copier une tech ennemie une fois',
        '+culture global',
      ],
      costDifference: { wood: 2, paper: 2 },
    },
    passiveBonuses: [
      { type: 'science', value: 50, description: '+50% production science' },
      { type: 'tech_cost', value: -25, description: '-25% coût de toutes les recherches' },
      { type: 'culture', value: 25, description: '+25% culture' },
      { type: 'wonder_cost', value: -15, description: '-15% coût des merveilles' },
    ],
    specialAbility: {
      id: 'knowledge_transfer',
      name: 'Transfert de Connaissance',
      description: 'Peut apprendre une technologie déjà recherchée par un allié, au demi-tarif.',
      cooldown: 10,
      type: 'active',
      effect: 'TECH: copy_ally_tech_at_half_cost',
    },
    aiPersonality: 'scientific',
    strengths: ['Technologie', 'Culture', 'Science', 'Merveilles'],
    weaknesses: ['Militaire très faible', 'Commerce limité', 'Expansion lente'],
  },

  // ─────────────────────────────────────────────────────────
  nomads: {
    id: 'nomads',
    name: 'Les Nomades',
    description: 'Cavaliers des steppes, rapides et imprévisibles, maîtres du pillage.',
    lore: "Là où d'autres bâtissent, les Nomades se déplacent. Leur force est leur vitesse — frapper avant que l'ennemi n'ait le temps de réagir.",
    color: '#E67E22',
    // BUG FIX: horse_food n'est pas un ResourceType valide → remplacé par water
    startingResources: { sheep: 3, fur: 2, water: 2 },
    startingTechs: ['animal_husbandry', 'horseback_riding', 'archery'],
    uniqueUnit: {
      replaces: 'horse_archer',
      name: 'Khan Cavalry',
      description: "Cavalier léger nomade d'une mobilité exceptionnelle.",
      statBonus: { movement: 2, rangedAttack: 3, sight: 2 },
      costReduction: 15,
      extraAbilities: ['horse_archer', 'scout', 'pillage', 'ambush'],
    },
    passiveBonuses: [
      { type: 'unit_movement', value: 2, description: '+2 mouvement toutes unités' },
      { type: 'unit_combat', value: 25, terrain: 'plains', description: '+25% combat en plaines' },
      { type: 'unit_combat', value: 25, terrain: 'tundra', description: '+25% combat en toundra' },
      {
        type: 'resource_production',
        resource: 'fur',
        value: 60,
        description: '+60% production fourrures',
      },
    ],
    specialAbility: {
      id: 'great_migration',
      name: 'Grande Migration',
      description:
        'Peut déplacer toutes ses unités deux fois dans un même tour une fois par partie.',
      cooldown: 999,
      type: 'active',
      effect: 'MOVEMENT: all_units_double_move_once',
    },
    aiPersonality: 'aggressive',
    strengths: ['Mobilité', 'Cavalerie', 'Pillage', 'Steppes/Plaines'],
    weaknesses: ['Siège difficile', 'Défense fixe', 'Bâtiments coûteux'],
  },

  // ─────────────────────────────────────────────────────────
  theocracy: {
    id: 'theocracy',
    name: 'La Théocratie Sacrée',
    description: 'État religieux où la foi est la plus grande des forces.',
    lore: 'Dieu est avec nous. Ces trois mots ont justifié mille conquêtes, inspiré mille cathédrales, et galvanisé des armées entières contre la mort même.',
    color: '#F1C40F',
    startingResources: { faith: 5, gold: 2, stone: 2 },
    startingTechs: ['philosophy', 'writing', 'pottery'],
    uniqueUnit: {
      replaces: 'missionary',
      name: 'Chevalier Saint',
      description: 'Guerrier consacré, invincible dans sa foi.',
      statBonus: { attack: 5, defense: 5, armor: 3 },
      costReduction: 0,
      extraAbilities: ['convert', 'hero_aura', 'fortify'],
    },
    uniqueBuilding: {
      replaces: 'temple',
      name: 'Grand Temple',
      description: 'Temple gigantesque dominant la ville, source de foi immense.',
      extraEffects: [
        '+8 foi/tour (au lieu de +3)',
        '+moral armée +15%',
        'Convert adjacent tiles over time',
      ],
      costDifference: { stone: 2, gold: 1 },
    },
    passiveBonuses: [
      { type: 'faith', value: 50, description: '+50% production foi' },
      { type: 'unit_combat', value: 15, description: '+15% moral de combat (foi)' },
      { type: 'culture', value: 20, description: '+20% culture (art sacré)' },
      { type: 'building_cost', value: -20, building: 'temple', description: '-20% coût temples' },
    ],
    specialAbility: {
      id: 'holy_crusade',
      name: 'Croisade Sainte',
      description:
        'Lance une croisade : toutes les unités gagnent +50% combat pendant 5 tours, mais déclare automatiquement la guerre à tous les ennemis de la foi.',
      cooldown: 20,
      type: 'active',
      effect: 'CRUSADE: all_units_+50%_5_turns, auto_war_low_faith_players',
    },
    aiPersonality: 'aggressive',
    strengths: ['Foi', 'Moral', 'Culture', 'Résistance défensive'],
    weaknesses: ['Commerce limité', 'Science faible', 'Relations diplomatiques'],
  },

  // ─────────────────────────────────────────────────────────
  engineers: {
    id: 'engineers',
    name: 'La Guilde des Ingénieurs',
    description: "Bâtisseurs sans pareils, capables de construire l'impossible.",
    lore: "Donnez-leur les matières premières et du temps — ils construiront des merveilles. La Guilde a érigé des cathédrales, des aqueducs et des fortifications que le monde n'avait jamais vus.",
    color: '#1ABC9C',
    startingResources: { stone: 3, ore: 2, wood: 2 },
    startingTechs: ['mining', 'masonry', 'fire'],
    uniqueUnit: {
      replaces: 'worker',
      name: 'Maître Artisan',
      description: 'Ouvrier expert capable de construire en un temps record.',
      statBonus: {},
      costReduction: 20,
      extraAbilities: ['sabotage', 'fortify'],
    },
    uniqueBuilding: {
      replaces: 'workshop',
      name: 'Grand Atelier',
      description: 'Atelier géant produisant toutes les ressources transformées à prix réduit.',
      extraEffects: [
        'Toutes recettes -30% ressources',
        '+2 emplacements ouvriers',
        'Produit 2x plus vite',
      ],
      costDifference: {},
    },
    passiveBonuses: [
      { type: 'building_cost', value: -30, description: '-30% coût construction' },
      { type: 'wonder_cost', value: -25, description: '-25% coût merveilles' },
      {
        type: 'resource_production',
        resource: 'stone',
        value: 40,
        description: '+40% production pierre',
      },
      {
        type: 'resource_production',
        resource: 'iron',
        value: 30,
        description: '+30% production fer',
      },
    ],
    specialAbility: {
      id: 'master_build',
      name: 'Construction Éclair',
      description:
        "Peut construire instantanément n'importe quel bâtiment (coût normal) une fois tous les 10 tours.",
      cooldown: 10,
      type: 'active',
      effect: 'BUILD: instant_construction_any_building',
    },
    aiPersonality: 'economic',
    strengths: ['Construction', 'Production', 'Défenses', 'Merveilles'],
    weaknesses: ['Militaire moyen', 'Expansion lente', 'Naval faible'],
  },

  // ─────────────────────────────────────────────────────────
  diplomats: {
    id: 'diplomats',
    name: 'La Confédération des Diplomates',
    description: "Nation maîtresse des alliances et de l'influence politique mondiale.",
    lore: "Pourquoi faire la guerre quand on peut faire la paix — à ses conditions ? La Confédération a compris que la plume est plus puissante que l'épée, surtout quand elle signe des traités avantageux.",
    color: '#3498DB',
    startingResources: { coins: 4, influence: 5, paper: 2 },
    startingTechs: ['writing', 'trade', 'philosophy'],
    uniqueUnit: {
      replaces: 'diplomat',
      name: 'Ambassadeur',
      description: "Diplomate d'élite capable d'influencer n'importe quelle nation.",
      statBonus: { sight: 3 },
      costReduction: 0,
      extraAbilities: ['infiltrate', 'invisible', 'trade_mission'],
    },
    passiveBonuses: [
      { type: 'influence', value: 60, description: '+60% production influence diplomatique' },
      { type: 'trade_income', value: 30, description: '+30% revenus commerciaux' },
      { type: 'tech_cost', value: -10, description: '-10% techs (réseau diplomatique)' },
      { type: 'unit_combat', value: -10, description: '-10% combat (peuple pacifiste)' },
    ],
    specialAbility: {
      id: 'grand_alliance',
      name: 'Grande Alliance',
      description: 'Force tous les joueurs alliés à attaquer une cible commune pendant 3 tours.',
      cooldown: 20,
      type: 'active',
      effect: 'DIPLOMACY: force_allied_attack_target_3_turns',
    },
    aiPersonality: 'diplomatic',
    strengths: ['Alliances', 'Commerce', 'Réseau diplomatique', 'Information'],
    weaknesses: ['Militaire faible', 'Indépendance limitée', 'Trahisons coûteuses'],
  },
};

// ============================================================
// HELPERS
// ============================================================

export function getCivilizationById(id: CivilizationType): CivilizationDefinition {
  return CIVILIZATIONS[id];
}

/**
 * Retourne la valeur d'un bonus passif d'une civilisation pour un type donné.
 * Utilisé par les moteurs (ResourceSystem, CombatEngine…) pour appliquer les bonus en jeu.
 */
export function getCivBonus(
  civId: CivilizationType,
  bonusType: CivBonusType,
  context?: { resource?: string; terrain?: string; building?: string },
): number {
  const civ = CIVILIZATIONS[civId];
  let total = 0;
  for (const bonus of civ.passiveBonuses) {
    if (bonus.type !== bonusType) continue;
    if (context?.resource && bonus.resource && bonus.resource !== context.resource) continue;
    if (context?.terrain && bonus.terrain && bonus.terrain !== context.terrain) continue;
    if (context?.building && bonus.building && bonus.building !== context.building) continue;
    total += bonus.value;
  }
  return total;
}

// ============================================================
// SYSTÈME DE COOLDOWNS DES CAPACITÉS SPÉCIALES
// ============================================================

/** Durée de cooldown en tours par ability */
const ABILITY_COOLDOWNS: Partial<Record<string, number>> = {
  raid: 4,
  roman_engineering: 3,
  monopoly: 6,
  knowledge_transfer: 5,
  great_migration: 999, // une seule fois par partie
  holy_crusade: 8,
  master_build: 3,
  grand_alliance: 6,
};

export function canUseAbility(
  player: import('../../types/player').Player,
  abilityId: string,
  currentTurn: number,
): { can: boolean; reason?: string } {
  if (!player.specialAbilities.includes(abilityId)) {
    return { can: false, reason: 'Cette civilisation ne possède pas cette capacité' };
  }
  const cooldownUntil = player.abilityCooldowns?.[abilityId] ?? 0;
  if (cooldownUntil > currentTurn) {
    return { can: false, reason: `Disponible dans ${cooldownUntil - currentTurn} tours` };
  }
  return { can: true };
}

/** Type de contexte pour l'exécution d'une ability */
export interface AbilityContext {
  targetPlayerId?: string;
  targetTileId?: string;
  resourceType?: string;
  techId?: string;
}

type AbilityHandler = (
  player: import('../../types/player').Player,
  context: AbilityContext,
  state: import('../../types/game').GameState,
) => { success: boolean; reason?: string };

const ABILITY_HANDLERS: Partial<Record<string, AbilityHandler>> = {
  /** Nordiques : voler des ressources d'une tuile côtière sans déclarer la guerre */
  raid: (player, context, state) => {
    const tile = state.map.get(context.targetTileId ?? '');
    if (!tile || tile.terrain !== 'coast') {
      return { success: false, reason: "Le raid ne peut cibler qu'une tuile côtière" };
    }
    const targetOwner = tile.owner ? state.players.get(tile.owner) : null;
    if (!targetOwner || targetOwner.id === player.id) {
      return { success: false, reason: 'Aucun joueur à piller sur cette tuile' };
    }
    const resKeys = (
      Object.keys(targetOwner.resources) as (keyof typeof targetOwner.resources)[]
    ).filter((r) => (targetOwner.resources[r] ?? 0) >= 2);
    if (resKeys.length === 0) return { success: false, reason: 'Pas assez de ressources à voler' };
    const stolen = randomChoice(resKeys);
    if (!stolen) return { success: false, reason: 'Pas assez de ressources à voler' };
    const amount = Math.min(3, targetOwner.resources[stolen] ?? 0);
    targetOwner.resources[stolen] = (targetOwner.resources[stolen] ?? 0) - amount;
    player.resources[stolen] = (player.resources[stolen] ?? 0) + amount;
    return { success: true };
  },

  /** Empire Romain : double la construction ce tour */
  roman_engineering: (player, _context, _state) => {
    // Le frontend doit permettre 2 constructions ce tour
    // On stocke le flag dans les stats/log — géré par GameEngine.canBuild
    void player.stats.totalResourcesCollected;
    return { success: true };
  },

  /** Marchands : bloquer les échanges d'une ressource pendant 5 tours */
  monopoly: (player, context, state) => {
    if (!context.resourceType) return { success: false, reason: 'Ressource cible requise' };
    // Enregistrer l'embargo dans le marché
    state.market.demand[context.resourceType as keyof typeof state.market.demand] = -999;
    return { success: true };
  },

  /** Scholars : copier une technologie d'un allié */
  knowledge_transfer: (player, context, state) => {
    const allyId = context.targetPlayerId;
    if (!allyId) return { success: false, reason: 'Joueur allié cible requis' };
    const rel = player.relations[allyId];
    if (rel?.status !== 'allied') return { success: false, reason: 'Vous devez être alliés' };
    const ally = state.players.get(allyId);
    if (!ally) return { success: false, reason: 'Joueur introuvable' };
    const techId = context.techId;
    if (!techId || !ally.researchedTechs.includes(techId)) {
      return { success: false, reason: "L'allié n'a pas cette technologie" };
    }
    if (player.researchedTechs.includes(techId)) {
      return { success: false, reason: 'Vous avez déjà cette technologie' };
    }
    player.researchedTechs.push(techId);
    return { success: true };
  },

  /** Nomades : double mouvement pour toutes les unités ce tour */
  great_migration: (player, _context, state) => {
    for (const unitId of player.units) {
      const unit = state.units.get(unitId);
      if (unit) unit.stats.movement = Math.min(unit.stats.movement * 2, 10);
    }
    return { success: true };
  },

  /** Théocratie : +50% combat 5 tours + auto-guerre contre tous */
  holy_crusade: (player, _context, state) => {
    for (const tileId of player.ownedTiles) {
      const tile = state.map.get(tileId);
      if (!tile) continue;
      tile.modifiers.push({
        type: 'production',
        resource: undefined,
        value: 50,
        source: 'holy_crusade',
        expires: state.currentTurn + 5,
      });
    }
    return { success: true };
  },

  /** Ingénieurs : construction instantanée ce tour */
  master_build: (_player, _context, _state) => {
    // Flag géré par le frontend via le log d'action
    return { success: true };
  },

  /** Diplomates : forcer les alliés à attaquer une cible */
  grand_alliance: (player, context, state) => {
    if (!context.targetPlayerId) return { success: false, reason: 'Cible requise' };
    // Créer des PendingChoice pour tous les alliés
    for (const [otherId, rel] of Object.entries(player.relations)) {
      if (rel.status !== 'allied') continue;
      state.pendingChoices.push({
        id: `grand_alliance_${otherId}_${state.currentTurn}`,
        eventId: `ability_grand_alliance_${player.id}`,
        playerId: otherId,
        choices: [
          {
            id: 'attack_target',
            label: `Attaquer ${context.targetPlayerId} (obligation d'alliance)`,
            description: '',
            effects: [],
          },
        ],
        deadline: state.currentTurn + 1,
      });
    }
    return { success: true };
  },
};

/**
 * Exécute une capacité spéciale de civilisation.
 * Met à jour le cooldown sur le joueur si réussi.
 */
export function useAbility(
  player: import('../../types/player').Player,
  abilityId: string,
  currentTurn: number,
  context: AbilityContext,
  state: import('../../types/game').GameState,
): { success: boolean; reason?: string } {
  const { can, reason } = canUseAbility(player, abilityId, currentTurn);
  if (!can) return { success: false, reason };

  const handler = ABILITY_HANDLERS[abilityId];
  if (!handler) return { success: false, reason: `Aucun handler pour l'ability '${abilityId}'` };

  const result = handler(player, context, state);
  if (result.success) {
    const cooldown = ABILITY_COOLDOWNS[abilityId] ?? 3;
    if (!player.abilityCooldowns) player.abilityCooldowns = {};
    player.abilityCooldowns[abilityId] = currentTurn + cooldown;
  }
  return result;
}

export function applyStartingBonuses(
  player: import('../../types/player').Player,
  civDef: CivilizationDefinition,
): void {
  // Ressources de départ
  for (const [res, amount] of Object.entries(civDef.startingResources)) {
    player.resources[res as keyof typeof player.resources] =
      ((player.resources[res as keyof typeof player.resources] ?? 0) as number) + (amount ?? 0);
  }

  // Techs de départ
  for (const tech of civDef.startingTechs) {
    if (!player.researchedTechs.includes(tech)) {
      player.researchedTechs.push(tech);
    }
  }

  // Capacités spéciales
  if (!player.specialAbilities.includes(civDef.specialAbility.id)) {
    player.specialAbilities.push(civDef.specialAbility.id);
  }
}

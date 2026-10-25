// ============================================================
// ÉVÉNEMENTS — Naturels, politiques, mystiques, catastrophes
// ============================================================

import { ResourceBundle } from './resources';
import { CubeCoord } from './hex';

export type EventCategory =
  | 'natural_disaster' // catastrophes naturelles
  | 'weather' // météo saisonnière
  | 'political' // événements politiques
  | 'economic' // crises et booms économiques
  | 'military' // événements de guerre
  | 'religious' // événements religieux
  | 'discovery' // découvertes et explorations
  | 'plague' // épidémies et maladies
  | 'mythical' // événements légendaires/fantastiques
  | 'quest' // quêtes et missions
  | 'seasonal'; // changements saisonniers

export type EventSeverity = 'minor' | 'moderate' | 'major' | 'catastrophic';

export type EventScope = 'local' | 'regional' | 'global';

export interface GameEvent {
  id: string;
  type: EventType;
  category: EventCategory;
  severity: EventSeverity;
  scope: EventScope;
  name: string;
  description: string;
  flavorText: string;
  triggeredTurn: number;
  duration: number; // tours, 0 = instantané
  targetTiles?: string[]; // tuiles affectées
  targetPlayers?: string[]; // joueurs affectés
  effects: EventEffect[];
  choices?: EventChoice[]; // le joueur peut choisir une réponse
  followUp?: string; // ID d'événement de suivi
  followUpType?: EventType; // type d'événement déclenchable en chaîne
  followUpProbability?: number; // probabilité de la chaîne (0-1)
  followUpDelayTurns?: number; // délai avant déclenchement
  probability: number; // 0-1, probabilité de déclenchement
  conditions: EventCondition[];
  icon: string; // nom de l'icône pour Codex
}

export type EventType =
  // Catastrophes naturelles
  | 'volcano_eruption' // éruption volcanique
  | 'earthquake' // tremblement de terre
  | 'flood' // inondation
  | 'drought' // sécheresse
  | 'blizzard' // blizzard
  | 'forest_fire' // feu de forêt
  | 'tsunami' // tsunami (côtier)
  | 'landslide' // glissement de terrain
  | 'meteor_impact' // impact météorite (rare, catastrophique)
  // Météo & Saisons
  | 'harsh_winter' // hiver rigoureux (-production)
  | 'good_harvest' // bonne récolte (+blé)
  | 'heavy_rains' // pluies abondantes (+eau, -routes)
  | 'golden_summer' // été doré (+toutes prod)
  | 'storm' // tempête (dommages maritimes)
  // Politique
  | 'rebellion' // rébellion dans une ville
  | 'revolution' // révolution (change gouvernement)
  | 'succession_crisis' // crise de succession (affaiblit joueur)
  | 'trade_embargo' // embargo commercial
  | 'diplomatic_incident' // incident diplomatique
  | 'spy_caught' // espion capturé
  | 'betrayal' // trahison d'un allié
  | 'coronation' // couronnement (+prestige)
  | 'council_vote' // vote du conseil mondial
  | 'migration' // migration de population
  // Économie
  | 'gold_rush' // ruée vers l'or (afflux sur une zone)
  | 'market_crash' // krach boursier (-prix)
  | 'trade_boom' // boom commercial (+prix)
  | 'resource_depletion' // épuisement ressource sur tuile
  | 'new_deposit' // découverte nouveau gisement
  | 'piracy' // pirates sur routes maritimes
  | 'bandit_raid' // raids de bandits
  // Militaire
  | 'mercenary_offer' // mercenaires disponibles
  | 'arms_race' // course aux armements
  | 'war_weariness' // lassitude de guerre (-moral)
  | 'desertion' // désertions (perd unités)
  | 'ambush' // embuscade
  | 'siege_lifted' // siège levé (événement positif)
  // Religieux
  | 'miracle' // miracle (+foi massivement)
  | 'heresy' // hérésie (perte foi)
  | 'crusade' // croisade (units bonus foi)
  | 'pilgrimage' // pèlerinage (+culture, +foi)
  | 'inquisition' // inquisition (perd joueurs non-religieux)
  | 'prophecy' // prophétie (avertissement futur event)
  // Découvertes
  | 'ancient_ruins_found' // ruines découvertes (+tech)
  | 'new_route' // nouvelle route commerciale
  | 'cartographic_find' // carte ancienne (révèle zone)
  | 'scientific_breakthrough' // percée scientifique (+science)
  | 'legendary_artifact' // artefact légendaire (bonus unique)
  // Maladies
  | 'plague_minor' // épidémie légère (-population)
  | 'plague_major' // grande épidémie (-unités)
  | 'black_death' // peste noire (catastrophique)
  | 'famine' // famine (-production)
  // Mythiques
  | 'dragon_attack' // attaque de dragon (rare, catastrophique)
  | 'sea_monster' // monstre marin (bloque routes maritimes)
  | 'oracle_vision' // vision de l'oracle (prophétie)
  | 'ancient_curse' // malédiction ancienne
  | 'divine_blessing' // bénédiction divine
  // Quêtes
  | 'quest_exploration' // explorer une zone mystérieuse
  | 'quest_rescue' // secourir une ville assiégée
  | 'quest_craft' // fabriquer un artefact légendaire
  | 'quest_diplomacy' // résoudre un conflit
  | 'quest_defeat_enemy'; // vaincre un ennemi spécifique

export interface EventEffect {
  type: EventEffectType;
  target: 'all_players' | 'triggered_player' | 'specific_player' | 'affected_tiles';
  resource?: string;
  amount?: number;
  percentage?: number;
  duration?: number; // tours
  tileModifier?: {
    type: string;
    value: number;
  };
  description: string;
}

export type EventEffectType =
  | 'resource_gain'
  | 'resource_loss'
  | 'production_modifier'
  | 'tile_destruction'
  | 'tile_transform'
  | 'unit_damage'
  | 'unit_spawn'
  | 'building_damage'
  | 'relation_change'
  | 'science_bonus'
  | 'culture_bonus'
  | 'faith_bonus'
  | 'victory_points'
  | 'tech_unlock'
  | 'reveal_tiles'
  | 'spawn_resource'
  | 'movement_penalty'
  | 'special';

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  cost?: ResourceBundle;
  effects: EventEffect[];
  requiredTech?: string;
  requiredBuilding?: string;
  moralityTag?: 'good' | 'neutral' | 'evil';
}

export interface EventCondition {
  type:
    | 'turn_range'
    | 'player_age'
    | 'tech_required'
    | 'tile_type'
    | 'resource_threshold'
    | 'war_active'
    | 'season'
    | 'random_chance'
    | 'player_count'
    | 'building_present';
  value: string | number | boolean;
  operator?: '>' | '<' | '=' | '>=' | '<=';
}

// Saisons — affectent la production globalement
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonEffect {
  season: Season;
  productionModifiers: Partial<Record<string, number>>; // resource -> %
  movementModifier: number;
  specialEvents: EventType[];
  description: string;
}

export const SEASON_EFFECTS: SeasonEffect[] = [
  {
    season: 'spring',
    productionModifiers: { wheat: 1.2, herbs: 1.3, wood: 1.0, sheep: 1.1 },
    movementModifier: 1.0,
    specialEvents: ['good_harvest', 'heavy_rains', 'pilgrimage'],
    description: 'Printemps : renouveau, production agricole en hausse',
  },
  {
    season: 'summer',
    productionModifiers: { wheat: 1.5, gold: 1.1, fish: 1.2, ore: 1.0 },
    movementModifier: 1.1,
    specialEvents: ['drought', 'forest_fire', 'golden_summer', 'gold_rush'],
    description: 'Été : chaleur, grande récolte, risque de sécheresse',
  },
  {
    season: 'autumn',
    productionModifiers: { wheat: 1.3, wood: 1.2, sheep: 1.2, coal: 1.1 },
    movementModifier: 0.9,
    specialEvents: ['bandit_raid', 'trade_boom', 'migration'],
    description: "Automne : récolte finale, préparation à l'hiver",
  },
  {
    season: 'winter',
    productionModifiers: { wheat: 0.5, fish: 0.7, coal: 1.3, fur: 1.5 },
    movementModifier: 0.7,
    specialEvents: ['harsh_winter', 'blizzard', 'famine', 'war_weariness'],
    description: 'Hiver : pénuries, ralentissement, vulnérabilité',
  },
];

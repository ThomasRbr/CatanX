import { EventScope, EventSeverity, Season } from '@catanx/engine';
import { MapSize, TurnPhase, VictoryCondition } from '@catanx/engine';
import { TerrainType } from '@catanx/engine';
import { DiplomaticStatus } from '@catanx/engine';
import { ResourceType } from '@catanx/engine';

const TERRAIN_LABELS: Record<TerrainType, string> = {
  plains: 'Plaines',
  forest: 'Forêt',
  mountain: 'Montagne',
  hill: 'Colline',
  pasture: 'Pâturage',
  desert: 'Désert',
  coast: 'Côte',
  ocean: 'Océan',
  river: 'Rivière',
  swamp: 'Marécage',
  volcano: 'Volcan',
  tundra: 'Toundra',
  jungle: 'Jungle',
  goldmine: "Mine d'or",
  sacred: 'Terre sacrée',
  ruins: 'Ruines',
  glacier: 'Glacier',
  lake: 'Lac',
};

const RESOURCE_LABELS: Record<ResourceType, string> = {
  wood: 'Bois',
  clay: 'Argile',
  wheat: 'Blé',
  sheep: 'Laine',
  ore: 'Minerai',
  stone: 'Pierre',
  coal: 'Charbon',
  gold: 'Or',
  fish: 'Poisson',
  spice: 'Épices',
  water: 'Eau',
  herbs: 'Herbes',
  fur: 'Fourrures',
  gems: 'Gemmes',
  obsidian: 'Obsidienne',
  amber: 'Ambre',
  lumber: 'Bois scié',
  brick: 'Brique',
  flour: 'Farine',
  bread: 'Pain',
  cloth: 'Tissu',
  iron: 'Fer',
  steel: 'Acier',
  glass: 'Verre',
  tools: 'Outils',
  weapons: 'Armes',
  armor: 'Armures',
  paper: 'Papier',
  books: 'Livres',
  coins: 'Pièces',
  gems_cut: 'Gemmes taillées',
  medicine: 'Médecine',
  gunpowder: 'Poudre',
  cannon_ball: 'Boulets',
  ship_material: 'Matériaux navals',
  faith: 'Foi',
  science: 'Science',
  culture: 'Culture',
  influence: 'Influence',
};

const SEASON_LABELS: Record<Season, string> = {
  spring: 'Printemps',
  summer: 'Été',
  autumn: 'Automne',
  winter: 'Hiver',
};

const TURN_PHASE_LABELS: Record<TurnPhase, string> = {
  start_of_turn: 'Début de tour',
  dice_roll: 'Lancer de dés',
  resource_collect: 'Collecte des ressources',
  discard_resources: 'Défausse sur 7',
  move_robber: 'Déplacement du brigand',
  steal_resource: 'Vol de ressource',
  event_resolution: 'Résolution des événements',
  player_action: 'Actions du joueur',
  combat: 'Combats',
  diplomacy: 'Diplomatie',
  production: 'Production',
  end_of_turn: 'Fin de tour',
  season_change: 'Changement de saison',
};

const MAP_SIZE_LABELS: Record<MapSize, string> = {
  tiny: 'Très petite',
  small: 'Petite',
  medium: 'Moyenne',
  large: 'Grande',
  huge: 'Très grande',
  epic: 'Épique',
};

const VICTORY_CONDITION_LABELS: Record<VictoryCondition, string> = {
  points: 'Points de victoire',
  domination: 'Domination',
  science: 'Suprématie scientifique',
  culture: 'Rayonnement culturel',
  religious: 'Victoire religieuse',
  economic: 'Hégémonie économique',
  diplomatic: 'Victoire diplomatique',
  elimination: 'Élimination totale',
};

const DIPLO_STATUS_LABELS: Record<DiplomaticStatus, string> = {
  war: 'Guerre',
  hostile: 'Hostile',
  neutral: 'Neutre',
  friendly: 'Amicale',
  allied: 'Alliance',
  vassal: 'Vassal',
  overlord: 'Suzerain',
};

const EVENT_SEVERITY_LABELS: Record<EventSeverity, string> = {
  minor: 'Mineure',
  moderate: 'Modérée',
  major: 'Majeure',
  catastrophic: 'Catastrophique',
};

const EVENT_SCOPE_LABELS: Record<EventScope, string> = {
  local: 'Locale',
  regional: 'Régionale',
  global: 'Globale',
};

const AGE_LABELS: Record<string, string> = {
  stone_age: 'Âge de pierre',
  bronze_age: 'Âge du bronze',
  iron_age: 'Âge du fer',
  medieval: 'Médiéval',
  renaissance: 'Renaissance',
};

const CIVILIZATION_LABELS: Record<string, string> = {
  empire: 'Empire',
  northerners: 'Nordiques',
  merchants: 'Marchands',
  scholars: 'Érudits',
  nomads: 'Nomades',
  theocracy: 'Théocratie',
  engineers: 'Ingénieurs',
  diplomats: 'Diplomates',
};

const UNIT_LABELS: Record<string, string> = {
  warrior: 'Guerrier',
  archer: 'Archer',
  spearman: 'Lancier',
  swordsman: 'Épéiste',
  horseman: 'Cavalier',
  catapult: 'Catapulte',
  knight: 'Chevalier',
  crossbowman: 'Arbalétrier',
  pikeman: 'Piquier',
  musketman: 'Mousquetaire',
  cannon: 'Canon',
  dragoon: 'Dragon',
  explorer: 'Éclaireur',
  settler: 'Colon',
  worker: 'Ouvrier',
  scout: 'Éclaireur',
};

const BUILDING_LABELS: Record<string, string> = {
  settlement: 'Village',
  road: 'Route',
  farm: 'Ferme',
  mine: 'Mine',
  market: 'Marché',
  library: 'Bibliothèque',
  barracks: 'Caserne',
  city: 'Ville',
  metropolis: 'Métropole',
  temple: 'Temple',
  wall: 'Muraille',
  harbor: 'Port',
  workshop: 'Atelier',
};

function prettifyIdentifier(identifier: string): string {
  const base = identifier
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  if (!base) return '—';
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}`;
}

export function frTerrain(terrain: TerrainType | string): string {
  return TERRAIN_LABELS[terrain as TerrainType] ?? prettifyIdentifier(terrain);
}

export function frResource(resource: ResourceType | string): string {
  return RESOURCE_LABELS[resource as ResourceType] ?? prettifyIdentifier(resource);
}

const CK_COMMODITY_LABELS: Record<string, string> = {
  ck_paper: 'Papier',
  ck_cloth: 'Tissu',
  ck_coin: 'Monnaie',
};

/** Marchandises Villes & Chevaliers (distinctes de l’industrie). */
export function frCommodity(commodity: string): string {
  return CK_COMMODITY_LABELS[commodity] ?? prettifyIdentifier(commodity);
}

export function frSeason(season: Season | string): string {
  return SEASON_LABELS[season as Season] ?? prettifyIdentifier(season);
}

export function frTurnPhase(phase: TurnPhase | string): string {
  return TURN_PHASE_LABELS[phase as TurnPhase] ?? prettifyIdentifier(phase);
}

export function frMapSize(size: MapSize | string): string {
  return MAP_SIZE_LABELS[size as MapSize] ?? prettifyIdentifier(size);
}

export function frVictoryCondition(condition: VictoryCondition | string): string {
  return VICTORY_CONDITION_LABELS[condition as VictoryCondition] ?? prettifyIdentifier(condition);
}

export function frDiplomaticStatus(status: DiplomaticStatus | string): string {
  return DIPLO_STATUS_LABELS[status as DiplomaticStatus] ?? prettifyIdentifier(status);
}

export function frSeverity(severity: EventSeverity | string): string {
  return EVENT_SEVERITY_LABELS[severity as EventSeverity] ?? prettifyIdentifier(severity);
}

export function frScope(scope: EventScope | string): string {
  return EVENT_SCOPE_LABELS[scope as EventScope] ?? prettifyIdentifier(scope);
}

export function frAge(age: string): string {
  return AGE_LABELS[age] ?? prettifyIdentifier(age);
}

export function frUnit(unitType: string): string {
  return UNIT_LABELS[unitType] ?? prettifyIdentifier(unitType);
}

export function frBuilding(buildingId: string): string {
  return BUILDING_LABELS[buildingId] ?? prettifyIdentifier(buildingId);
}

export function frCivilization(civ: string): string {
  return CIVILIZATION_LABELS[civ] ?? prettifyIdentifier(civ);
}

export function frGenericLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return prettifyIdentifier(value);
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  'No active game': 'Aucune partie active',
  'Player not found': 'Joueur introuvable',
  'Cannot research this technology': 'Cette technologie ne peut pas être recherchée',
  'No pending event choice': "Aucun choix d'événement en attente",
  'Event no longer available': 'Événement non disponible',
  'Choice not found': 'Choix introuvable',
  'Insufficient resources for this choice': 'Ressources insuffisantes pour ce choix',
  'Diplomacy action failed': "L'action diplomatique a échoué",
  'No game to save': 'Aucune partie à sauvegarder',
  'Local storage unavailable': 'Stockage local indisponible',
  'Failed to save game': 'Échec de la sauvegarde',
  'Save not found': 'Sauvegarde introuvable',
  'Failed to load save': 'Échec du chargement de la sauvegarde',
};

export function frErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return ERROR_TRANSLATIONS[message] ?? message;
}

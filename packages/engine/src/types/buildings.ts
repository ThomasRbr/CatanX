// ============================================================
// BÂTIMENTS — 35+ types, niveaux, conditions
// ============================================================

import { ResourceBundle } from './resources';
import { TerrainType } from './hex';

export type BuildingCategory =
  | 'settlement' // établissements (villages, villes...)
  | 'infrastructure' // routes, ponts, aqueducs
  | 'military' // défenses, casernes
  | 'economic' // production, commerce
  | 'scientific' // recherche, culture
  | 'religious' // foi, temples
  | 'wonder'; // merveilles uniques

export type BuildingId =
  // Établissements
  | 'outpost' // avant-poste (+portée vision, 1er bâtiment)
  | 'settlement' // village (1VP, production de base)
  | 'city' // ville (2VP, double production)
  | 'metropolis' // métropole (3VP, triple production, +défense)
  | 'capital' // capitale (5VP, unique par joueur)
  // Infrastructure
  | 'road' // route (connexion de base)
  | 'bridge' // pont (franchit rivière)
  | 'aqueduct' // aqueduc (+eau à distance)
  | 'canal' // canal (navigation intérieure)
  | 'harbor' // port commercial (échange 2:1)
  | 'lighthouse' // phare (+portée maritime)
  | 'wall' // muraille (défense +2)
  | 'fortress' // forteresse (défense +5, attaque -2)
  | 'watchtower' // tour de guet (+vision, +tir à distance)
  | 'gate' // porte fortifiée (contrôle passage)
  // Production - Forêt/Bois
  | 'sawmill' // scierie (bois → bois scié)
  | 'lumber_camp' // camp de bûcherons (+production bois)
  // Production - Mines
  | 'mine' // mine (améliore production minerai/charbon)
  | 'deep_mine' // mine profonde (accès ressources rares)
  | 'forge' // forge (minerai → fer)
  | 'advanced_forge' // forge avancée (fer+charbon → acier)
  | 'armory' // armurerie (armes, armures)
  // Production - Agriculture
  | 'farm' // ferme (+production blé)
  | 'windmill' // moulin à vent (blé → farine)
  | 'bakery' // boulangerie (farine → pain)
  | 'granary' // grenier (+stockage nourriture)
  | 'irrigation' // irrigation (+fertilité du sol)
  // Production - Textile
  | 'loom' // métier à tisser (laine → tissu)
  | 'weaving_house' // atelier textile (tissu amélioré)
  // Commerce
  | 'market' // marché (+1 res/production commerciale)
  | 'bazaar' // bazar (+commerce, prix réduits)
  | 'bank' // banque (stocke coins, intérêts)
  | 'mint' // monnaie (or → pièces)
  | 'trade_post' // comptoir commercial (commerce inter-joueurs)
  | 'guild' // guilde (bonus spécialisation)
  // Science & Culture
  | 'library' // bibliothèque (+1 science/tour)
  | 'university' // université (+3 science/tour, -coût techs)
  | 'observatory' // observatoire (+5 science/tour)
  | 'academy' // académie (+science, forme savants)
  | 'scriptorium' // scriptorium (papier → livres)
  | 'paper_mill' // moulin à papier (bois → papier)
  | 'theater' // théâtre (+2 culture/tour)
  | 'monument' // monument (+culture, VP)
  | 'colosseum' // colisée (+culture, moral armée)
  // Militaire
  | 'barracks' // caserne (entraîne soldats)
  | 'stable' // écurie (entraîne cavaliers)
  | 'siege_workshop' // atelier siège (catapultes, trébuchets)
  | 'shipyard' // chantier naval (bateaux)
  | 'alchemist' // alchimiste (poudre à canon)
  // Religion
  | 'shrine' // sanctuaire (+1 foi/tour)
  | 'temple' // temple (+3 foi/tour, moral)
  | 'cathedral' // cathédrale (+5 foi/tour, VP)
  | 'monastery' // monastère (foi + science)
  | 'oracle_chamber' // chambre oracle (event preview)
  // Divers
  | 'kiln' // four (argile → brique)
  | 'apothecary' // apothicaire (herbes → médecine)
  | 'workshop' // atelier (outils, artisanat)
  | 'warehouse' // entrepôt (+stockage général)
  | 'diplomat_quarter' // quartier diplomatique (+influence)
  // Merveilles (uniques, une seule par monde possible)
  | 'wonder_pyramid' // Pyramides : +5VP, +10 foi, bonus construction
  | 'wonder_colossus' // Colosse : +5VP, +commerce maritime
  | 'wonder_library_alex' // Bibliothèque d'Alexandrie : +5VP, +science
  | 'wonder_great_wall' // Grande Muraille : +5VP, +défense territoire
  | 'wonder_colosseum' // Colisée : +5VP, +culture, +moral
  | 'wonder_oracle' // Oracle de Delphes : +5VP, cards spéciales
  | 'wonder_lighthouse_alex' // Phare : +5VP, +navigation
  | 'wonder_hanging_gardens'; // Jardins suspendus : +5VP, +fertilité

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  description: string;
  category: BuildingCategory;
  tier: 1 | 2 | 3 | 4; // niveau de sophistication
  cost: ResourceBundle;
  maintenanceCost: ResourceBundle; // coût par tour
  requiredTech?: string;
  requiredBuilding?: BuildingId; // prérequis bâtiment
  allowedTerrain: TerrainType[]; // terrains compatibles
  maxPerPlayer?: number; // limite par joueur (undefined = illimité)
  maxPerWorld?: number; // limite mondiale (pour merveilles)
  buildTime: number; // tours de construction
  effects: BuildingEffect[];
  upgradeTo?: BuildingId; // peut être amélioré en...
  upgradeFrom?: BuildingId; // amélioré depuis...
  victoryPoints: number;
  workerSlots: number; // emplois créés
  defenseBonus: number; // bonus défense sur la tuile
  visionRange?: number; // portée de vision additionnelle
}

export interface BuildingEffect {
  type: BuildingEffectType;
  resource?: string;
  amount?: number;
  radius?: number; // rayon d'effet (hexagones)
  condition?: string; // condition d'activation
  description: string;
}

export type BuildingEffectType =
  | 'produce_resource' // produit une ressource par tour
  | 'boost_terrain_production' // multiplie production d'un terrain
  | 'reduce_tech_cost' // réduit le coût de recherche
  | 'trade_bonus' // bonus commercial
  | 'defense_radius' // défense sur une zone
  | 'vision_radius' // vision étendue
  | 'unit_training_speed' // entraîne les unités plus vite
  | 'unit_combat_bonus' // bonus combat aux unités proches
  | 'culture_per_turn' // génère de la culture
  | 'faith_per_turn' // génère de la foi
  | 'science_per_turn' // génère de la science
  | 'influence_per_turn' // génère de l'influence
  | 'resource_storage' // augmente le stockage
  | 'happiness' // bonheur des citoyens
  | 'population_growth' // croissance démographique
  | 'unlock_recipe' // débloque une recette de production
  | 'special'; // effet spécial décrit en condition

export interface BuildingInstance {
  id: string;
  definitionId: BuildingId;
  tileId: string;
  ownerId: string;
  placementKind?: 'tile' | 'intersection';
  placementIntersectionId?: string;
  /** Tuiles adjacentes produisant des ressources (placement Catan sur sommet). */
  productionTileIds?: string[];
  constructedTurn: number;
  level: number; // 1-3 pour certains bâtiments
  health: number; // 0-100
  workers: string[]; // IDs des unités assignées
  isActive: boolean; // désactivé si en ruines ou manque ressources
  productionProgress: number; // avancement production en cours
  activeRecipeId?: string;
}

// ============================================================
// ARBRE TECHNOLOGIQUE — 5 Âges, 60+ technologies
// ============================================================

import { ResourceBundle } from './resources';
import { AgeType } from './player';

export type TechId =
  // ===== ÂGE DE PIERRE =====
  | 'pottery' // Poterie : +stockage argile
  | 'animal_husbandry' // Élevage : laine x1.5
  | 'mining' // Mine : débloque mine basique
  | 'sailing' // Navigation : galères, ports
  | 'fishing' // Pêche : +production côte
  | 'agriculture' // Agriculture : débloque ferme
  | 'writing' // Écriture : débloque bibliothèque
  | 'archery' // Archerie : débloque archer
  | 'wheel' // Roue : routes x2 vitesse
  | 'fire' // Maîtrise du feu : débloque four, forge basique
  // ===== ÂGE DE BRONZE =====
  | 'bronze_working' // Travail du bronze : épéiste, armures légères
  | 'calendar' // Calendrier : prévision récoltes +10%
  | 'masonry' // Maçonnerie : pierre transformée, murs
  | 'optics' // Optique : +portée vision, phares
  | 'mathematics' // Mathématiques : catapulte, réduction coûts
  | 'trade' // Commerce : marchés, routes commerciales
  | 'currency' // Monnaie : banques, pièces
  | 'construction' // Construction : colisée, aqueduc
  | 'philosophy' // Philosophie : bibliothèque avancée, foi
  | 'drama_poetry' // Drame & Poésie : théâtre, culture
  | 'horseback_riding' // Équitation : cavalerie, écuries
  | 'iron_working' // Travail du fer : forge, fer, armes
  // ===== ÂGE DE FER =====
  | 'engineering' // Ingénierie : ponts, canaux
  | 'theology' // Théologie : cathédrale, foi avancée
  | 'education' // Éducation : université, science x2
  | 'feudalism' // Féodalisme : chevaliers, fortifications
  | 'guilds' // Guildes : bonus artisanat, marchés élites
  | 'apprenticeship' // Apprentissage : ateliers améliorés
  | 'military_tactics' // Tactiques : formations, moral armée
  | 'metal_casting' // Fonte : canons légers, outils avancés
  | 'civil_service' // Administration : bonus gouvernement
  | 'banking' // Banque avancée : intérêts, crédit
  | 'chivalry' // Chevalerie : chevaliers lourds, moral
  | 'machinery' // Machines : moulins améliorés
  | 'compass' // Boussole : navigation hauturière
  | 'paper' // Papier : débloque scriptorium
  | 'stirrups' // Étriers : cavalerie lourde améliorée
  | 'physics' // Physique : trébuchet, projectiles
  // ===== MOYEN ÂGE =====
  | 'gunpowder' // Poudre à canon : guns, canons
  | 'metallurgy' // Métallurgie : acier, armures lourdes
  | 'printing_press' // Imprimerie : culture x2, propaganda
  | 'cartography' // Cartographie : exploration bonus
  | 'economics' // Économie : bourse, marchés globaux
  | 'astronomy' // Astronomie : observatoire, navigation
  | 'acoustics' // Acoustique : musique, moral
  | 'architecture' // Architecture avancée : merveilles x0.8 coût
  | 'civil_engineering' // Génie civil : routes améliorées
  | 'alchemy' // Alchimie : alchimiste, préparations
  | 'herbalism' // Herboristerie : médecine, apothicaire
  | 'siege_engineering' // Génie militaire : siège amélioré
  | 'navigation' // Navigation avancée : caraques, galions
  | 'diplomatic_theory' // Théorie diplomatique : traités bonus
  | 'logistics' // Logistique : ravitaillement armées
  | 'espionage' // Espionnage : unité espion
  // ===== RENAISSANCE =====
  | 'chemistry' // Chimie : poudre avancée, explosifs
  | 'scientific_method' // Méthode scientifique : science x3
  | 'industrialization' // Industrialisation : production x2
  | 'banking_modern' // Banque moderne : crédit illimité
  | 'military_science' // Science militaire : armée pro
  | 'steam_power' // Vapeur : industrie lourde
  | 'ballistics' // Balistique : canons longue portée
  | 'rifling' // Rayure : mousquetaires d'élite
  | 'printing_modern' // Imprimerie avancée : propagande
  | 'rationalism' // Rationalisme : science x4
  | 'enlightenment' // Lumières : culture x3, liberté
  | 'mercantilism' // Mercantilisme : commerce monopole
  | 'colonialism' // Colonialisme : expansion marine
  | 'humanism' // Humanisme : culture + foi équilibre
  | 'grand_strategy'; // Grande stratégie : bonus global guerre

export interface TechDefinition {
  id: TechId;
  name: string;
  description: string;
  age: AgeType;
  era: number; // position dans l'arbre (0 = premier de l'age)
  cost: number; // points de science requis
  prerequisites: TechId[]; // techs requises
  unlocks: TechUnlock[]; // ce que ça débloque
  bonuses: TechBonus[]; // bonus passifs
  obsoletes?: TechId[]; // techs remplacées
  quote: string; // citation historique
}

export interface TechUnlock {
  type: 'building' | 'unit' | 'recipe' | 'ability' | 'age_advancement';
  id: string;
  description: string;
}

export interface TechBonus {
  type: TechBonusType;
  resource?: string;
  terrain?: string;
  buildingId?: string;
  value: number; // pourcentage ou valeur absolue
  description: string;
}

export type TechBonusType =
  | 'resource_production' // +X% production ressource
  | 'resource_storage' // +X stockage
  | 'unit_combat' // +X% combat unités
  | 'unit_movement' // +X déplacement
  | 'building_cost' // -X% coût construction
  | 'tech_cost' // -X% coût recherche
  | 'trade_income' // +X% revenus commerce
  | 'science_per_turn' // +X science/tour
  | 'culture_per_turn' // +X culture/tour
  | 'faith_per_turn' // +X foi/tour
  | 'terrain_production' // +X% production terrain
  | 'construction_speed' // -X tours construction
  | 'diplomatic_bonus' // +X toutes relations
  | 'vision_range' // +X portée vision
  | 'wonder_cost'; // -X% coût merveilles

export interface ResearchState {
  currentTech: TechId | null;
  progress: number; // points science accumulés
  queue: TechId[]; // file d'attente de recherche
  completedTechs: Set<TechId>;
  age: AgeType;
  ageProgress: number; // % vers prochain âge
}

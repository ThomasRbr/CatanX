// ============================================================
// TechTree — Arbre de technologie complet
// 5 Âges, 60+ technologies, prérequis, bonus, déblocages
// ============================================================

import { TechId, TechDefinition, ResearchState } from '../../types/technology';
import { AgeType } from '../../types/player';
import { Player } from '../../types/player';

// ============================================================
// DÉFINITIONS COMPLÈTES DES TECHNOLOGIES
// ============================================================

export const TECH_DEFINITIONS: Record<TechId, TechDefinition> = {
  // ================================================================
  // ÂGE DE PIERRE
  // ================================================================

  pottery: {
    id: 'pottery',
    name: 'Poterie',
    age: 'stone_age',
    era: 0,
    cost: 20,
    prerequisites: [],
    description: 'Fabrication de récipients en argile pour stocker nourriture et eau.',
    quote: '"La poterie est le premier art de l\'humanité."',
    unlocks: [{ type: 'building', id: 'granary', description: 'Débloque le grenier' }],
    bonuses: [{ type: 'resource_storage', value: 5, description: '+5 stockage toutes ressources' }],
  },

  animal_husbandry: {
    id: 'animal_husbandry',
    name: 'Élevage',
    age: 'stone_age',
    era: 0,
    cost: 20,
    prerequisites: [],
    description: 'Domestication des animaux pour production de laine, lait et viande.',
    quote: '"L\'homme et l\'animal — une alliance millénaire."',
    unlocks: [
      { type: 'building', id: 'farm', description: 'Débloque la ferme basique' },
      { type: 'unit', id: 'worker', description: "Débloque l'ouvrier" },
    ],
    bonuses: [
      {
        type: 'terrain_production',
        terrain: 'pasture',
        value: 50,
        description: '+50% production pâturage',
      },
    ],
  },

  mining: {
    id: 'mining',
    name: 'Extraction minière',
    age: 'stone_age',
    era: 0,
    cost: 25,
    prerequisites: [],
    description: "Techniques d'extraction des ressources souterraines.",
    quote: '"Les richesses du monde sont enfouies sous nos pieds."',
    unlocks: [
      { type: 'building', id: 'mine', description: 'Débloque la mine' },
      { type: 'building', id: 'forge', description: 'Débloque la forge basique' },
    ],
    bonuses: [
      {
        type: 'terrain_production',
        terrain: 'mountain',
        value: 30,
        description: '+30% production montagne',
      },
      {
        type: 'terrain_production',
        terrain: 'hill',
        value: 20,
        description: '+20% production collines',
      },
    ],
  },

  sailing: {
    id: 'sailing',
    name: 'Navigation',
    age: 'stone_age',
    era: 1,
    cost: 25,
    prerequisites: [],
    description: 'Construction de bateaux primitifs pour explorer les eaux côtières.',
    quote: '"La mer est un chemin vers l\'inconnu."',
    unlocks: [
      { type: 'unit', id: 'galley', description: 'Débloque la galère' },
      { type: 'building', id: 'harbor', description: 'Débloque le port' },
    ],
    bonuses: [
      {
        type: 'terrain_production',
        terrain: 'coast',
        value: 40,
        description: '+40% production côte',
      },
    ],
  },

  fishing: {
    id: 'fishing',
    name: 'Pêche',
    age: 'stone_age',
    era: 0,
    cost: 15,
    prerequisites: [],
    description: 'Techniques avancées de pêche en mer et en rivière.',
    quote: '"Donne-lui un poisson, il mangera un jour. Apprends-lui à pêcher..."',
    unlocks: [],
    bonuses: [
      {
        type: 'resource_production',
        resource: 'fish',
        value: 100,
        description: 'Double la production de poisson',
      },
      {
        type: 'terrain_production',
        terrain: 'lake',
        value: 50,
        description: '+50% production lac',
      },
    ],
  },

  agriculture: {
    id: 'agriculture',
    name: 'Agriculture',
    age: 'stone_age',
    era: 1,
    cost: 30,
    prerequisites: ['animal_husbandry'],
    description: 'Culture organisée des terres et rotation des cultures.',
    quote: '"Qui contrôle la nourriture contrôle le peuple."',
    unlocks: [
      { type: 'building', id: 'windmill', description: 'Débloque le moulin à vent' },
      { type: 'building', id: 'irrigation', description: "Débloque l'irrigation" },
    ],
    bonuses: [
      {
        type: 'terrain_production',
        terrain: 'plains',
        value: 50,
        description: '+50% production plaines',
      },
      {
        type: 'terrain_production',
        terrain: 'river',
        value: 30,
        description: '+30% production rivière',
      },
    ],
  },

  writing: {
    id: 'writing',
    name: 'Écriture',
    age: 'stone_age',
    era: 2,
    cost: 35,
    prerequisites: ['pottery'],
    description: "Système d'écriture permettant de conserver et transmettre le savoir.",
    quote: '"Les mots écrits persistent quand la mémoire s\'efface."',
    unlocks: [
      { type: 'building', id: 'library', description: 'Débloque la bibliothèque' },
      { type: 'recipe', id: 'paper_mill', description: 'Débloque la fabrication de papier' },
    ],
    bonuses: [{ type: 'science_per_turn', value: 2, description: '+2 science/tour' }],
  },

  archery: {
    id: 'archery',
    name: 'Archerie',
    age: 'stone_age',
    era: 1,
    cost: 25,
    prerequisites: [],
    description: "Fabrication d'arcs et flèches pour la chasse et la guerre.",
    quote: '"La flèche atteint son but avant que l\'ennemi ne comprenne."',
    unlocks: [{ type: 'unit', id: 'archer', description: "Débloque l'archer" }],
    bonuses: [{ type: 'unit_combat', value: 10, description: '+10% attaque unités à distance' }],
  },

  wheel: {
    id: 'wheel',
    name: 'La Roue',
    age: 'stone_age',
    era: 1,
    cost: 30,
    prerequisites: ['animal_husbandry'],
    description: 'Invention de la roue révolutionnant transport et commerce.',
    quote: '"La roue tourne, le monde change."',
    unlocks: [{ type: 'building', id: 'road', description: 'Améliore les routes (vitesse x2)' }],
    bonuses: [
      { type: 'unit_movement', value: 1, description: '+1 mouvement toutes unités terrestres' },
      { type: 'building_cost', value: 15, description: '-15% coût des routes' },
    ],
  },

  fire: {
    id: 'fire',
    name: 'Maîtrise du Feu',
    age: 'stone_age',
    era: 0,
    cost: 15,
    prerequisites: [],
    description: 'Utilisation contrôlée du feu pour la cuisine, la forge et le chauffage.',
    quote: '"Le feu est à la fois le plus grand serviteur et le plus terrible maître."',
    unlocks: [
      { type: 'building', id: 'kiln', description: 'Débloque le four/kiln' },
      { type: 'recipe', id: 'brick_kiln', description: 'Débloque la fabrication de briques' },
    ],
    bonuses: [
      {
        type: 'terrain_production',
        terrain: 'forest',
        value: 10,
        description: '+10% production forêt (charbon)',
      },
    ],
  },

  // ================================================================
  // ÂGE DE BRONZE
  // ================================================================

  bronze_working: {
    id: 'bronze_working',
    name: 'Travail du Bronze',
    age: 'bronze_age',
    era: 0,
    cost: 60,
    prerequisites: ['mining', 'fire'],
    description: "Alliage du cuivre et de l'étain pour créer des outils et armes supérieures.",
    quote: '"Le bronze est la première véritable métallurgie de guerre."',
    unlocks: [
      { type: 'unit', id: 'spearman', description: 'Débloque le lancier' },
      { type: 'unit', id: 'warrior', description: 'Améliore le guerrier' },
    ],
    bonuses: [{ type: 'unit_combat', value: 15, description: '+15% combat infanterie' }],
  },

  calendar: {
    id: 'calendar',
    name: 'Calendrier',
    age: 'bronze_age',
    era: 0,
    cost: 50,
    prerequisites: ['writing', 'agriculture'],
    description: 'Prédiction des saisons pour optimiser les récoltes.',
    quote: '"Connaître le temps, c\'est maîtriser la nature."',
    unlocks: [],
    bonuses: [
      {
        type: 'terrain_production',
        terrain: 'plains',
        value: 10,
        description: '+10% toutes récoltes',
      },
      { type: 'science_per_turn', value: 1, description: '+1 science/tour' },
    ],
  },

  masonry: {
    id: 'masonry',
    name: 'Maçonnerie',
    age: 'bronze_age',
    era: 1,
    cost: 55,
    prerequisites: ['mining'],
    description: 'Construction en pierre taillée pour des structures durables.',
    quote: '"Seule la pierre défie les siècles."',
    unlocks: [
      { type: 'building', id: 'wall', description: 'Débloque les murailles' },
      { type: 'building', id: 'watchtower', description: 'Débloque la tour de guet' },
    ],
    bonuses: [{ type: 'building_cost', value: 10, description: '-10% coût bâtiments en pierre' }],
  },

  optics: {
    id: 'optics',
    name: 'Optique',
    age: 'bronze_age',
    era: 2,
    cost: 55,
    prerequisites: ['sailing'],
    description: 'Lentilles et miroirs pour observation et navigation.',
    quote: '"Voir loin, c\'est prévoir."',
    unlocks: [{ type: 'building', id: 'lighthouse', description: 'Débloque le phare' }],
    bonuses: [{ type: 'vision_range', value: 1, description: '+1 portée de vision' }],
  },

  mathematics: {
    id: 'mathematics',
    name: 'Mathématiques',
    age: 'bronze_age',
    era: 2,
    cost: 60,
    prerequisites: ['writing'],
    description: "Calculs avancés pour l'ingénierie et la tactique militaire.",
    quote: '"Les mathématiques sont la langue dans laquelle l\'univers est écrit."',
    unlocks: [{ type: 'unit', id: 'catapult', description: 'Débloque la catapulte' }],
    bonuses: [
      { type: 'building_cost', value: 15, description: '-15% coût bâtiments militaires' },
      { type: 'science_per_turn', value: 2, description: '+2 science/tour' },
    ],
  },

  trade: {
    id: 'trade',
    name: 'Commerce',
    age: 'bronze_age',
    era: 1,
    cost: 50,
    prerequisites: ['wheel'],
    description: 'Organisation du commerce et des routes marchandes.',
    quote: '"L\'or circule là où la confiance règne."',
    unlocks: [
      { type: 'building', id: 'market', description: 'Débloque le marché' },
      { type: 'building', id: 'trade_post', description: 'Débloque le comptoir commercial' },
    ],
    bonuses: [{ type: 'trade_income', value: 25, description: '+25% revenus commerciaux' }],
  },

  currency: {
    id: 'currency',
    name: 'Monnaie',
    age: 'bronze_age',
    era: 2,
    cost: 65,
    prerequisites: ['trade', 'mining'],
    description: 'Frappe de monnaie standardisant les échanges.',
    quote: '"La monnaie est la mémoire de la valeur."',
    unlocks: [
      { type: 'building', id: 'mint', description: 'Débloque la monnaie' },
      { type: 'recipe', id: 'minting', description: 'Débloque la frappe' },
    ],
    bonuses: [{ type: 'trade_income', value: 20, description: '+20% revenus commerciaux' }],
  },

  construction: {
    id: 'construction',
    name: 'Construction',
    age: 'bronze_age',
    era: 2,
    cost: 70,
    prerequisites: ['masonry', 'mathematics'],
    description: 'Techniques avancées de construction de grandes structures.',
    quote: '"Les grandes œuvres transcendent les générations."',
    unlocks: [
      { type: 'building', id: 'colosseum', description: 'Débloque le Colisée' },
      { type: 'building', id: 'aqueduct', description: "Débloque l'aqueduc" },
    ],
    bonuses: [{ type: 'wonder_cost', value: 10, description: '-10% coût merveilles' }],
  },

  philosophy: {
    id: 'philosophy',
    name: 'Philosophie',
    age: 'bronze_age',
    era: 2,
    cost: 65,
    prerequisites: ['writing'],
    description: "Réflexion sur l'existence, la morale et la société.",
    quote: '"Je pense, donc je suis."',
    unlocks: [{ type: 'building', id: 'temple', description: 'Débloque le temple' }],
    bonuses: [
      { type: 'culture_per_turn', value: 2, description: '+2 culture/tour' },
      { type: 'faith_per_turn', value: 1, description: '+1 foi/tour' },
    ],
  },

  drama_poetry: {
    id: 'drama_poetry',
    name: 'Drame & Poésie',
    age: 'bronze_age',
    era: 3,
    cost: 60,
    prerequisites: ['philosophy'],
    description: 'Arts du spectacle et expression artistique.',
    quote: '"Le théâtre est le miroir de l\'âme du peuple."',
    unlocks: [{ type: 'building', id: 'theater', description: 'Débloque le théâtre' }],
    bonuses: [{ type: 'culture_per_turn', value: 3, description: '+3 culture/tour' }],
  },

  horseback_riding: {
    id: 'horseback_riding',
    name: 'Équitation',
    age: 'bronze_age',
    era: 1,
    cost: 55,
    prerequisites: ['animal_husbandry'],
    description: 'Domestication et dressage du cheval pour le combat.',
    quote: '"Sur son cheval, l\'homme devient invincible."',
    unlocks: [
      { type: 'unit', id: 'cavalry', description: 'Débloque la cavalerie' },
      { type: 'building', id: 'stable', description: "Débloque l'écurie" },
    ],
    bonuses: [{ type: 'unit_movement', value: 1, description: '+1 mouvement cavalerie' }],
  },

  iron_working: {
    id: 'iron_working',
    name: 'Travail du Fer',
    age: 'bronze_age',
    era: 3,
    cost: 80,
    prerequisites: ['bronze_working', 'mining'],
    description: 'Maîtrise de la fonte du fer pour des outils et armes supérieures.',
    quote: '"Le fer a changé la guerre pour toujours."',
    unlocks: [
      { type: 'unit', id: 'swordsman', description: "Débloque l'épéiste" },
      { type: 'building', id: 'forge', description: 'Améliore la forge' },
      { type: 'recipe', id: 'smelting_iron', description: 'Débloque la fonte du fer' },
      { type: 'recipe', id: 'weapons_craft', description: "Débloque la forge d'armes" },
    ],
    bonuses: [{ type: 'unit_combat', value: 20, description: '+20% force de combat' }],
  },

  // ================================================================
  // ÂGE DE FER
  // ================================================================

  engineering: {
    id: 'engineering',
    name: 'Ingénierie',
    age: 'iron_age',
    era: 0,
    cost: 100,
    prerequisites: ['construction', 'mathematics'],
    description: 'Conception de structures complexes : ponts, canaux, machines.',
    quote: '"L\'ingénieur construit ce que la nature n\'aurait jamais imaginé."',
    unlocks: [
      { type: 'building', id: 'bridge', description: 'Débloque le pont' },
      { type: 'building', id: 'canal', description: 'Débloque le canal' },
    ],
    bonuses: [{ type: 'building_cost', value: 20, description: '-20% coût infrastructure' }],
  },

  theology: {
    id: 'theology',
    name: 'Théologie',
    age: 'iron_age',
    era: 0,
    cost: 90,
    prerequisites: ['philosophy', 'writing'],
    description: 'Doctrine religieuse organisée et institutions ecclésiastiques.',
    quote: '"La foi déplace les montagnes."',
    unlocks: [
      { type: 'building', id: 'monastery', description: 'Débloque le monastère' },
      { type: 'unit', id: 'missionary', description: 'Débloque le missionnaire' },
    ],
    bonuses: [{ type: 'faith_per_turn', value: 3, description: '+3 foi/tour' }],
  },

  education: {
    id: 'education',
    name: 'Éducation',
    age: 'iron_age',
    era: 1,
    cost: 110,
    prerequisites: ['writing', 'philosophy'],
    description: "Institutionnalisation de l'enseignement et transmission du savoir.",
    quote: '"L\'éducation est l\'arme la plus puissante pour changer le monde."',
    unlocks: [{ type: 'building', id: 'university', description: "Débloque l'université" }],
    bonuses: [
      { type: 'science_per_turn', value: 5, description: '+5 science/tour' },
      { type: 'tech_cost', value: 15, description: '-15% coût technologiques' },
    ],
  },

  feudalism: {
    id: 'feudalism',
    name: 'Féodalisme',
    age: 'iron_age',
    era: 1,
    cost: 100,
    prerequisites: ['iron_working', 'horseback_riding'],
    description: 'Organisation sociale fondée sur la hiérarchie et la terre.',
    quote: '"La loyauté est le ciment de la société féodale."',
    unlocks: [
      { type: 'unit', id: 'knight', description: 'Débloque le chevalier' },
      { type: 'building', id: 'fortress', description: 'Débloque la forteresse' },
    ],
    bonuses: [{ type: 'unit_combat', value: 15, description: '+15% force cavalerie lourde' }],
  },

  guilds: {
    id: 'guilds',
    name: 'Guildes',
    age: 'iron_age',
    era: 2,
    cost: 105,
    prerequisites: ['trade', 'iron_working'],
    description: 'Associations de marchands et artisans contrôlant leur métier.',
    quote: '"La guilde protège l\'artisan, l\'artisan fait la richesse de la guilde."',
    unlocks: [
      { type: 'building', id: 'guild', description: 'Débloque la guilde' },
      { type: 'building', id: 'bazaar', description: 'Débloque le bazar' },
    ],
    bonuses: [{ type: 'trade_income', value: 30, description: '+30% revenus artisanaux' }],
  },

  apprenticeship: {
    id: 'apprenticeship',
    name: 'Apprentissage',
    age: 'iron_age',
    era: 1,
    cost: 95,
    prerequisites: ['guilds'],
    description: 'Transmission des savoirs artisanaux par apprentissage.',
    quote: '"Chaque maître fut d\'abord apprenti."',
    unlocks: [{ type: 'building', id: 'workshop', description: "Améliore l'atelier" }],
    bonuses: [
      { type: 'building_cost', value: 15, description: '-15% coût bâtiments économiques' },
      {
        type: 'resource_production',
        resource: 'tools',
        value: 50,
        description: '+50% production outils',
      },
    ],
  },

  military_tactics: {
    id: 'military_tactics',
    name: 'Tactiques Militaires',
    age: 'iron_age',
    era: 2,
    cost: 110,
    prerequisites: ['iron_working', 'mathematics'],
    description: 'Art de la guerre : formations, stratégies, commandement.',
    quote: '"La victoire appartient à celui qui se prépare."',
    unlocks: [],
    bonuses: [
      { type: 'unit_combat', value: 25, description: '+25% efficacité toutes unités' },
      { type: 'unit_movement', value: 1, description: '+1 mouvement armées' },
    ],
  },

  metal_casting: {
    id: 'metal_casting',
    name: 'Fonte des Métaux',
    age: 'iron_age',
    era: 1,
    cost: 100,
    prerequisites: ['iron_working'],
    description: 'Moulage des métaux en fusion pour formes complexes.',
    quote: '"La fonte transforme le métal brut en chef-d\'œuvre."',
    unlocks: [
      { type: 'building', id: 'advanced_forge', description: 'Débloque la forge avancée' },
      { type: 'recipe', id: 'smelting_steel', description: "Débloque la fonte de l'acier" },
    ],
    bonuses: [],
  },

  civil_service: {
    id: 'civil_service',
    name: 'Administration Civile',
    age: 'iron_age',
    era: 2,
    cost: 105,
    prerequisites: ['writing', 'feudalism'],
    description: 'Bureaucratie organisée pour gérer un grand empire.',
    quote: '"L\'empire qui ne s\'administre pas, se désintègre."',
    unlocks: [],
    bonuses: [
      { type: 'trade_income', value: 10, description: '+10% revenus fiscaux' },
      { type: 'culture_per_turn', value: 2, description: '+2 culture/tour' },
    ],
  },

  banking: {
    id: 'banking',
    name: 'Banque',
    age: 'iron_age',
    era: 3,
    cost: 115,
    prerequisites: ['currency', 'guilds'],
    description: 'Institutions financières, prêts et crédit.',
    quote: '"La banque est le nerf de la guerre et de la paix."',
    unlocks: [{ type: 'building', id: 'bank', description: 'Débloque la banque' }],
    bonuses: [{ type: 'trade_income', value: 25, description: '+25% revenus commerciaux' }],
  },

  chivalry: {
    id: 'chivalry',
    name: 'Chevalerie',
    age: 'iron_age',
    era: 3,
    cost: 115,
    prerequisites: ['feudalism', 'theology'],
    description: "Code d'honneur et de guerre des chevaliers.",
    quote: '"Honneur, courage, loyauté — les piliers du chevalier."',
    unlocks: [{ type: 'unit', id: 'heavy_cavalry', description: 'Débloque la cavalerie lourde' }],
    bonuses: [{ type: 'unit_combat', value: 20, description: '+20% moral de combat' }],
  },

  machinery: {
    id: 'machinery',
    name: 'Machines',
    age: 'iron_age',
    era: 2,
    cost: 100,
    prerequisites: ['engineering', 'metal_casting'],
    description: 'Mécanismes complexes pour automatiser le travail.',
    quote: '"La machine est l\'esclave idéal."',
    unlocks: [],
    bonuses: [
      {
        type: 'resource_production',
        resource: 'lumber',
        value: 50,
        description: '+50% production bois scié',
      },
      {
        type: 'resource_production',
        resource: 'iron',
        value: 30,
        description: '+30% production fer',
      },
    ],
  },

  compass: {
    id: 'compass',
    name: 'Boussole',
    age: 'iron_age',
    era: 2,
    cost: 95,
    prerequisites: ['sailing', 'optics'],
    description: 'Instrument permettant la navigation en haute mer.',
    quote: '"L\'aiguille pointe toujours vers le nord — et vers l\'avenir."',
    unlocks: [],
    bonuses: [
      { type: 'unit_movement', value: 2, description: '+2 mouvement naval' },
      { type: 'vision_range', value: 1, description: '+1 portée vision navale' },
    ],
  },

  paper: {
    id: 'paper',
    name: 'Papier',
    age: 'iron_age',
    era: 1,
    cost: 90,
    prerequisites: ['writing'],
    description: "Fabrication du papier comme support d'écriture économique.",
    quote: '"Le papier tient ce que la mémoire oublie."',
    unlocks: [
      { type: 'building', id: 'paper_mill', description: 'Débloque le moulin à papier' },
      { type: 'recipe', id: 'paper_mill', description: 'Débloque la recette papier' },
    ],
    bonuses: [{ type: 'science_per_turn', value: 2, description: '+2 science/tour' }],
  },

  stirrups: {
    id: 'stirrups',
    name: 'Étriers',
    age: 'iron_age',
    era: 1,
    cost: 85,
    prerequisites: ['horseback_riding'],
    description: 'Étriers permettant à la cavalerie de combattre plus efficacement.',
    quote: '"L\'étrier a changé la cavalerie à jamais."',
    unlocks: [{ type: 'unit', id: 'horse_archer', description: "Débloque l'archer monté" }],
    bonuses: [{ type: 'unit_combat', value: 15, description: '+15% force cavalerie' }],
  },

  physics: {
    id: 'physics',
    name: 'Physique',
    age: 'iron_age',
    era: 3,
    cost: 120,
    prerequisites: ['mathematics', 'machinery'],
    description: 'Lois fondamentales du mouvement et de la matière.',
    quote: '"Donnez-moi un levier, je soulèverai le monde."',
    unlocks: [{ type: 'unit', id: 'trebuchet', description: 'Débloque le trébuchet' }],
    bonuses: [{ type: 'unit_combat', value: 20, description: '+20% portée armes de siège' }],
  },

  // ================================================================
  // MOYEN ÂGE
  // ================================================================

  gunpowder: {
    id: 'gunpowder',
    name: 'Poudre à Canon',
    age: 'medieval',
    era: 0,
    cost: 150,
    prerequisites: ['physics', 'mining'],
    description: 'Mélange explosif révolutionnant la guerre.',
    quote: '"La poudre a mis fin à l\'ère des châteaux forts."',
    unlocks: [
      { type: 'unit', id: 'gunner', description: 'Débloque le mousquetaire' },
      { type: 'unit', id: 'cannon', description: 'Débloque le canon' },
      { type: 'recipe', id: 'gunpowder_mix', description: 'Débloque la fabrication de poudre' },
      { type: 'building', id: 'alchemist', description: "Débloque l'alchimiste" },
    ],
    bonuses: [{ type: 'unit_combat', value: 30, description: '+30% force infanterie à feu' }],
  },

  metallurgy: {
    id: 'metallurgy',
    name: 'Métallurgie',
    age: 'medieval',
    era: 0,
    cost: 140,
    prerequisites: ['metal_casting', 'iron_working'],
    description: 'Science des métaux et alliages avancés.',
    quote: '"L\'acier est la colonne vertébrale de la civilisation."',
    unlocks: [
      { type: 'recipe', id: 'smelting_steel', description: "Améliore la production d'acier" },
      { type: 'recipe', id: 'armor_craft', description: 'Débloque les armures lourdes' },
    ],
    bonuses: [
      {
        type: 'resource_production',
        resource: 'steel',
        value: 50,
        description: '+50% production acier',
      },
    ],
  },

  printing_press: {
    id: 'printing_press',
    name: 'Imprimerie',
    age: 'medieval',
    era: 1,
    cost: 145,
    prerequisites: ['paper', 'machinery'],
    description: 'Presse à imprimer révolutionnant la diffusion du savoir.',
    quote: '"L\'imprimerie est la mère de toutes les révolutions."',
    unlocks: [],
    bonuses: [
      { type: 'culture_per_turn', value: 5, description: '+5 culture/tour' },
      { type: 'science_per_turn', value: 3, description: '+3 science/tour' },
    ],
  },

  cartography: {
    id: 'cartography',
    name: 'Cartographie',
    age: 'medieval',
    era: 1,
    cost: 130,
    prerequisites: ['compass', 'optics'],
    description: 'Art de dresser des cartes précises du monde connu.',
    quote: '"La carte est plus puissante que l\'épée."',
    unlocks: [{ type: 'unit', id: 'explorer', description: "Débloque l'explorateur" }],
    bonuses: [{ type: 'vision_range', value: 2, description: '+2 portée de vision' }],
  },

  economics: {
    id: 'economics',
    name: 'Économie',
    age: 'medieval',
    era: 2,
    cost: 155,
    prerequisites: ['banking', 'trade'],
    description: 'Science de la production et de la distribution des richesses.',
    quote: '"L\'économie est la géographie des ressources."',
    unlocks: [],
    bonuses: [{ type: 'trade_income', value: 40, description: '+40% revenus commerciaux' }],
  },

  astronomy: {
    id: 'astronomy',
    name: 'Astronomie',
    age: 'medieval',
    era: 1,
    cost: 140,
    prerequisites: ['optics', 'mathematics'],
    description: 'Étude des astres pour la navigation et la compréhension du cosmos.',
    quote: '"Regarder les étoiles, c\'est comprendre sa place dans l\'univers."',
    unlocks: [{ type: 'building', id: 'observatory', description: "Débloque l'observatoire" }],
    bonuses: [
      { type: 'science_per_turn', value: 5, description: '+5 science/tour' },
      { type: 'unit_movement', value: 2, description: '+2 mouvement naval' },
    ],
  },

  acoustics: {
    id: 'acoustics',
    name: 'Acoustique',
    age: 'medieval',
    era: 0,
    cost: 125,
    prerequisites: ['drama_poetry'],
    description: 'Science du son et développement de la musique.',
    quote: '"La musique est la langue universelle de l\'humanité."',
    unlocks: [],
    bonuses: [
      { type: 'culture_per_turn', value: 3, description: '+3 culture/tour' },
      { type: 'unit_combat', value: 5, description: '+5% moral troupes (musique militaire)' },
    ],
  },

  architecture: {
    id: 'architecture',
    name: 'Architecture',
    age: 'medieval',
    era: 2,
    cost: 150,
    prerequisites: ['construction', 'engineering'],
    description: 'Art de concevoir de grands édifices harmonieux et durables.',
    quote: '"L\'architecture est le témoin incorruptible de l\'histoire."',
    unlocks: [{ type: 'building', id: 'monument', description: 'Débloque le monument' }],
    bonuses: [
      { type: 'wonder_cost', value: 20, description: '-20% coût merveilles' },
      { type: 'building_cost', value: 10, description: '-10% coût construction' },
    ],
  },

  civil_engineering: {
    id: 'civil_engineering',
    name: 'Génie Civil',
    age: 'medieval',
    era: 1,
    cost: 135,
    prerequisites: ['engineering'],
    description: 'Conception de grandes infrastructures publiques.',
    quote: '"Les routes de Rome ont unifié un empire."',
    unlocks: [],
    bonuses: [
      { type: 'unit_movement', value: 1, description: '+1 mouvement sur routes' },
      { type: 'building_cost', value: 20, description: '-20% coût routes et ponts' },
    ],
  },

  alchemy: {
    id: 'alchemy',
    name: 'Alchimie',
    age: 'medieval',
    era: 1,
    cost: 130,
    prerequisites: ['philosophy', 'mining'],
    description: "Transmutation des matériaux et recherche de l'élixir de vie.",
    quote: '"L\'alchimiste cherche l\'or — et trouve parfois la sagesse."',
    unlocks: [{ type: 'building', id: 'alchemist', description: "Améliore l'alchimiste" }],
    bonuses: [
      {
        type: 'resource_production',
        resource: 'medicine',
        value: 50,
        description: '+50% production médecine',
      },
    ],
  },

  herbalism: {
    id: 'herbalism',
    name: 'Herboristerie',
    age: 'medieval',
    era: 0,
    cost: 120,
    prerequisites: ['agriculture'],
    description: 'Connaissance des plantes médicinales et de leurs propriétés.',
    quote: '"La nature offre la guérison à qui sait regarder."',
    unlocks: [
      { type: 'building', id: 'apothecary', description: "Débloque l'apothicaire" },
      { type: 'recipe', id: 'medicine_brew', description: 'Débloque la préparation de médecine' },
    ],
    bonuses: [],
  },

  siege_engineering: {
    id: 'siege_engineering',
    name: 'Génie Militaire',
    age: 'medieval',
    era: 2,
    cost: 145,
    prerequisites: ['engineering', 'military_tactics'],
    description: 'Art de prendre et défendre les fortifications.',
    quote: '"Toute forteresse peut être prise — question de temps et de ressources."',
    unlocks: [
      { type: 'unit', id: 'battering_ram', description: 'Débloque le bélier' },
      { type: 'building', id: 'siege_workshop', description: "Débloque l'atelier de siège" },
    ],
    bonuses: [{ type: 'unit_combat', value: 30, description: '+30% unités de siège' }],
  },

  navigation: {
    id: 'navigation',
    name: 'Navigation Hauturière',
    age: 'medieval',
    era: 2,
    cost: 145,
    prerequisites: ['compass', 'cartography'],
    description: 'Techniques de navigation en haute mer, hors de vue des côtes.',
    quote: "\"L'horizon n'est pas une limite, c'est une invitation.\"",
    unlocks: [
      { type: 'unit', id: 'carrack', description: 'Débloque la caraque' },
      { type: 'building', id: 'shipyard', description: 'Débloque le chantier naval' },
      { type: 'recipe', id: 'ship_build', description: 'Débloque la construction navale' },
    ],
    bonuses: [{ type: 'unit_movement', value: 3, description: '+3 mouvement naval' }],
  },

  diplomatic_theory: {
    id: 'diplomatic_theory',
    name: 'Théorie Diplomatique',
    age: 'medieval',
    era: 1,
    cost: 130,
    prerequisites: ['writing', 'trade'],
    description: 'Art de la négociation et des relations entre nations.',
    quote: '"La diplomatie est l\'art de laisser l\'autre obtenir ce que vous voulez."',
    unlocks: [
      { type: 'unit', id: 'diplomat', description: 'Débloque le diplomate' },
      {
        type: 'building',
        id: 'diplomat_quarter',
        description: 'Débloque le quartier diplomatique',
      },
    ],
    bonuses: [
      { type: 'diplomatic_bonus', value: 10, description: '+10 toutes relations diplomatiques' },
    ],
  },

  logistics: {
    id: 'logistics',
    name: 'Logistique',
    age: 'medieval',
    era: 2,
    cost: 140,
    prerequisites: ['civil_service', 'engineering'],
    description: 'Organisation du ravitaillement et des approvisionnements militaires.',
    quote: '"L\'armée marche sur son estomac."',
    unlocks: [],
    bonuses: [
      { type: 'unit_movement', value: 1, description: '+1 mouvement armées' },
      { type: 'unit_combat', value: 10, description: '+10% efficacité en campagne' },
    ],
  },

  espionage: {
    id: 'espionage',
    name: 'Espionnage',
    age: 'medieval',
    era: 3,
    cost: 155,
    prerequisites: ['diplomatic_theory', 'civil_service'],
    description: 'Réseau de renseignement et agents secrets.',
    quote: '"Connais ton ennemi mieux qu\'il ne se connaît lui-même."',
    unlocks: [{ type: 'unit', id: 'spy', description: "Débloque l'espion" }],
    bonuses: [
      { type: 'vision_range', value: 1, description: '+1 portée vision dans territoire ennemi' },
    ],
  },

  // ================================================================
  // RENAISSANCE
  // ================================================================

  chemistry: {
    id: 'chemistry',
    name: 'Chimie',
    age: 'renaissance',
    era: 0,
    cost: 200,
    prerequisites: ['gunpowder', 'alchemy'],
    description: 'Science des réactions chimiques et des nouveaux matériaux.',
    quote: '"La chimie est la science qui crée le monde moderne."',
    unlocks: [
      { type: 'building', id: 'alchemist', description: "Améliore l'alchimiste en laboratoire" },
      { type: 'recipe', id: 'gunpowder_mix', description: 'Améliore la poudre à canon' },
    ],
    bonuses: [
      {
        type: 'resource_production',
        resource: 'gunpowder',
        value: 100,
        description: 'Double production poudre',
      },
    ],
  },

  scientific_method: {
    id: 'scientific_method',
    name: 'Méthode Scientifique',
    age: 'renaissance',
    era: 1,
    cost: 220,
    prerequisites: ['astronomy', 'education'],
    description: 'Démarche expérimentale révolutionnant la connaissance.',
    quote: '"Les faits ne se débattent pas, ils s\'établissent."',
    unlocks: [{ type: 'building', id: 'academy', description: "Débloque l'académie" }],
    bonuses: [
      { type: 'science_per_turn', value: 10, description: '+10 science/tour' },
      { type: 'tech_cost', value: 20, description: '-20% coût recherche' },
    ],
  },

  industrialization: {
    id: 'industrialization',
    name: 'Industrialisation',
    age: 'renaissance',
    era: 2,
    cost: 240,
    prerequisites: ['steam_power', 'economics'],
    description: 'Production de masse par des machines à vapeur.',
    quote: '"La vapeur est la force qui a changé le monde."',
    unlocks: [],
    bonuses: [
      {
        type: 'resource_production',
        resource: 'iron',
        value: 100,
        description: 'Double production fer',
      },
      {
        type: 'resource_production',
        resource: 'coal',
        value: 100,
        description: 'Double production charbon',
      },
    ],
  },

  banking_modern: {
    id: 'banking_modern',
    name: 'Banque Moderne',
    age: 'renaissance',
    era: 1,
    cost: 210,
    prerequisites: ['banking', 'economics'],
    description: 'Système financier sophistiqué avec crédit et investissement.',
    quote: '"La richesse n\'existe que dans la confiance."',
    unlocks: [],
    bonuses: [{ type: 'trade_income', value: 50, description: '+50% revenus commerciaux' }],
  },

  military_science: {
    id: 'military_science',
    name: 'Science Militaire',
    age: 'renaissance',
    era: 1,
    cost: 210,
    prerequisites: ['military_tactics', 'gunpowder'],
    description: 'Doctrine militaire moderne et armées professionnelles.',
    quote: '"La guerre est la politique par d\'autres moyens."',
    unlocks: [],
    bonuses: [{ type: 'unit_combat', value: 30, description: '+30% toutes unités' }],
  },

  steam_power: {
    id: 'steam_power',
    name: 'Machine à Vapeur',
    age: 'renaissance',
    era: 2,
    cost: 235,
    prerequisites: ['machinery', 'chemistry'],
    description: 'Conversion de la vapeur en énergie mécanique.',
    quote: '"La vapeur — première maîtrise de l\'énergie fossile."',
    unlocks: [],
    bonuses: [
      {
        type: 'resource_production',
        resource: 'steel',
        value: 100,
        description: 'Double production acier',
      },
      { type: 'building_cost', value: 25, description: '-25% coût construction' },
    ],
  },

  ballistics: {
    id: 'ballistics',
    name: 'Balistique',
    age: 'renaissance',
    era: 1,
    cost: 200,
    prerequisites: ['gunpowder', 'physics'],
    description: 'Science du mouvement des projectiles.',
    quote: '"Calculer la trajectoire, c\'est viser la victoire."',
    unlocks: [],
    bonuses: [{ type: 'unit_combat', value: 25, description: '+25% force artillerie' }],
  },

  rifling: {
    id: 'rifling',
    name: 'Rayure des Canons',
    age: 'renaissance',
    era: 2,
    cost: 225,
    prerequisites: ['ballistics', 'metallurgy'],
    description: 'Spirales dans les canons améliorant précision et portée.',
    quote: '"La précision est la nouvelle puissance."',
    unlocks: [],
    bonuses: [{ type: 'unit_combat', value: 30, description: '+30% précision unités à feu' }],
  },

  printing_modern: {
    id: 'printing_modern',
    name: 'Imprimerie Avancée',
    age: 'renaissance',
    era: 1,
    cost: 200,
    prerequisites: ['printing_press', 'paper'],
    description: 'Presse mécanique permettant tirage de masse.',
    quote: '"L\'information est le pouvoir."',
    unlocks: [],
    bonuses: [
      { type: 'culture_per_turn', value: 8, description: '+8 culture/tour' },
      { type: 'diplomatic_bonus', value: 5, description: '+5 influence diplomatique' },
    ],
  },

  rationalism: {
    id: 'rationalism',
    name: 'Rationalisme',
    age: 'renaissance',
    era: 2,
    cost: 230,
    prerequisites: ['scientific_method', 'philosophy'],
    description: "Pensée fondée sur la raison et l'observation empirique.",
    quote: '"La raison est la seule lumière qui ne trompe pas."',
    unlocks: [],
    bonuses: [{ type: 'science_per_turn', value: 15, description: '+15 science/tour' }],
  },

  enlightenment: {
    id: 'enlightenment',
    name: 'Lumières',
    age: 'renaissance',
    era: 3,
    cost: 260,
    prerequisites: ['rationalism', 'printing_modern'],
    description: 'Mouvement intellectuel prônant liberté, raison et progrès.',
    quote: '"Ose penser par toi-même."',
    unlocks: [],
    bonuses: [
      { type: 'culture_per_turn', value: 12, description: '+12 culture/tour' },
      { type: 'diplomatic_bonus', value: 15, description: '+15 toutes relations' },
    ],
  },

  mercantilism: {
    id: 'mercantilism',
    name: 'Mercantilisme',
    age: 'renaissance',
    era: 1,
    cost: 205,
    prerequisites: ['economics', 'trade'],
    description: "Doctrine économique favorisant l'exportation et les monopoles.",
    quote: '"L\'or d\'abord, la gloire ensuite."',
    unlocks: [],
    bonuses: [{ type: 'trade_income', value: 35, description: "+35% revenus d'exportation" }],
  },

  colonialism: {
    id: 'colonialism',
    name: 'Colonialisme',
    age: 'renaissance',
    era: 2,
    cost: 235,
    prerequisites: ['navigation', 'mercantilism'],
    description: 'Expansion outre-mer et établissement de colonies.',
    quote: '"Le soleil ne se couche jamais sur notre empire."',
    unlocks: [],
    bonuses: [
      {
        type: 'terrain_production',
        terrain: 'coast',
        value: 50,
        description: '+50% ressources colonies',
      },
      { type: 'unit_movement', value: 4, description: '+4 mouvement naval' },
    ],
  },

  humanism: {
    id: 'humanism',
    name: 'Humanisme',
    age: 'renaissance',
    era: 2,
    cost: 220,
    prerequisites: ['enlightenment', 'theology'],
    description: "Philosophie centrée sur la dignité et la valeur de l'être humain.",
    quote: '"L\'homme est la mesure de toutes choses."',
    unlocks: [],
    bonuses: [
      { type: 'faith_per_turn', value: 5, description: '+5 foi/tour' },
      { type: 'culture_per_turn', value: 5, description: '+5 culture/tour' },
    ],
  },

  grand_strategy: {
    id: 'grand_strategy',
    name: 'Grande Stratégie',
    age: 'renaissance',
    era: 3,
    cost: 280,
    prerequisites: ['military_science', 'logistics', 'diplomatic_theory'],
    description: "Maîtrise totale de la guerre, de l'économie et de la politique.",
    quote: '"La victoire appartient à celui dont la vision dépasse le champ de bataille."',
    unlocks: [],
    bonuses: [
      { type: 'unit_combat', value: 20, description: '+20% toutes unités' },
      { type: 'trade_income', value: 20, description: '+20% revenus' },
      { type: 'science_per_turn', value: 5, description: '+5 science/tour' },
      { type: 'diplomatic_bonus', value: 10, description: '+10 toutes relations' },
    ],
  },
};

// ============================================================
// MOTEUR DE RECHERCHE
// ============================================================

export class TechTreeEngine {
  static canResearch(techId: TechId, player: Player): { canResearch: boolean; reason?: string } {
    const tech = TECH_DEFINITIONS[techId];
    if (!tech) return { canResearch: false, reason: 'Technologie inconnue' };

    if (player.researchedTechs.includes(techId)) {
      return { canResearch: false, reason: 'Déjà recherché' };
    }

    // Vérifier les prérequis
    for (const prereq of tech.prerequisites) {
      if (!player.researchedTechs.includes(prereq)) {
        const prereqDef = TECH_DEFINITIONS[prereq];
        return {
          canResearch: false,
          reason: `Prérequis manquant : ${prereqDef?.name ?? prereq}`,
        };
      }
    }

    // Vérifier l'âge (ne peut pas sauter un âge)
    const ageOrder: AgeType[] = ['stone_age', 'bronze_age', 'iron_age', 'medieval', 'renaissance'];
    const playerAgeIdx = ageOrder.indexOf(player.age);
    const techAgeIdx = ageOrder.indexOf(tech.age);

    if (techAgeIdx > playerAgeIdx + 1) {
      return { canResearch: false, reason: 'Âge technologique insuffisant' };
    }

    return { canResearch: true };
  }

  static getResearchCost(techId: TechId, player: Player): number {
    const tech = TECH_DEFINITIONS[techId];
    if (!tech) return Infinity;

    let cost = tech.cost;

    // Réductions via techs précédentes
    if (player.researchedTechs.includes('education')) cost *= 0.85;
    if (player.researchedTechs.includes('scientific_method')) cost *= 0.8;
    if (player.researchedTechs.includes('rationalism')) cost *= 0.75;

    // Plancher à 25% du coût original pour éviter les réductions absurdes
    const floor = tech.cost * 0.25;
    return Math.round(Math.max(cost, floor));
  }

  /**
   * Permet aux Scholars de copier une technologie de leur allié actuel.
   * Retourne true si la copie a réussi.
   */
  static copyAllyTech(
    player: Player,
    allyPlayer: Player,
  ): { success: boolean; tech?: TechId; reason?: string } {
    // Chercher une technologie de l'allié que le joueur n'a pas encore
    const missing = allyPlayer.researchedTechs.filter(
      (t) =>
        !player.researchedTechs.includes(t) &&
        TechTreeEngine.canResearch(t as TechId, player).canResearch,
    ) as TechId[];

    if (missing.length === 0) {
      return { success: false, reason: 'Aucune technologie disponible à copier' };
    }

    // Choisir la technologie avec le coût le plus bas (la plus facile à copier)
    const cheapest = missing.reduce((best, id) => {
      const costA = TECH_DEFINITIONS[id]?.cost ?? Infinity;
      const costB = TECH_DEFINITIONS[best]?.cost ?? Infinity;
      return costA < costB ? id : best;
    });

    player.researchedTechs.push(cheapest);
    return { success: true, tech: cheapest };
  }

  static getAvailableTechs(player: Player): TechId[] {
    return (Object.keys(TECH_DEFINITIONS) as TechId[]).filter((id) => {
      const { canResearch } = TechTreeEngine.canResearch(id, player);
      return canResearch;
    });
  }

  static advanceTurn(
    player: Player,
    scienceProduced: number,
  ): {
    completed?: TechId;
    ageAdvanced?: AgeType;
  } {
    if (!player.currentResearch) return {};

    const tech = TECH_DEFINITIONS[player.currentResearch as TechId];
    if (!tech) return {};

    player.researchProgress += scienceProduced;
    const cost = TechTreeEngine.getResearchCost(player.currentResearch as TechId, player);

    if (player.researchProgress >= cost) {
      const completedTech = player.currentResearch as TechId;
      player.researchedTechs.push(completedTech);
      player.researchProgress = 0;

      // 2.4D — Obsolescence : retirer les techs remplacées et leurs bonus
      if (tech.obsoletes?.length) {
        TechTreeEngine.applyObsolescence(player, tech.obsoletes);
      }

      // Passer à la tech suivante dans la file
      player.currentResearch = player.researchQueue?.[0] ?? null;
      if (player.researchQueue?.length) {
        player.researchQueue = player.researchQueue.slice(1);
      }
      // Retirer les techs devenues obsolètes de la file de recherche
      if (tech.obsoletes?.length) {
        player.researchQueue = (player.researchQueue ?? []).filter(
          (q) => !tech.obsoletes!.includes(q as TechId),
        );
      }

      // Vérifier avancement d'âge
      const ageAdvanced = TechTreeEngine.checkAgeAdvancement(player);
      return { completed: completedTech, ageAdvanced };
    }

    return {};
  }

  static checkAgeAdvancement(player: Player): AgeType | undefined {
    const ageOrder: AgeType[] = ['stone_age', 'bronze_age', 'iron_age', 'medieval', 'renaissance'];

    // Nombre de techs de l'âge actuel requises ET techs-clé obligatoires
    const ageRequirements: Record<AgeType, { minTechs: number; keyTechs: TechId[] }> = {
      stone_age: { minTechs: 0, keyTechs: [] },
      bronze_age: { minTechs: 3, keyTechs: ['mining' as TechId, 'agriculture' as TechId] },
      iron_age: { minTechs: 6, keyTechs: ['iron_working' as TechId, 'engineering' as TechId] },
      medieval: { minTechs: 10, keyTechs: ['feudalism' as TechId, 'theology' as TechId] },
      renaissance: { minTechs: 15, keyTechs: ['education' as TechId, 'printing_press' as TechId] },
    };

    const currentIdx = ageOrder.indexOf(player.age);
    if (currentIdx >= ageOrder.length - 1) return undefined;

    const nextAge = ageOrder[currentIdx + 1];
    const req = ageRequirements[nextAge];

    // Vérifier techs-clé de l'âge ACTUEL requises pour avancer
    const currentAge = ageOrder[currentIdx];
    const currentReq = ageRequirements[currentAge];
    const hasKeyTechs = currentReq.keyTechs.every((t) => player.researchedTechs.includes(t));
    if (!hasKeyTechs) return undefined;

    // Vérifier le nombre minimum de techs de l'âge actuel
    const researchedInCurrentAge = player.researchedTechs.filter(
      (id) => TECH_DEFINITIONS[id as TechId]?.age === currentAge,
    ).length;
    if (researchedInCurrentAge < req.minTechs) return undefined;

    player.age = nextAge;
    return nextAge;
  }

  // ============================================================
  // 2.4D — OBSOLESCENCE DES TECHNOLOGIES
  // Retire les techs obsolètes et leurs bonus passifs du joueur
  // ============================================================

  static applyObsolescence(player: Player, obsoleted: TechId[]): void {
    for (const obsoleteId of obsoleted) {
      if (!player.researchedTechs.includes(obsoleteId)) continue;

      // Retirer la tech de la liste
      player.researchedTechs = player.researchedTechs.filter((t) => t !== obsoleteId);

      // Annuler les bonus passifs de cette tech
      const tech = TECH_DEFINITIONS[obsoleteId];
      if (!tech) continue;

      for (const bonus of tech.bonuses) {
        switch (bonus.type) {
          case 'resource_storage':
            // Réduire le stockage des ressources affectées
            for (const key of Object.keys(player.resourceCap)) {
              const cur = (player.resourceCap as Record<string, number>)[key] ?? 0;
              if (cur > 0) {
                (player.resourceCap as Record<string, number>)[key] = Math.max(
                  0,
                  cur - bonus.value,
                );
              }
            }
            break;
          case 'science_per_turn':
            // Les bonus science/culture/faith sont recalculés chaque tour — rien à retirer ici
            break;
          default:
            // Les bonus multiplicatifs (terrain_production, unit_combat, etc.)
            // sont recalculés dynamiquement depuis player.researchedTechs — rien à faire
            break;
        }
      }
    }
  }
}

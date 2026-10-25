// ============================================================
// EventSystem — Déclenchement et résolution des événements
// ============================================================

import { GameEvent, EventType, EventEffect, EventChoice, Season } from '../../types/events';
import { GameState } from '../../types/game';
import { Player } from '../../types/player';
import { HexTile } from '../../types/hex';
import { addResources, subtractResources, hasResources } from '../resources/ResourceSystem';
import { hexSpiral, hexToId } from '../hex/HexMath';
import { randomChoice, randomFloat } from '../../core/rng';
import { now } from '../../core/clock';

// ============================================================
// PROBABILITÉS D'ÉVÉNEMENTS PAR TOUR
// ============================================================

interface EventTemplate {
  type: EventType;
  baseProbability: number; // par tour
  cooldownTurns?: number; // tours de cooldown après déclenchement
  followUp?: {
    eventType: EventType;
    probability: number;
    delayTurns: number;
  };
  conditions: Array<(state: GameState) => boolean>;
  generateEvent: (state: GameState) => Partial<GameEvent>;
}

const EVENT_TEMPLATES: EventTemplate[] = [
  // ── NATUREL ──────────────────────────────────────────────
  {
    type: 'good_harvest',
    baseProbability: 0.08,
    conditions: [(s) => s.season === 'summer' || s.season === 'spring'],
    generateEvent: (state) => ({
      name: 'Bonne Récolte',
      description: 'Les champs sont exceptionnellement fertiles cette saison.',
      flavorText: '"Les greniers débordent, le peuple se réjouit."',
      scope: 'global',
      severity: 'minor',
      duration: 2,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: 50,
          duration: 2,
          description: '+50% production blé pendant 2 tours',
        },
      ],
      icon: 'harvest',
    }),
  },
  {
    type: 'drought',
    baseProbability: 0.05,
    conditions: [(s) => s.season === 'summer'],
    generateEvent: () => ({
      name: 'Sécheresse',
      description: 'Une sécheresse sévère frappe les cultures.',
      flavorText: '"Le soleil brûle, la terre se fissure."',
      scope: 'regional',
      severity: 'moderate',
      duration: 3,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: -40,
          duration: 3,
          description: '-40% production blé',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'herbs',
          percentage: -30,
          duration: 3,
          description: '-30% production herbes',
        },
      ],
      choices: [
        {
          id: 'build_irrigation',
          label: "Construire des systèmes d'irrigation",
          description: "Coûte 5 pierres mais réduit l'impact",
          cost: { stone: 5 },
          effects: [
            {
              type: 'production_modifier',
              target: 'triggered_player',
              resource: 'wheat',
              percentage: 20,
              duration: 3,
              description: 'Atténue la sécheresse',
            },
          ],
        },
        {
          id: 'do_nothing',
          label: 'Endurer',
          description: 'Subir la sécheresse sans intervention',
          effects: [],
        },
      ],
      icon: 'drought',
    }),
  },
  {
    type: 'volcano_eruption',
    baseProbability: 0.02,
    conditions: [(s) => [...s.map.values()].some((t) => t.terrain === 'volcano')],
    generateEvent: (state) => {
      const volcanoes = [...state.map.values()].filter((t) => t.terrain === 'volcano');
      const target = randomChoice(volcanoes);
      return {
        name: 'Éruption Volcanique',
        description: 'Un volcan entre en éruption, dévastant la région environnante.',
        flavorText: '"La terre tremble, le ciel rougit de lave."',
        scope: 'local',
        severity: 'catastrophic',
        duration: 3,
        targetTiles: target ? [hexToId(target.coord)] : [],
        effects: [
          {
            type: 'tile_destruction',
            target: 'affected_tiles',
            description: 'Détruit les bâtiments adjacents',
          },
          {
            type: 'unit_damage',
            target: 'affected_tiles',
            amount: 50,
            description: '-50 HP unités sur zone',
          },
          {
            type: 'resource_gain',
            target: 'affected_tiles',
            resource: 'obsidian',
            amount: 5,
            description: '+5 obsidienne (matière volcanique)',
          },
        ],
        icon: 'volcano',
      };
    },
  },
  {
    type: 'forest_fire',
    baseProbability: 0.04,
    conditions: [(s) => s.season === 'summer'],
    generateEvent: (state) => {
      const forests = [...state.map.values()].filter((t) => t.terrain === 'forest');
      const target = randomChoice(forests);
      return {
        name: 'Incendie de Forêt',
        description: 'Un violent incendie ravage une forêt.',
        flavorText: '"Les flammes dévorent les arbres centenaires."',
        scope: 'local',
        severity: 'major',
        duration: 2,
        targetTiles: target ? [hexToId(target.coord)] : [],
        effects: [
          {
            type: 'production_modifier',
            target: 'affected_tiles',
            resource: 'wood',
            percentage: -80,
            duration: 5,
            description: '-80% production bois (forêt brûlée)',
          },
          {
            type: 'tile_transform',
            target: 'affected_tiles',
            description: 'La forêt devient des cendres (fertiles plus tard)',
          },
        ],
        icon: 'fire',
      };
    },
  },
  {
    type: 'harsh_winter',
    baseProbability: 0.1,
    conditions: [(s) => s.season === 'winter'],
    generateEvent: () => ({
      name: 'Hiver Rigoureux',
      description: 'Un hiver particulièrement rude frappe toutes les civilisations.',
      flavorText: '"Le froid s\'abat comme un ennemi invisible."',
      scope: 'global',
      severity: 'moderate',
      duration: 2,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: -30,
          duration: 2,
          description: '-30% production agricole',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'fish',
          percentage: -20,
          duration: 2,
          description: '-20% pêche (eaux gelées)',
        },
        {
          type: 'movement_penalty',
          target: 'all_players',
          amount: -1,
          description: '-1 mouvement toutes unités',
        },
      ],
      choices: [
        {
          id: 'stockpile_food',
          label: 'Puiser dans les réserves',
          description: 'Dépense du pain pour maintenir la production',
          cost: { bread: 5 },
          effects: [
            {
              type: 'production_modifier',
              target: 'triggered_player',
              percentage: 20,
              duration: 2,
              description: 'Atténue la pénalité',
            },
          ],
        },
        {
          id: 'endure',
          label: 'Endurer le froid',
          description: 'Subir sans consommer de réserves',
          effects: [],
        },
      ],
      icon: 'blizzard',
    }),
  },
  // ── POLITIQUE ────────────────────────────────────────────
  {
    type: 'rebellion',
    baseProbability: 0.04,
    conditions: [(s) => [...s.players.values()].some((p) => p.cities.length > 4)],
    generateEvent: (state) => {
      const richPlayers = [...state.players.values()].filter((p) => p.cities.length > 4);
      const target = randomChoice(richPlayers);
      return {
        name: 'Révolte Populaire',
        description: `Une révolte éclate dans l'empire de ${target?.name ?? 'un joueur'}.`,
        flavorText: '"Le peuple ne supporte plus l\'oppression."',
        scope: 'local',
        severity: 'major',
        duration: 3,
        targetPlayers: target ? [target.id] : [],
        effects: [
          {
            type: 'production_modifier',
            target: 'specific_player',
            percentage: -25,
            duration: 3,
            description: '-25% production (révolte)',
          },
          {
            type: 'unit_damage',
            target: 'specific_player',
            amount: 30,
            description: '-30 HP unités (désordre)',
          },
        ],
        choices: [
          {
            id: 'crush_rebellion',
            label: 'Écraser la révolte',
            description: "Envoyer l'armée. Coûte 3 armes.",
            cost: { weapons: 3 },
            effects: [
              {
                type: 'production_modifier',
                target: 'triggered_player',
                percentage: 15,
                duration: 2,
                description: 'Rétablit la paix rapidement',
              },
            ],
            moralityTag: 'evil',
          },
          {
            id: 'negotiate',
            label: 'Négocier',
            description: 'Accorder des concessions. Coûte 5 coins.',
            cost: { coins: 5 },
            effects: [
              {
                type: 'culture_bonus',
                target: 'triggered_player',
                amount: 10,
                description: '+10 culture (popularité)',
              },
            ],
            moralityTag: 'good',
          },
        ],
        icon: 'revolt',
      };
    },
  },
  // ── ÉCONOMIQUE ────────────────────────────────────────────
  {
    type: 'gold_rush',
    baseProbability: 0.03,
    conditions: [],
    generateEvent: (state) => {
      const tiles = [...state.map.values()];
      const target = randomChoice(tiles);
      if (!target) {
        return {
          name: "Ruée vers l'Or",
          description: "Un filon d'or exceptionnel est découvert !",
          flavorText: '"L\'or attire les aventuriers de tout le monde connu."',
          scope: 'local',
          severity: 'moderate',
          duration: 5,
          targetTiles: [],
          effects: [],
          icon: 'gold',
        };
      }
      return {
        name: "Ruée vers l'Or",
        description: "Un filon d'or exceptionnel est découvert !",
        flavorText: '"L\'or attire les aventuriers de tout le monde connu."',
        scope: 'local',
        severity: 'moderate',
        duration: 5,
        targetTiles: [hexToId(target.coord)],
        effects: [
          {
            type: 'spawn_resource',
            target: 'affected_tiles',
            resource: 'gold',
            amount: 8,
            description: '+8 or sur la tuile',
          },
          {
            type: 'reveal_tiles',
            target: 'all_players',
            description: 'Révèle la zone aux yeux de tous',
          },
        ],
        icon: 'gold',
      };
    },
  },
  {
    type: 'trade_boom',
    baseProbability: 0.05,
    conditions: [(s) => [...s.players.values()].some((p) => p.ports.length > 0)],
    generateEvent: () => ({
      name: 'Boom Commercial',
      description: 'Les routes commerciales sont florissantes !',
      flavorText: '"Les marchands s\'enrichissent, les villes prospèrent."',
      scope: 'global',
      severity: 'minor',
      duration: 3,
      effects: [
        {
          type: 'resource_gain',
          target: 'all_players',
          resource: 'coins',
          amount: 5,
          description: '+5 coins tous les joueurs',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'gold',
          percentage: 25,
          duration: 3,
          description: '+25% valeur commerciale',
        },
      ],
      icon: 'trade',
    }),
  },
  // ── RELIGIEUX ─────────────────────────────────────────────
  {
    type: 'miracle',
    baseProbability: 0.02,
    conditions: [(s) => [...s.players.values()].some((p) => (p.resources.faith ?? 0) > 30)],
    generateEvent: (state) => {
      const faithful = [...state.players.values()]
        .filter((p) => (p.resources.faith ?? 0) > 30)
        .sort((a, b) => (b.resources.faith ?? 0) - (a.resources.faith ?? 0));
      const beneficiary = faithful[0];
      return {
        name: 'Miracle Divin',
        description: `Un miracle se produit dans les terres de ${beneficiary?.name ?? 'un joueur'} !`,
        flavorText: '"Les dieux ont parlé — et leur parole est bénédiction."',
        scope: 'local',
        severity: 'moderate',
        duration: 0,
        targetPlayers: beneficiary ? [beneficiary.id] : [],
        effects: [
          {
            type: 'resource_gain',
            target: 'specific_player',
            resource: 'faith',
            amount: 20,
            description: '+20 foi',
          },
          {
            type: 'culture_bonus',
            target: 'specific_player',
            amount: 15,
            description: '+15 culture',
          },
          {
            type: 'victory_points',
            target: 'specific_player',
            amount: 1,
            description: '+1 VP (miracle)',
          },
        ],
        icon: 'miracle',
      };
    },
  },
  // ── DÉCOUVERTE ────────────────────────────────────────────
  {
    type: 'ancient_ruins_found',
    baseProbability: 0.04,
    conditions: [],
    generateEvent: (state) => {
      const ruinTiles = [...state.map.values()].filter((t) => t.features.includes('ancient_ruins'));
      const target =
        ruinTiles.length > 0 ? randomChoice(ruinTiles) : randomChoice([...state.map.values()]);
      if (!target) {
        return {
          name: 'Ruines Anciennes Découvertes',
          description: "Un explorateur découvre des ruines d'une civilisation disparue.",
          flavorText: '"Ces pierres racontent l\'histoire du monde."',
          scope: 'local',
          severity: 'minor',
          duration: 0,
          targetTiles: [],
          effects: [],
          icon: 'ruins',
        };
      }
      return {
        name: 'Ruines Anciennes Découvertes',
        description: "Un explorateur découvre des ruines d'une civilisation disparue.",
        flavorText: '"Ces pierres racontent l\'histoire du monde."',
        scope: 'local',
        severity: 'minor',
        duration: 0,
        targetTiles: [hexToId(target.coord)],
        effects: [
          {
            type: 'science_bonus',
            target: 'triggered_player',
            amount: 15,
            description: '+15 science (artefacts)',
          },
          {
            type: 'resource_gain',
            target: 'triggered_player',
            resource: 'gold',
            amount: 3,
            description: '+3 or (trésors)',
          },
        ],
        icon: 'ruins',
      };
    },
  },
  {
    type: 'scientific_breakthrough',
    baseProbability: 0.03,
    conditions: [(s) => [...s.players.values()].some((p) => p.researchedTechs.length > 5)],
    generateEvent: (state) => {
      const scientists = [...state.players.values()]
        .filter((p) => p.researchedTechs.length > 5)
        .sort((a, b) => b.researchedTechs.length - a.researchedTechs.length);
      return {
        name: 'Percée Scientifique',
        description: 'Un savant génial fait une découverte révolutionnaire.',
        flavorText: '"Eurêka !"',
        scope: 'local',
        severity: 'moderate',
        duration: 0,
        targetPlayers: scientists[0] ? [scientists[0].id] : [],
        effects: [
          {
            type: 'science_bonus',
            target: 'specific_player',
            amount: 30,
            description: '+30 science (percée)',
          },
        ],
        icon: 'science',
      };
    },
  },
  // ── MALADIES ─────────────────────────────────────────────
  {
    type: 'plague_minor',
    baseProbability: 0.03,
    conditions: [],
    generateEvent: (state) => {
      const players = [...state.players.values()];
      const target = randomChoice(players);
      return {
        name: 'Épidémie',
        description: `Une épidémie se répand dans ${target?.name ?? 'une région'}.`,
        flavorText: '"La maladie ne choisit pas ses victimes."',
        scope: 'local',
        severity: 'moderate',
        duration: 3,
        targetPlayers: target ? [target.id] : [],
        effects: [
          {
            type: 'unit_damage',
            target: 'specific_player',
            amount: 20,
            description: '-20 HP toutes unités',
          },
          {
            type: 'production_modifier',
            target: 'specific_player',
            percentage: -20,
            duration: 3,
            description: '-20% production (maladie)',
          },
        ],
        choices: [
          {
            id: 'use_medicine',
            label: 'Utiliser la médecine',
            description: "Dépenser 3 médecines pour enrayer l'épidémie",
            cost: { medicine: 3 },
            effects: [
              {
                type: 'production_modifier',
                target: 'triggered_player',
                percentage: 15,
                description: "Réduit l'impact",
              },
            ],
            requiredBuilding: 'apothecary',
          },
          {
            id: 'quarantine',
            label: 'Quarantaine',
            description: 'Isoler les malades, perdre un tour de production',
            cost: { bread: 3 },
            effects: [
              {
                type: 'production_modifier',
                target: 'triggered_player',
                percentage: 10,
                description: "Réduit légèrement l'impact",
              },
            ],
          },
        ],
        icon: 'plague',
      };
    },
  },

  // ── CATASTROPHES NATURELLES ─────────────────────────────────
  {
    type: 'earthquake',
    baseProbability: 0.04,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Tremblement de terre',
      description: 'La terre tremble violemment, détruisant des bâtiments.',
      duration: 0,
      effects: [
        {
          type: 'tile_destruction',
          target: 'affected_tiles',
          description: 'Détruit les bâtiments fragiles',
        },
        { type: 'unit_damage', target: 'affected_tiles', amount: 30, description: '-30 HP unités' },
      ],
      icon: 'earthquake',
    }),
  },
  {
    type: 'flood',
    baseProbability: 0.05,
    conditions: [(s) => ['spring', 'summer'].includes(s.season)],
    generateEvent: (state) => ({
      name: 'Inondation',
      description: 'Les rivières débordent, inondant les terres basses.',
      duration: 2,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: -35,
          duration: 2,
          description: '-35% blé (terres noyées)',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'fish',
          percentage: 20,
          duration: 2,
          description: '+20% poisson (crues)',
        },
        {
          type: 'movement_penalty',
          target: 'all_players',
          amount: -1,
          description: '-1 mouvement (terrain détrempé)',
        },
      ],
      choices: [
        {
          id: 'build_levees',
          label: 'Construire des levées (coût: 3 clay)',
          description: '',
          cost: { clay: 3 },
          effects: [
            {
              type: 'production_modifier',
              target: 'triggered_player',
              percentage: 20,
              duration: 2,
              description: 'Protège les récoltes',
            },
          ],
        },
        {
          id: 'evacuate',
          label: 'Évacuer les zones inondées',
          description: '',
          cost: {},
          effects: [
            {
              type: 'unit_damage',
              target: 'triggered_player',
              amount: -10,
              description: 'Sauve des unités de la noyade',
            },
          ],
        },
      ],
      icon: 'flood',
    }),
  },
  {
    type: 'blizzard',
    baseProbability: 0.06,
    conditions: [(s) => s.season === 'winter'],
    generateEvent: (state) => ({
      name: 'Blizzard',
      description: 'Une tempête de neige paralyse la région.',
      duration: 3,
      effects: [
        {
          type: 'movement_penalty',
          target: 'all_players',
          amount: -2,
          description: '-2 mouvement (neige épaisse)',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: -50,
          duration: 3,
          description: '-50% blé (gelé)',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wood',
          percentage: -20,
          duration: 3,
          description: '-20% bois (inaccessible)',
        },
      ],
      icon: 'blizzard',
    }),
  },
  {
    type: 'tsunami',
    baseProbability: 0.02,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Tsunami',
      description: 'Une vague géante dévaste les côtes.',
      duration: 1,
      effects: [
        {
          type: 'tile_destruction',
          target: 'affected_tiles',
          description: 'Détruit les ports et bâtiments côtiers',
        },
        {
          type: 'unit_damage',
          target: 'affected_tiles',
          amount: 60,
          description: '-60 HP unités côtières',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'fish',
          percentage: -60,
          duration: 4,
          description: '-60% pêche (eaux perturbées)',
        },
      ],
      icon: 'tsunami',
    }),
  },
  {
    type: 'meteor_impact',
    baseProbability: 0.01,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Impact météorique',
      description: "Un météore s'écrase, créant un cratère riche en minéraux.",
      duration: 0,
      effects: [
        {
          type: 'tile_destruction',
          target: 'affected_tiles',
          description: "Dévaste la zone d'impact",
        },
        {
          type: 'spawn_resource',
          target: 'affected_tiles',
          resource: 'ore',
          amount: 15,
          description: '+15 minerai (débris cosmiques)',
        },
        {
          type: 'spawn_resource',
          target: 'affected_tiles',
          resource: 'gems',
          amount: 3,
          description: '+3 gemmes (cristaux météoritiques)',
        },
      ],
      icon: 'meteor',
    }),
  },
  {
    type: 'landslide',
    baseProbability: 0.04,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Glissement de terrain',
      description: 'Un glissement de terrain bloque les passages montagneux.',
      duration: 3,
      effects: [
        {
          type: 'movement_penalty',
          target: 'all_players',
          amount: -1,
          description: '-1 mouvement en montagne',
        },
        {
          type: 'tile_destruction',
          target: 'affected_tiles',
          description: 'Détruit les routes de montagne',
        },
      ],
      icon: 'landslide',
    }),
  },

  // ── MÉTÉO / SAISONS ─────────────────────────────────────────
  {
    type: 'heavy_rains',
    baseProbability: 0.07,
    conditions: [(s) => ['spring', 'autumn'].includes(s.season)],
    generateEvent: (state) => ({
      name: 'Pluies abondantes',
      description: "Des pluies torrentielles s'abattent sur la région.",
      duration: 2,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'water',
          percentage: 50,
          duration: 2,
          description: '+50% eau',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: 10,
          duration: 2,
          description: '+10% blé (bonne humidité)',
        },
        {
          type: 'movement_penalty',
          target: 'all_players',
          amount: -1,
          description: '-1 mouvement (boue)',
        },
      ],
      icon: 'rain',
    }),
  },
  {
    type: 'golden_summer',
    baseProbability: 0.06,
    conditions: [(s) => s.season === 'summer'],
    generateEvent: (state) => ({
      name: 'Été doré',
      description: 'Un été exceptionnel booste toutes les productions.',
      duration: 3,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: 30,
          duration: 3,
          description: '+30% blé',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'sheep',
          percentage: 20,
          duration: 3,
          description: '+20% laine',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'herbs',
          percentage: 25,
          duration: 3,
          description: '+25% herbes',
        },
      ],
      icon: 'sun',
    }),
  },
  {
    type: 'storm',
    baseProbability: 0.06,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Tempête en mer',
      description: 'Une violente tempête perturbe les routes maritimes.',
      duration: 3,
      effects: [
        {
          type: 'movement_penalty',
          target: 'all_players',
          amount: -2,
          description: '-2 mouvement naval',
        },
        {
          type: 'unit_damage',
          target: 'all_players',
          amount: 20,
          description: '-20 HP flottes en mer',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'fish',
          percentage: -30,
          duration: 3,
          description: '-30% pêche',
        },
      ],
      icon: 'storm',
    }),
  },

  // ── POLITIQUE ──────────────────────────────────────────────
  {
    type: 'succession_crisis',
    baseProbability: 0.04,
    conditions: [(s) => [...s.players.values()].some((p) => p.stats.victoryPoints >= 5)],
    generateEvent: (state) => ({
      name: 'Crise de succession',
      description: 'Une crise politique ébranle une puissance montante.',
      duration: 3,
      effects: [
        {
          type: 'production_modifier',
          target: 'specific_player',
          percentage: -20,
          duration: 3,
          description: '-20% production (instabilité)',
        },
        {
          type: 'culture_bonus',
          target: 'specific_player',
          amount: -10,
          description: '-10 culture (désordre)',
        },
      ],
      choices: [
        {
          id: 'pay_nobles',
          label: 'Payer les nobles (5 gold)',
          description: '',
          cost: { gold: 5 },
          effects: [
            {
              type: 'production_modifier',
              target: 'triggered_player',
              percentage: 15,
              duration: 2,
              description: 'Rétablit la stabilité',
            },
          ],
        },
      ],
      icon: 'crown',
    }),
  },
  {
    type: 'trade_embargo',
    baseProbability: 0.04,
    conditions: [(s) => s.currentTurn > 10],
    generateEvent: (state) => ({
      name: 'Embargo commercial',
      description: 'Un embargo pénalise les échanges avec certains joueurs.',
      duration: 4,
      effects: [
        {
          type: 'production_modifier',
          target: 'specific_player',
          resource: 'coins',
          percentage: -30,
          duration: 4,
          description: '-30% revenus commerciaux',
        },
      ],
      icon: 'embargo',
    }),
  },
  {
    type: 'spy_caught',
    baseProbability: 0.04,
    conditions: [(s) => s.currentTurn > 8],
    generateEvent: (state) => ({
      name: 'Espion capturé',
      description: 'Un espion ennemi est capturé, créant un incident diplomatique.',
      duration: 0,
      effects: [
        {
          type: 'culture_bonus',
          target: 'triggered_player',
          amount: 5,
          description: '+5 culture (renforcement de la loyauté)',
        },
      ],
      choices: [
        {
          id: 'execute',
          label: "Exécuter l'espion (tensions diplomatiques)",
          description: '',
          cost: {},
          effects: [
            {
              type: 'resource_gain',
              target: 'triggered_player',
              resource: 'influence',
              amount: 3,
              description: '+3 influence (démonstration de force)',
            },
          ],
        },
        {
          id: 'exchange',
          label: 'Proposer un échange de prisonniers',
          description: '',
          cost: {},
          effects: [
            {
              type: 'resource_gain',
              target: 'triggered_player',
              resource: 'influence',
              amount: 5,
              description: '+5 influence (geste de bonne volonté)',
            },
          ],
        },
      ],
      icon: 'spy',
    }),
  },
  {
    type: 'migration',
    baseProbability: 0.05,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Vague de migration',
      description: 'Des populations cherchent refuge dans votre territoire.',
      duration: 2,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: -10,
          duration: 2,
          description: '-10% blé (bouches supplémentaires)',
        },
      ],
      choices: [
        {
          id: 'welcome',
          label: 'Accueillir les migrants',
          description: '',
          cost: { wheat: 3 },
          effects: [
            {
              type: 'culture_bonus',
              target: 'triggered_player',
              amount: 8,
              description: '+8 culture (diversité)',
            },
            {
              type: 'resource_gain',
              target: 'triggered_player',
              resource: 'influence',
              amount: 3,
              description: '+3 influence',
            },
          ],
        },
        {
          id: 'refuse',
          label: 'Fermer les frontières',
          description: '',
          cost: {},
          effects: [
            {
              type: 'resource_gain',
              target: 'triggered_player',
              resource: 'influence',
              amount: -3,
              description: '-3 influence (mauvaise réputation)',
            },
          ],
        },
      ],
      icon: 'migration',
    }),
  },

  // ── ÉCONOMIE ───────────────────────────────────────────────
  {
    type: 'market_crash',
    baseProbability: 0.03,
    conditions: [(s) => s.currentTurn > 15],
    generateEvent: (state) => ({
      name: 'Krach boursier',
      description: "Les marchés s'effondrent, les prix chutent drastiquement.",
      duration: 4,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'coins',
          percentage: -40,
          duration: 4,
          description: '-40% revenus marchands',
        },
        {
          type: 'resource_gain',
          target: 'all_players',
          resource: 'gold',
          amount: -3,
          description: '-3 or (dévaluation)',
        },
      ],
      icon: 'crash',
    }),
  },
  {
    type: 'resource_depletion',
    baseProbability: 0.04,
    conditions: [(s) => s.currentTurn > 20],
    generateEvent: (state) => ({
      name: 'Épuisement des ressources',
      description: "Une ressource clé s'épuise sur une tuile exploitée.",
      duration: 0,
      effects: [
        {
          type: 'production_modifier',
          target: 'affected_tiles',
          percentage: -70,
          duration: 8,
          description: '-70% production (ressource épuisée)',
        },
      ],
      icon: 'depletion',
    }),
  },
  {
    type: 'new_deposit',
    baseProbability: 0.05,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Nouveau gisement découvert',
      description: 'Des prospecteurs découvrent un riche gisement minéral.',
      duration: 0,
      effects: [
        {
          type: 'spawn_resource',
          target: 'affected_tiles',
          resource: 'ore',
          amount: 10,
          description: '+10 minerai (gisement)',
        },
        {
          type: 'production_modifier',
          target: 'affected_tiles',
          percentage: 40,
          duration: 6,
          description: '+40% production (gisement riche)',
        },
      ],
      icon: 'deposit',
    }),
  },
  {
    type: 'piracy',
    baseProbability: 0.05,
    conditions: [(s) => s.currentTurn > 5],
    generateEvent: (state) => ({
      name: 'Piraterie',
      description: 'Des pirates pillent les routes commerciales maritimes.',
      duration: 3,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'fish',
          percentage: -20,
          duration: 3,
          description: '-20% pêche (pirates)',
        },
        {
          type: 'resource_gain',
          target: 'all_players',
          resource: 'coins',
          amount: -2,
          description: '-2 coins (tribut aux pirates)',
        },
      ],
      choices: [
        {
          id: 'hunt_pirates',
          label: 'Lancer une expédition anti-pirate (5 wood)',
          description: '',
          cost: { wood: 5 },
          effects: [
            {
              type: 'production_modifier',
              target: 'triggered_player',
              percentage: 20,
              duration: 3,
              description: 'Sécurise vos routes',
            },
          ],
        },
      ],
      icon: 'pirate',
    }),
  },
  {
    type: 'bandit_raid',
    baseProbability: 0.06,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Raid de bandits',
      description: 'Des bandits pillent les routes terrestres.',
      duration: 2,
      effects: [
        {
          type: 'resource_gain',
          target: 'specific_player',
          resource: 'wood',
          amount: -2,
          description: '-2 bois (pillé)',
        },
        {
          type: 'resource_gain',
          target: 'specific_player',
          resource: 'wheat',
          amount: -2,
          description: '-2 blé (pillé)',
        },
      ],
      choices: [
        {
          id: 'pursue_bandits',
          label: 'Poursuivre les bandits',
          description: '',
          cost: {},
          effects: [
            {
              type: 'resource_gain',
              target: 'triggered_player',
              resource: 'gold',
              amount: 4,
              description: '+4 or (butin récupéré)',
            },
          ],
        },
      ],
      icon: 'bandit',
    }),
  },

  // ── MILITAIRE ──────────────────────────────────────────────
  {
    type: 'mercenary_offer',
    baseProbability: 0.06,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Offre de mercenaires',
      description: 'Des mercenaires expérimentés proposent leurs services.',
      duration: 0,
      choices: [
        {
          id: 'hire_mercenaries',
          label: 'Engager les mercenaires (8 gold)',
          description: '',
          cost: { gold: 8 },
          effects: [
            {
              type: 'resource_gain',
              target: 'triggered_player',
              resource: 'influence',
              amount: 3,
              description: '+3 influence (force militaire)',
            },
          ],
        },
        {
          id: 'decline',
          label: "Décliner l'offre",
          description: '',
          cost: {},
          effects: [],
        },
      ],
      effects: [],
      icon: 'mercenary',
    }),
  },
  {
    type: 'war_weariness',
    baseProbability: 0.05,
    conditions: [
      (s) =>
        [...s.players.values()].some((p) =>
          Object.values(p.relations).some((r) => r.status === 'war'),
        ),
    ],
    generateEvent: (state) => ({
      name: 'Lassitude de guerre',
      description: 'Les troupes sont épuisées par des conflits prolongés.',
      duration: 3,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          percentage: -15,
          duration: 3,
          description: '-15% production (moral bas)',
        },
        {
          type: 'unit_damage',
          target: 'all_players',
          amount: 10,
          description: '-10 HP toutes unités (fatigue)',
        },
      ],
      icon: 'war_weary',
    }),
  },
  {
    type: 'desertion',
    baseProbability: 0.04,
    conditions: [
      (s) =>
        [...s.players.values()].some((p) =>
          Object.values(p.relations).some((r) => r.status === 'war'),
        ),
    ],
    generateEvent: (state) => ({
      name: 'Désertions',
      description: 'Des soldats désertent face aux difficultés.',
      duration: 0,
      effects: [
        {
          type: 'unit_damage',
          target: 'specific_player',
          amount: 25,
          description: '-25 HP (désertion)',
        },
        {
          type: 'production_modifier',
          target: 'specific_player',
          percentage: -10,
          duration: 2,
          description: '-10% (moral effondré)',
        },
      ],
      icon: 'desertion',
    }),
  },

  // ── RELIGIEUX ──────────────────────────────────────────────
  {
    type: 'heresy',
    baseProbability: 0.04,
    conditions: [(s) => [...s.players.values()].some((p) => (p.resources.faith ?? 0) > 10)],
    generateEvent: (state) => ({
      name: 'Hérésie',
      description: "Un mouvement hérétique affaiblit l'influence de l'église.",
      duration: 3,
      effects: [
        {
          type: 'production_modifier',
          target: 'specific_player',
          resource: 'faith',
          percentage: -40,
          duration: 3,
          description: '-40% foi',
        },
        {
          type: 'culture_bonus',
          target: 'specific_player',
          amount: -5,
          description: '-5 culture (trouble social)',
        },
      ],
      icon: 'heresy',
    }),
  },
  {
    type: 'pilgrimage',
    baseProbability: 0.05,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Pèlerinage',
      description: 'Des pèlerins traversent votre territoire, apportant richesse et culture.',
      duration: 2,
      effects: [
        {
          type: 'resource_gain',
          target: 'triggered_player',
          resource: 'coins',
          amount: 4,
          description: '+4 coins (pèlerins)',
        },
        { type: 'culture_bonus', target: 'triggered_player', amount: 8, description: '+8 culture' },
        {
          type: 'resource_gain',
          target: 'triggered_player',
          resource: 'faith',
          amount: 5,
          description: '+5 foi',
        },
      ],
      icon: 'pilgrimage',
    }),
  },

  // ── DÉCOUVERTES ────────────────────────────────────────────
  {
    type: 'new_route',
    baseProbability: 0.05,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Nouvelle route commerciale',
      description: 'Vos marchands découvrent une nouvelle route lucrative.',
      duration: 5,
      effects: [
        {
          type: 'production_modifier',
          target: 'triggered_player',
          resource: 'coins',
          percentage: 25,
          duration: 5,
          description: '+25% revenus commerciaux',
        },
        {
          type: 'resource_gain',
          target: 'triggered_player',
          resource: 'influence',
          amount: 3,
          description: '+3 influence (prestige marchand)',
        },
      ],
      icon: 'route',
    }),
  },
  {
    type: 'cartographic_find',
    baseProbability: 0.04,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Trouvaille cartographique',
      description: 'Une ancienne carte révèle des zones inexplorées.',
      duration: 0,
      effects: [
        {
          type: 'reveal_tiles',
          target: 'triggered_player',
          description: 'Révèle une zone de la carte',
        },
        {
          type: 'science_bonus',
          target: 'triggered_player',
          amount: 10,
          description: '+10 science (connaissances géographiques)',
        },
      ],
      icon: 'map',
    }),
  },
  {
    type: 'legendary_artifact',
    baseProbability: 0.02,
    conditions: [(s) => s.currentTurn > 15],
    generateEvent: (state) => ({
      name: 'Artefact légendaire',
      description: 'Un objet de grande puissance est découvert dans les ruines.',
      duration: 0,
      effects: [
        {
          type: 'science_bonus',
          target: 'triggered_player',
          amount: 20,
          description: '+20 science',
        },
        {
          type: 'culture_bonus',
          target: 'triggered_player',
          amount: 15,
          description: '+15 culture',
        },
        {
          type: 'victory_points',
          target: 'triggered_player',
          amount: 2,
          description: '+2 VP (artefact légendaire)',
        },
      ],
      icon: 'artifact',
    }),
  },

  // ── MALADIES ───────────────────────────────────────────────
  {
    type: 'plague_major',
    baseProbability: 0.02,
    conditions: [(s) => s.currentTurn > 20],
    generateEvent: (state) => ({
      name: 'Grande épidémie',
      description: 'Une épidémie dévastatrice frappe durement la population.',
      duration: 5,
      effects: [
        {
          type: 'unit_damage',
          target: 'all_players',
          amount: 40,
          description: '-40 HP toutes unités',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          percentage: -35,
          duration: 5,
          description: "-35% production (manque de main-d'oeuvre)",
        },
      ],
      choices: [
        {
          id: 'quarantine',
          label: 'Mettre en quarantaine (5 medicine)',
          description: '',
          cost: { medicine: 5 },
          effects: [
            {
              type: 'production_modifier',
              target: 'triggered_player',
              percentage: 20,
              duration: 3,
              description: 'Réduit la propagation',
            },
          ],
        },
      ],
      icon: 'plague_major',
    }),
  },
  {
    type: 'famine',
    baseProbability: 0.03,
    conditions: [(s) => s.season === 'winter' || s.season === 'autumn'],
    generateEvent: (state) => ({
      name: 'Famine',
      description: "Les réserves alimentaires s'épuisent, la population souffre.",
      duration: 4,
      effects: [
        {
          type: 'production_modifier',
          target: 'all_players',
          resource: 'wheat',
          percentage: -60,
          duration: 4,
          description: '-60% blé',
        },
        {
          type: 'unit_damage',
          target: 'all_players',
          amount: 15,
          description: '-15 HP (malnutrition)',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          percentage: -20,
          duration: 4,
          description: '-20% toute production',
        },
      ],
      choices: [
        {
          id: 'distribute_food',
          label: 'Distribuer les réserves (8 bread)',
          description: '',
          cost: { bread: 8 },
          effects: [
            {
              type: 'production_modifier',
              target: 'triggered_player',
              percentage: 25,
              duration: 2,
              description: 'Maintient la production',
            },
          ],
        },
      ],
      icon: 'famine',
    }),
  },

  // ── MYTHIQUE ───────────────────────────────────────────────
  {
    type: 'dragon_attack',
    baseProbability: 0.01,
    conditions: [(s) => s.currentTurn > 30],
    generateEvent: (state) => ({
      name: 'Attaque de dragon',
      description: 'Un dragon légendaire ravage une région entière !',
      duration: 0,
      effects: [
        {
          type: 'tile_destruction',
          target: 'affected_tiles',
          description: 'Incendie plusieurs tuiles',
        },
        {
          type: 'unit_damage',
          target: 'affected_tiles',
          amount: 80,
          description: '-80 HP unités dans la zone',
        },
        {
          type: 'production_modifier',
          target: 'all_players',
          percentage: -25,
          duration: 5,
          description: '-25% production (terreur)',
        },
      ],
      choices: [
        {
          id: 'slay_dragon',
          label: 'Partir à la chasse au dragon',
          description: '',
          cost: {},
          effects: [
            {
              type: 'victory_points',
              target: 'triggered_player',
              amount: 2,
              description: '+2 VP (héros légendaire)',
            },
            {
              type: 'culture_bonus',
              target: 'triggered_player',
              amount: 20,
              description: '+20 culture',
            },
          ],
        },
      ],
      icon: 'dragon',
    }),
  },
  {
    type: 'divine_blessing',
    baseProbability: 0.03,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: 'Bénédiction divine',
      description: 'Les dieux sourient à votre civilisation.',
      duration: 3,
      effects: [
        {
          type: 'production_modifier',
          target: 'specific_player',
          percentage: 20,
          duration: 3,
          description: '+20% toute production',
        },
        {
          type: 'resource_gain',
          target: 'specific_player',
          resource: 'faith',
          amount: 10,
          description: '+10 foi',
        },
        {
          type: 'culture_bonus',
          target: 'specific_player',
          amount: 10,
          description: '+10 culture',
        },
      ],
      icon: 'blessing',
    }),
  },
  {
    type: 'oracle_vision',
    baseProbability: 0.03,
    conditions: [() => true],
    generateEvent: (state) => ({
      name: "Vision de l'oracle",
      description: "L'oracle prédit les événements à venir.",
      duration: 0,
      effects: [
        {
          type: 'science_bonus',
          target: 'triggered_player',
          amount: 8,
          description: '+8 science (prévoyance)',
        },
        {
          type: 'culture_bonus',
          target: 'triggered_player',
          amount: 5,
          description: '+5 culture (réputation oraculaire)',
        },
      ],
      icon: 'oracle',
    }),
  },

  // ── QUÊTES ─────────────────────────────────────────────────
  {
    type: 'quest_exploration',
    baseProbability: 0.05,
    conditions: [(s) => s.currentTurn <= 20],
    generateEvent: (state) => ({
      name: 'Quête : Terra incognita',
      description: "Une zone mystérieuse attend d'être explorée.",
      duration: 5,
      effects: [],
      choices: [
        {
          id: 'explore',
          label: 'Envoyer une expédition',
          description: '',
          cost: {},
          effects: [
            {
              type: 'reveal_tiles',
              target: 'triggered_player',
              description: 'Révèle la zone mystérieuse',
            },
            {
              type: 'science_bonus',
              target: 'triggered_player',
              amount: 12,
              description: '+12 science (exploration)',
            },
            {
              type: 'resource_gain',
              target: 'triggered_player',
              resource: 'gold',
              amount: 4,
              description: '+4 or (trésors)',
            },
          ],
        },
      ],
      icon: 'quest',
    }),
  },
  {
    type: 'quest_craft',
    baseProbability: 0.04,
    conditions: [(s) => s.currentTurn > 15],
    generateEvent: (state) => ({
      name: "Quête : Forger l'arme légendaire",
      description: 'Des forgerons maîtres proposent de créer une arme légendaire.',
      duration: 5,
      choices: [
        {
          id: 'craft_weapon',
          label: "Forger l'arme légendaire (5 steel, 3 gems)",
          description: '',
          cost: { steel: 5, gems: 3 },
          effects: [
            {
              type: 'victory_points',
              target: 'triggered_player',
              amount: 2,
              description: '+2 VP (artefact forgé)',
            },
            {
              type: 'culture_bonus',
              target: 'triggered_player',
              amount: 12,
              description: '+12 culture (renommée artisanale)',
            },
          ],
        },
      ],
      effects: [],
      icon: 'craft',
    }),
  },
];

// ============================================================
// COOLDOWNS PAR TYPE D'ÉVÉNEMENT (en tours)
// ============================================================

const EVENT_COOLDOWNS: Partial<Record<EventType, number>> = {
  drought: 8,
  flood: 6,
  volcano_eruption: 12,
  earthquake: 10,
  forest_fire: 6,
  blizzard: 4,
  tsunami: 15,
  meteor_impact: 30,
  plague_minor: 5,
  plague_major: 10,
  black_death: 20,
  famine: 8,
  market_crash: 10,
  gold_rush: 8,
  trade_boom: 6,
  dragon_attack: 20,
  sea_monster: 12,
  rebellion: 5,
  revolution: 10,
  succession_crisis: 8,
};

// Chaînes d'événements : si l'événement A se produit et n'est pas traité,
// il peut déclencher l'événement B après N tours
const EVENT_CHAINS: Partial<
  Record<EventType, { nextType: EventType; probability: number; delayTurns: number }>
> = {
  plague_minor: { nextType: 'plague_major', probability: 0.4, delayTurns: 3 },
  plague_major: { nextType: 'black_death', probability: 0.25, delayTurns: 4 },
  drought: { nextType: 'famine', probability: 0.35, delayTurns: 3 },
  rebellion: { nextType: 'revolution', probability: 0.3, delayTurns: 4 },
  flood: { nextType: 'famine', probability: 0.2, delayTurns: 4 },
  forest_fire: { nextType: 'drought', probability: 0.25, delayTurns: 3 },
};

// ============================================================
// MOTEUR DE DÉCLENCHEMENT
// ============================================================

export function generateEventsForTurn(state: GameState): GameEvent[] {
  const newEvents: GameEvent[] = [];
  // BUG FIX: compteur local au lieu du compteur module-level (non-sérialisable)
  let localSeq = 0;

  // 1. Vérifier les chaînes d'événements en attente
  for (const activeEvent of state.activeEvents) {
    const chain = EVENT_CHAINS[activeEvent.type];
    if (!chain) continue;

    const chainTriggerTurn = activeEvent.triggeredTurn + chain.delayTurns;
    if (state.currentTurn < chainTriggerTurn) continue;

    // Ne déclencher que si l'événement parent n'a pas été résolu par un choix
    const wasHandled = state.eventHistory.some(
      (e) =>
        e.id === activeEvent.id && (e as GameEvent & { choiceId?: string }).choiceId !== undefined,
    );
    if (wasHandled) continue;

    // Probabilité de chaîne
    if (randomFloat(0, 1) > chain.probability) continue;
    if (state.activeEvents.some((e) => e.type === chain.nextType)) continue;
    if ((state.eventCooldowns[chain.nextType] ?? 0) > state.currentTurn) continue;

    const chainTemplate = EVENT_TEMPLATES.find((t) => t.type === chain.nextType);
    if (!chainTemplate) continue;

    const partial = chainTemplate.generateEvent(state);
    const chainEvent: GameEvent = {
      id: `event_${chain.nextType}_chain_t${state.currentTurn}_${localSeq++}`,
      type: chain.nextType,
      category: categorizeEvent(chain.nextType),
      severity: 'major',
      scope: partial.scope ?? 'global',
      name: `${partial.name ?? chain.nextType} (suite de ${activeEvent.name})`,
      description: partial.description ?? '',
      flavorText: `Déclenché par l'événement : ${activeEvent.name}`,
      triggeredTurn: state.currentTurn,
      duration: partial.duration ?? 2,
      effects: partial.effects ?? [],
      choices: partial.choices,
      probability: chain.probability,
      conditions: [],
      icon: partial.icon ?? 'default',
    };
    newEvents.push(chainEvent);

    // Appliquer cooldown
    const cooldown = EVENT_COOLDOWNS[chain.nextType];
    if (cooldown) {
      state.eventCooldowns[chain.nextType] = state.currentTurn + cooldown;
    }
  }

  // 2. Événements normaux
  for (const template of EVENT_TEMPLATES) {
    // Vérifier cooldown
    const cooldownUntil = state.eventCooldowns[template.type] ?? 0;
    if (cooldownUntil > state.currentTurn) continue;

    // Vérifier toutes les conditions
    const conditionsMet = template.conditions.every((cond) => cond(state));
    if (!conditionsMet) continue;

    // Probabilité ajustée par difficulté
    const adjustedProb = template.baseProbability * state.config.difficultyModifier;
    if (randomFloat(0, 1) > adjustedProb) continue;

    // Ne pas dédoubler le même type d'événement actif
    if (state.activeEvents.some((e) => e.type === template.type)) continue;
    if (newEvents.some((e) => e.type === template.type)) continue;

    const partial = template.generateEvent(state);
    const event: GameEvent = {
      id: `event_${template.type}_t${state.currentTurn}_${localSeq++}`,
      type: template.type,
      category: categorizeEvent(template.type),
      severity: partial.severity ?? 'minor',
      scope: partial.scope ?? 'global',
      name: partial.name ?? template.type,
      description: partial.description ?? '',
      flavorText: partial.flavorText ?? '',
      triggeredTurn: state.currentTurn,
      duration: partial.duration ?? 1,
      targetTiles: partial.targetTiles,
      targetPlayers: partial.targetPlayers,
      effects: partial.effects ?? [],
      choices: partial.choices,
      followUpType: template.followUp?.eventType,
      followUpProbability: template.followUp?.probability,
      followUpDelayTurns: template.followUp?.delayTurns,
      probability: template.baseProbability,
      conditions: [],
      icon: partial.icon ?? 'default',
    };

    // Appliquer cooldown
    const cooldown = EVENT_COOLDOWNS[template.type] ?? template.cooldownTurns;
    if (cooldown) {
      state.eventCooldowns[template.type] = state.currentTurn + cooldown;
    }

    newEvents.push(event);
  }

  return newEvents;
}

/**
 * Enregistre le choix d'un joueur pour un événement dans l'historique.
 */
export function recordEventChoice(
  state: GameState,
  eventId: string,
  playerId: string,
  choiceId: string,
): void {
  // Trouver et mettre à jour l'événement actif
  const event = state.activeEvents.find((e) => e.id === eventId);
  if (!event) return;

  // Logger l'action
  state.actionLog.push({
    id: `log_choice_${eventId}_${state.currentTurn}`,
    turn: state.currentTurn,
    playerId,
    type: 'event_choice',
    description: `Choix '${choiceId}' pour l'événement '${event.name}'`,
    data: { eventId, choiceId },
    timestamp: now(),
  });

  // Déplacer vers l'historique avec le choix enregistré
  state.eventHistory.push({ ...event, followUp: choiceId } as GameEvent);
  state.activeEvents = state.activeEvents.filter((e) => e.id !== eventId);
}

// ============================================================
// APPLICATION DES EFFETS
// ============================================================

export function applyEventEffects(event: GameEvent, state: GameState, choiceId?: string): void {
  const effectsToApply = choiceId
    ? (event.choices?.find((c) => c.id === choiceId)?.effects ?? event.effects)
    : event.effects;

  for (const effect of effectsToApply) {
    const targets = resolveTargets(effect.target, event, state);

    for (const player of targets) {
      applyEffectToPlayer(effect, player, event, state);
    }
  }
}

function resolveTargets(
  target: EventEffect['target'],
  event: GameEvent,
  state: GameState,
): Player[] {
  switch (target) {
    case 'all_players':
      return [...state.players.values()].filter((p) => !p.isEliminated);

    case 'triggered_player': {
      const active = state.players.get(state.turnOrder[state.currentPlayerIndex]);
      return active ? [active] : [];
    }

    case 'specific_player':
      return (event.targetPlayers ?? [])
        .map((id) => state.players.get(id))
        .filter((p): p is Player => p !== undefined);

    case 'affected_tiles':
      // Joueurs qui ont des tuiles dans la zone
      return [...state.players.values()].filter((p) =>
        (event.targetTiles ?? []).some((tileId) => state.map.get(tileId)?.owner === p.id),
      );

    default:
      return [];
  }
}

function applyEffectToPlayer(
  effect: EventEffect,
  player: Player,
  event: GameEvent,
  state: GameState,
): void {
  const moderatedReward = (amount: number): number => {
    const pacing = state.config.pacingPreset ?? 'dynamic';
    if (pacing === 'tabletop') return Math.max(1, Math.round(amount * 0.75));
    if (pacing === 'epic') return Math.max(1, Math.round(amount * 0.6));
    return amount;
  };

  switch (effect.type) {
    case 'resource_gain':
      if (effect.resource && effect.amount) {
        player.resources = addResources(player.resources, {
          [effect.resource]: moderatedReward(effect.amount),
        });
      }
      break;

    case 'resource_loss':
      if (effect.resource && effect.amount) {
        player.resources = subtractResources(player.resources, {
          [effect.resource]: Math.min(
            effect.amount,
            player.resources[effect.resource as keyof typeof player.resources] ?? 0,
          ),
        });
      }
      break;

    case 'science_bonus':
      player.researchProgress += effect.amount ? moderatedReward(effect.amount) : 0;
      break;

    case 'culture_bonus':
      player.resources.culture =
        (player.resources.culture ?? 0) + (effect.amount ? moderatedReward(effect.amount) : 0);
      break;

    case 'faith_bonus':
      player.resources.faith =
        (player.resources.faith ?? 0) + (effect.amount ? moderatedReward(effect.amount) : 0);
      break;

    case 'victory_points':
      player.stats.victoryPoints += effect.amount ?? 0;
      player.stats.vpBreakdown.objectives += effect.amount ?? 0;
      break;

    case 'production_modifier':
      // Ajouter un modificateur temporaire sur toutes les tuiles du joueur
      if (effect.duration && effect.percentage) {
        for (const tileId of player.ownedTiles) {
          const tile = state.map.get(tileId);
          if (!tile) continue;
          tile.modifiers.push({
            type: 'production',
            resource: effect.resource,
            value: effect.percentage,
            source: `event_${event.id}`,
            expires: state.currentTurn + effect.duration,
          });
        }
      }
      break;

    case 'unit_damage':
      for (const unitId of player.units) {
        const unit = state.units.get(unitId);
        if (unit) {
          unit.stats.currentHealth = Math.max(1, unit.stats.currentHealth - (effect.amount ?? 0));
        }
      }
      break;

    default:
      break;
  }
}

// ============================================================
// NETTOYAGE DES ÉVÉNEMENTS EXPIRÉS
// ============================================================

export function cleanupExpiredEvents(state: GameState): void {
  // Retirer les modificateurs temporaires expirés
  for (const [, tile] of state.map) {
    tile.modifiers = tile.modifiers.filter(
      (m) => m.expires === undefined || m.expires > state.currentTurn,
    );
  }

  // Retirer les événements actifs expirés
  state.activeEvents = state.activeEvents.filter(
    (e) => e.duration === 0 || e.triggeredTurn + e.duration > state.currentTurn,
  );
}

// ============================================================
// HELPERS
// ============================================================

function categorizeEvent(type: EventType): GameEvent['category'] {
  const categories: Record<EventType, GameEvent['category']> = {
    volcano_eruption: 'natural_disaster',
    earthquake: 'natural_disaster',
    flood: 'natural_disaster',
    drought: 'natural_disaster',
    blizzard: 'natural_disaster',
    forest_fire: 'natural_disaster',
    tsunami: 'natural_disaster',
    landslide: 'natural_disaster',
    meteor_impact: 'natural_disaster',
    harsh_winter: 'seasonal',
    good_harvest: 'seasonal',
    heavy_rains: 'weather',
    golden_summer: 'seasonal',
    storm: 'weather',
    rebellion: 'political',
    revolution: 'political',
    succession_crisis: 'political',
    trade_embargo: 'economic',
    diplomatic_incident: 'political',
    spy_caught: 'political',
    betrayal: 'political',
    coronation: 'political',
    council_vote: 'political',
    migration: 'political',
    gold_rush: 'economic',
    market_crash: 'economic',
    trade_boom: 'economic',
    resource_depletion: 'economic',
    new_deposit: 'economic',
    piracy: 'economic',
    bandit_raid: 'military',
    mercenary_offer: 'military',
    arms_race: 'military',
    war_weariness: 'military',
    desertion: 'military',
    ambush: 'military',
    siege_lifted: 'military',
    miracle: 'religious',
    heresy: 'religious',
    crusade: 'religious',
    pilgrimage: 'religious',
    inquisition: 'religious',
    prophecy: 'religious',
    ancient_ruins_found: 'discovery',
    new_route: 'discovery',
    cartographic_find: 'discovery',
    scientific_breakthrough: 'discovery',
    legendary_artifact: 'discovery',
    plague_minor: 'plague',
    plague_major: 'plague',
    black_death: 'plague',
    famine: 'plague',
    dragon_attack: 'mythical',
    sea_monster: 'mythical',
    oracle_vision: 'mythical',
    ancient_curse: 'mythical',
    divine_blessing: 'mythical',
    quest_exploration: 'quest',
    quest_rescue: 'quest',
    quest_craft: 'quest',
    quest_diplomacy: 'quest',
    quest_defeat_enemy: 'quest',
  };
  return categories[type] ?? 'political';
}

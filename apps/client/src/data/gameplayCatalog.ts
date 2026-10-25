import { BuildingId } from '@catanx/engine';
import { UnitType } from '@catanx/engine';
import { ResourceBundle, ResourceType } from '@catanx/engine';

export interface BuildOption {
  id: BuildingId;
  label: string;
  description: string;
  cost: ResourceBundle;
}

export const BUILD_OPTIONS: BuildOption[] = [
  {
    id: 'road',
    label: 'Route',
    description: 'Améliore la mobilité locale.',
    cost: { wood: 1, clay: 1 },
  },
  {
    id: 'settlement',
    label: 'Village',
    description: 'Point d’ancrage territorial.',
    cost: { wood: 1, clay: 1, wheat: 1, sheep: 1 },
  },
  {
    id: 'city',
    label: 'Ville',
    description: 'Amélioration du village avec bonus de production.',
    cost: { ore: 3, wheat: 2 },
  },
  {
    id: 'metropolis',
    label: 'Métropole',
    description: 'Centre urbain majeur et défensif.',
    cost: { ore: 5, wheat: 3, stone: 2 },
  },
  {
    id: 'farm',
    label: 'Ferme',
    description: 'Production agricole renforcée.',
    cost: { wood: 1, clay: 1 },
  },
  {
    id: 'mine',
    label: 'Mine',
    description: 'Extraction de minerai et pierre.',
    cost: { wood: 2, stone: 1 },
  },
  {
    id: 'market',
    label: 'Marché',
    description: 'Accès commercial amélioré.',
    cost: { wood: 2, clay: 1 },
  },
  {
    id: 'library',
    label: 'Bibliothèque',
    description: 'Production scientifique.',
    cost: { wood: 3, wheat: 1 },
  },
  {
    id: 'barracks',
    label: 'Caserne',
    description: 'Formation d’unités militaires.',
    cost: { wood: 2, stone: 1, iron: 1 },
  },
  {
    id: 'wall',
    label: 'Muraille',
    description: 'Renforce la défense locale.',
    cost: { stone: 3, clay: 2 },
  },
  {
    id: 'harbor',
    label: 'Port',
    description: 'Débloque les échanges maritimes.',
    cost: { wood: 3, stone: 1 },
  },
  {
    id: 'temple',
    label: 'Temple',
    description: 'Source de foi et de stabilité.',
    cost: { stone: 3, gold: 1 },
  },
];

export const BUILD_OPTIONS_BY_ID = Object.fromEntries(
  BUILD_OPTIONS.map((option) => [option.id, option]),
) as Record<BuildingId, BuildOption>;

export function getBuildCost(buildingId: BuildingId): ResourceBundle {
  return BUILD_OPTIONS_BY_ID[buildingId]?.cost ?? {};
}

export interface RecruitOption {
  type: UnitType;
  label: string;
  description: string;
  cost: ResourceBundle;
}

export const RECRUIT_OPTIONS: RecruitOption[] = [
  {
    type: 'worker',
    label: 'Ouvrier',
    description: 'Soutien et développement.',
    cost: { wheat: 1, wood: 1 },
  },
  {
    type: 'explorer',
    label: 'Éclaireur',
    description: 'Vision longue portée.',
    cost: { sheep: 1, wood: 1 },
  },
  {
    type: 'warrior',
    label: 'Guerrier',
    description: 'Infanterie de base.',
    cost: { wood: 1, ore: 1 },
  },
  {
    type: 'spearman',
    label: 'Lancier',
    description: 'Défense anti-cavalerie.',
    cost: { wood: 1, ore: 1, clay: 1 },
  },
  {
    type: 'archer',
    label: 'Archer',
    description: 'Attaque à distance.',
    cost: { wood: 1, sheep: 1, ore: 1 },
  },
  {
    type: 'swordsman',
    label: 'Épéiste',
    description: 'Unité offensive fiable.',
    cost: { ore: 2, wheat: 1 },
  },
];

export const RECRUIT_OPTIONS_BY_TYPE = Object.fromEntries(
  RECRUIT_OPTIONS.map((option) => [option.type, option]),
) as Record<UnitType, RecruitOption>;

export function getRecruitCost(unitType: UnitType): ResourceBundle {
  return RECRUIT_OPTIONS_BY_TYPE[unitType]?.cost ?? {};
}

export const MARKET_RESOURCES: ResourceType[] = [
  'wood',
  'clay',
  'wheat',
  'sheep',
  'ore',
  'stone',
  'coal',
  'gold',
  'fish',
  'spice',
  'water',
  'herbs',
  'iron',
  'coins',
];

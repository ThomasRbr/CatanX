// ============================================================
// TYPES HEXAGONAUX — Système de coordonnées cube
// ============================================================

import { ResourceBundle } from './resources';

export interface CubeCoord {
  q: number; // axe horizontal
  r: number; // axe diagonal haut-droite
  s: number; // axe diagonal haut-gauche (toujours q+r+s=0)
}

export interface OffsetCoord {
  col: number;
  row: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

export type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;

export const HEX_DIRECTIONS: CubeCoord[] = [
  { q: 1, r: 0, s: -1 }, // 0 : Est
  { q: 1, r: -1, s: 0 }, // 1 : Nord-Est
  { q: 0, r: -1, s: 1 }, // 2 : Nord-Ouest
  { q: -1, r: 0, s: 1 }, // 3 : Ouest
  { q: -1, r: 1, s: 0 }, // 4 : Sud-Ouest
  { q: 0, r: 1, s: -1 }, // 5 : Sud-Est
];

export const HEX_DIAGONALS: CubeCoord[] = [
  { q: 2, r: -1, s: -1 },
  { q: 1, r: -2, s: 1 },
  { q: -1, r: -1, s: 2 },
  { q: -2, r: 1, s: 1 },
  { q: -1, r: 2, s: -1 },
  { q: 1, r: 1, s: -2 },
];

// ============================================================
// TERRAIN & TUILES
// ============================================================

export type TerrainType =
  | 'plains' // Plaines — blé
  | 'forest' // Forêt — bois
  | 'mountain' // Montagne — minerai
  | 'hill' // Colline — argile
  | 'pasture' // Pâturage — mouton
  | 'desert' // Désert — rien, butte du brigand
  | 'coast' // Côte — pas de production terrestre
  | 'ocean' // Mer — navigation
  | 'river' // Rivière — blé (vallée)
  | 'swamp' // Marécage — argile
  | 'volcano' // Volcan — minerai
  | 'tundra' // Toundra — mouton
  | 'jungle' // Jungle — bois
  | 'goldmine' // Mine d'or — minerai (sans industrie)
  | 'sacred' // Terre sacrée — pas de carte ressource
  | 'ruins' // Ruines — minerai
  | 'glacier' // Glacier — bloque routes, pas de production
  | 'lake'; // Lac — blé (rives)

export type ElevationType = 'sea' | 'lowland' | 'midland' | 'highland' | 'peak';

export type ClimateZone = 'arctic' | 'temperate' | 'mediterranean' | 'tropical' | 'arid';

export interface HexTile {
  id: string;
  coord: CubeCoord;
  terrain: TerrainType;
  elevation: ElevationType;
  climate: ClimateZone;
  diceValue: number | null; // 2-12, null pour ocean/desert
  baseProduction: ResourceBundle;
  modifiers: TileModifier[];
  features: TileFeature[];
  buildings: string[]; // IDs des bâtiments sur cette tuile
  units: string[]; // IDs des unités présentes
  owner: string | null; // ID du joueur propriétaire
  explored: Set<string>; // IDs des joueurs ayant exploré
  visible: Set<string>; // IDs des joueurs voyant actuellement
  river: boolean;
  road: string | null; // ID du joueur ayant construit route
  port: PortType | null;
  robber: boolean;
  volcano_active: boolean;
  fertility: number; // 0-100, affecte production agricole
  pollution: number; // 0-100, réduit production
}

export type TileFeature =
  | 'ancient_ruins' // +1 tech point quand exploré
  | 'sacred_spring' // +production eau
  | 'natural_harbor' // bonus commerce
  | 'ancient_road' // réduction coût route
  | 'gold_vein' // production or bonus
  | 'fertile_soil' // +production agricole
  | 'iron_deposit' // +production minerai
  | 'dense_forest' // +production bois, -déplacement
  | 'cave_system' // permet construction mine avancée
  | 'watchtower_site' // bonus défense si tour construite
  | 'trade_post' // ancien poste commercial, bonus commerce
  | 'dragon_lair' // event possible, trésor
  | 'plague_grounds'; // malus santé si non traité

export interface TileModifier {
  type: 'production' | 'defense' | 'movement' | 'culture' | 'faith';
  resource?: string;
  value: number;
  source: string; // ID de la source (bâtiment, tech, event...)
  expires?: number; // tour d'expiration, undefined = permanent
}

export type PortType =
  | 'generic_3:1'
  | 'wood_2:1'
  | 'ore_2:1'
  | 'wheat_2:1'
  | 'sheep_2:1'
  | 'clay_2:1'
  /** @deprecated Legacy — or non produit par les terrains ; normalisé en 3:1. */
  | 'gold_2:1'
  /** @deprecated Legacy — poisson non produit ; normalisé en 3:1. */
  | 'fish_2:1'
  /** @deprecated Legacy — épices non produites ; normalisé en 3:1. */
  | 'spice_2:1';

/** Ports réellement jouables (5 ressources classiques + générique). */
export const PLAYABLE_PORT_TYPES: readonly PortType[] = [
  'generic_3:1',
  'wood_2:1',
  'ore_2:1',
  'wheat_2:1',
  'sheep_2:1',
  'clay_2:1',
] as const;

/**
 * Remplace les ports 2:1 d’or / poisson / épices (jamais produits par la carte)
 * par un port générique 3:1.
 */
export function normalizePortType(port: PortType | null | undefined): PortType | null {
  if (!port) return null;
  if (port === 'gold_2:1' || port === 'fish_2:1' || port === 'spice_2:1') {
    return 'generic_3:1';
  }
  return port;
}
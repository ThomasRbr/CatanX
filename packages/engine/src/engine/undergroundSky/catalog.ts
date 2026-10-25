/**
 * Catalogue Souterrain & Ciel — poids, géologie, coûts.
 */

import type { ResourceBundle, ResourceType } from '../../types/resources';
import type {
  SkySiteKind,
  UndergroundDiscoveryKind,
  UndergroundGeologyCategory,
  UndergroundSkyMaterialBundle,
} from '../../types/undergroundSky';

export const US_DISCOVERY_WEIGHTS: Record<UndergroundDiscoveryKind, number> = {
  fossil_roots: 9,
  clay_bank: 9,
  fungiculture: 9,
  woolly_lichen: 9,
  iron_vein: 9,
  crystal_geode: 16,
  aether_breath: 8,
  thermal_spring: 8,
  natural_well: 8,
  ancient_workshop: 6,
  sealed_chamber: 5,
  unstable_fault: 4,
};

export const US_SKY_SITE_WEIGHTS: Record<SkySiteKind, number> = {
  calm_mooring: 20,
  aether_source: 20,
  floating_garden: 15,
  wind_bazaar: 15,
  observatory: 10,
  hanging_ruins: 10,
  turbulent_zone: 10,
};

export const US_DISCOVERY_GEOLOGY: Record<
  UndergroundDiscoveryKind,
  UndergroundGeologyCategory
> = {
  fossil_roots: 'production',
  clay_bank: 'production',
  fungiculture: 'production',
  woolly_lichen: 'production',
  iron_vein: 'production',
  crystal_geode: 'production',
  aether_breath: 'production',
  thermal_spring: 'production',
  natural_well: 'special',
  ancient_workshop: 'special',
  sealed_chamber: 'special',
  unstable_fault: 'danger',
};

/** Découvertes qui reçoivent un jeton numérique (production au lancer). */
export const US_PRODUCTION_DISCOVERIES: readonly UndergroundDiscoveryKind[] = [
  'fossil_roots',
  'clay_bank',
  'fungiculture',
  'woolly_lichen',
  'iron_vein',
  'crystal_geode',
  'aether_breath',
  'thermal_spring',
] as const;

export type UsClassicProduction = ResourceType | 'us_crystal' | 'us_aether';

export const US_DISCOVERY_OUTPUT: Partial<
  Record<UndergroundDiscoveryKind, UsClassicProduction>
> = {
  fossil_roots: 'wood',
  clay_bank: 'clay',
  fungiculture: 'wheat',
  woolly_lichen: 'sheep',
  iron_vein: 'ore',
  crystal_geode: 'us_crystal',
  aether_breath: 'us_aether',
};

export interface UsPieceCost {
  resources: ResourceBundle;
  materials: UndergroundSkyMaterialBundle;
}

export const US_BUILD_COSTS = {
  shaft: { resources: { clay: 1, ore: 2 }, materials: {} },
  survey: { resources: { wheat: 1 }, materials: {} },
  tunnel: { resources: { wood: 1, clay: 1 }, materials: {} },
  outpost: { resources: { wood: 1, wheat: 1, ore: 1 }, materials: {} },
  extractor: {
    resources: { wheat: 1, ore: 1 },
    materials: { us_crystal: 1 },
  },
  lift: { resources: { clay: 2 }, materials: { us_crystal: 1 } },
  airport: { resources: { wood: 1, sheep: 1, ore: 2 }, materials: {} },
  airship: { resources: { wood: 1, sheep: 2, ore: 1 }, materials: {} },
  beacon: { resources: { ore: 1 }, materials: { us_aether: 1 } },
  ether_sails: { resources: { sheep: 1 }, materials: { us_aether: 1 } },
  reinforced_hold: { resources: { wood: 1 }, materials: { us_crystal: 1 } },
} as const satisfies Record<string, UsPieceCost>;

export type UsBuildKind = keyof typeof US_BUILD_COSTS;

/** Jetons souterrains : 3–11 sans 7. */
export const US_NUMBER_TOKENS: readonly number[] = [
  3, 4, 5, 6, 8, 9, 10, 11,
] as const;

export function pickWeighted<T extends string>(
  weights: Record<T, number>,
  roll01: number,
): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let cursor = Math.max(0, Math.min(0.999999, roll01)) * total;
  for (const [key, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return key;
  }
  return entries[entries.length - 1]![0];
}

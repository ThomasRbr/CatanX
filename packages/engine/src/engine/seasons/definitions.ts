/**
 * Saisons V2 — douze climats, trois par saison.
 *
 * Une carte contient toujours :
 * - deux ressources d’abondance (règle universelle +1) ;
 * - exactement une contrainte climatique ;
 * - une sévérité publique.
 *
 * Les climats « seuil −1 » ajoutent un bonus généreux (1ʳᵉ abondance +2).
 *
 * Les interactions C&K émergent de l’économie commune. Aucun climat ne
 * modifie directement les chevaliers ou la flotte barbare.
 */

import type { SeasonClimateDefinition, SeasonClimateId } from '../../types/seasons';
import type { Season } from '../../types/events';

export const SEASON_CLIMATE_DEFINITIONS: readonly SeasonClimateDefinition[] = [
  {
    id: 'spring_gentle_renewal',
    season: 'spring',
    severity: 'standard',
    favoredResources: ['sheep', 'wheat'],
    effects: [
      { kind: 'hand_limit_delta', delta: -1 },
      { kind: 'generous_abundance_once' },
    ],
    labelFr: 'Renouveau doux',
    summaryFr: 'Mouton et Blé abondants · 1ʳᵉ abondance +2 · seuil de main −1.',
  },
  {
    id: 'spring_great_thaw',
    season: 'spring',
    severity: 'standard',
    favoredResources: ['clay', 'wheat'],
    effects: [{ kind: 'all_build_cost_delta', building: 'road', resource: 'clay', delta: 1 }],
    labelFr: 'Grand dégel',
    summaryFr: 'Argile et Blé abondants · routes +1 Argile.',
  },
  {
    id: 'spring_floods',
    season: 'spring',
    severity: 'severe',
    favoredResources: ['wheat', 'wood'],
    effects: [{ kind: 'city_production_penalty', resources: ['clay'], amount: 2 }],
    labelFr: 'Crues printanières',
    summaryFr: 'Blé et Bois abondants · villes : −2 Argile produite.',
  },
  {
    id: 'summer_golden',
    season: 'summer',
    severity: 'standard',
    favoredResources: ['wheat', 'ore'],
    effects: [
      { kind: 'hand_limit_delta', delta: -1 },
      { kind: 'generous_abundance_once' },
    ],
    labelFr: 'Été doré',
    summaryFr: 'Blé et Minerai abondants · 1ʳᵉ abondance +2 · seuil de main −1.',
  },
  {
    id: 'summer_hot_storms',
    season: 'summer',
    severity: 'standard',
    favoredResources: ['wood', 'ore'],
    effects: [{ kind: 'all_build_cost_delta', building: 'road', resource: 'wood', delta: 1 }],
    labelFr: 'Orages chauds',
    summaryFr: 'Bois et Minerai abondants · routes +1 Bois.',
  },
  {
    id: 'summer_drought',
    season: 'summer',
    severity: 'severe',
    favoredResources: ['clay', 'ore'],
    effects: [{ kind: 'city_production_penalty', resources: ['wheat', 'sheep'], amount: 2 }],
    labelFr: 'Grande sécheresse',
    summaryFr: 'Argile et Minerai abondants · villes : −2 Blé et Mouton produits.',
  },
  {
    id: 'autumn_golden_harvest',
    season: 'autumn',
    severity: 'standard',
    favoredResources: ['wheat', 'wood'],
    effects: [
      { kind: 'hand_limit_delta', delta: -1 },
      { kind: 'generous_abundance_once' },
    ],
    labelFr: 'Moisson dorée',
    summaryFr: 'Blé et Bois abondants · 1ʳᵉ abondance +2 · seuil de main −1.',
  },
  {
    id: 'autumn_great_fairs',
    season: 'autumn',
    severity: 'standard',
    favoredResources: ['sheep', 'clay'],
    effects: [{ kind: 'generic_port_ratio', ratio: 4 }],
    labelFr: 'Grandes foires',
    summaryFr: 'Mouton et Argile abondants · ports génériques à 4:1.',
  },
  {
    id: 'autumn_equinox_storm',
    season: 'autumn',
    severity: 'severe',
    favoredResources: ['wood', 'ore'],
    effects: [{ kind: 'city_production_penalty', resources: ['wood', 'ore'], amount: 2 }],
    labelFr: 'Tempête d’équinoxe',
    summaryFr: 'Bois et Minerai abondants · villes : −2 Bois et Minerai produits.',
  },
  {
    id: 'winter_clear_frost',
    season: 'winter',
    severity: 'standard',
    favoredResources: ['ore', 'wood'],
    effects: [{ kind: 'all_build_cost_delta', building: 'road', resource: 'clay', delta: 1 }],
    labelFr: 'Gel clair',
    summaryFr: 'Minerai et Bois abondants · routes +1 Argile.',
  },
  {
    id: 'winter_merchant',
    season: 'winter',
    severity: 'standard',
    favoredResources: ['wood', 'sheep'],
    effects: [{ kind: 'generic_port_ratio', ratio: 4 }],
    labelFr: 'Hiver marchand',
    summaryFr: 'Bois et Mouton abondants · ports génériques à 4:1.',
  },
  {
    id: 'winter_announced_blizzard',
    season: 'winter',
    severity: 'severe',
    favoredResources: ['wood', 'ore'],
    effects: [{ kind: 'city_production_penalty', resources: 'all_classic', amount: 2 }],
    labelFr: 'Blizzard annoncé',
    summaryFr: 'Bois et Minerai abondants · toute production des villes −2.',
  },
] as const;

const BY_ID = new Map(
  SEASON_CLIMATE_DEFINITIONS.map((definition) => [definition.id, definition] as const),
);

export function getClimateDefinition(id: SeasonClimateId): SeasonClimateDefinition {
  const definition = BY_ID.get(id);
  if (!definition) throw new Error(`Unknown Seasons V2 climate id: ${id}`);
  return definition;
}

export function isKnownClimateId(id: unknown): id is SeasonClimateId {
  return typeof id === 'string' && BY_ID.has(id as SeasonClimateId);
}

export function climatesForSeason(season: Season): SeasonClimateDefinition[] {
  return SEASON_CLIMATE_DEFINITIONS.filter((definition) => definition.season === season);
}

export function climateIdsForSeason(season: Season): SeasonClimateId[] {
  return climatesForSeason(season).map((definition) => definition.id);
}

export function isSevereClimate(id: SeasonClimateId): boolean {
  return getClimateDefinition(id).severity === 'severe';
}

/** Montant du premier bonus d’abondance « généreux », ou null si climat normal. */
export function getGenerousAbundanceOnceAmount(
  id: SeasonClimateId,
): number | null {
  for (const effect of getClimateDefinition(id).effects) {
    if (effect.kind === 'generous_abundance_once') {
      return effect.amount ?? 2;
    }
  }
  return null;
}

/** Conservé pour les intégrations existantes ; V2 ignore volontairement CK. */
export function allClimateEffects(
  id: SeasonClimateId,
  _includeCk = false,
): readonly import('../../types/seasons').SeasonRuleEffect[] {
  return getClimateDefinition(id).effects;
}

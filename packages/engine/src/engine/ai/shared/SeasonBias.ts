import type { GameState } from '../../../types/game';
import type { ResourceType } from '../../../types/resources';
import { isSeasonsEnabled } from '../../../core/extensions';
import { getClimateDefinition } from '../../seasons/definitions';

const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'] as const;

export function seasonsModuleActive(state: GameState): boolean {
  return isSeasonsEnabled(state);
}

export function currentSeasonFavorites(state: GameState): ResourceType[] {
  if (!seasonsModuleActive(state)) return [];
  const seasons = state.extensions?.seasons;
  if (seasons?.currentClimateId) {
    return [...getClimateDefinition(seasons.currentClimateId).favoredResources];
  }
  return [];
}

export function nextSeasonFavorites(state: GameState): ResourceType[] {
  if (!seasonsModuleActive(state)) return [];
  const seasons = state.extensions?.seasons;
  if (seasons?.forecastClimateId) {
    return [...getClimateDefinition(seasons.forecastClimateId).favoredResources];
  }
  const idx = SEASON_ORDER.indexOf(state.season as (typeof SEASON_ORDER)[number]);
  if (idx < 0) return [];
  return [];
}

export function isCurrentClimateSevere(state: GameState): boolean {
  const id = state.extensions?.seasons?.currentClimateId;
  if (!id) return false;
  return getClimateDefinition(id).severity === 'severe';
}

export function isForecastClimateSevere(state: GameState): boolean {
  const id = state.extensions?.seasons?.forecastClimateId;
  if (!id) return false;
  return getClimateDefinition(id).severity === 'severe';
}

/**
 * Bias placement / eval : saison actuelle > prévision ; plafond 10 %.
 * Les climats sévères n’ajoutent pas de bonus positif (anticipation seulement).
 */
export function seasonResourceBonus(
  state: GameState,
  resources: Iterable<string>,
  baseScore: number,
): number {
  if (!seasonsModuleActive(state) || baseScore <= 0) return 0;
  const current = new Set(currentSeasonFavorites(state));
  const next = new Set(nextSeasonFavorites(state));
  const severe = isCurrentClimateSevere(state);
  let hitsCurrent = 0;
  let hitsNext = 0;
  for (const r of resources) {
    if (current.has(r as ResourceType)) hitsCurrent += 1;
    if (next.has(r as ResourceType)) hitsNext += 1;
  }
  // Valoriser davantage la saison actuelle que la prévision
  const currentWeight = severe ? 0.02 : 0.07;
  const nextWeight = isForecastClimateSevere(state) ? 0.04 : 0.025;
  const raw = hitsCurrent * currentWeight * baseScore + hitsNext * nextWeight * baseScore;
  return Math.min(raw, baseScore * 0.1);
}

/** Heuristique privée de la Veillée : l'interface n'expose que l'état « prêt ». */
export function chooseSeasonPreparationForAI(
  state: GameState,
  playerId: string,
): 'harvest' | 'commerce' | 'reserve' | 'works' | 'shelter' {
  const seasons = state.extensions?.seasons;
  if (!seasons) return 'reserve';
  // Pour la prochaine préparation (ronde 5), on regarde surtout la prévision.
  const target = seasons.preparationWindowOpen
    ? getClimateDefinition(seasons.forecastClimateId)
    : getClimateDefinition(seasons.currentClimateId);
  const effects = target.effects;
  const hasRoadSurcharge = effects.some(
    (e) => e.kind === 'all_build_cost_delta' && e.building === 'road',
  );
  if (hasRoadSurcharge) return 'shelter';
  if (
    target.severity === 'severe' &&
    effects.some((effect) => effect.kind === 'city_production_penalty')
  ) {
    return 'shelter';
  }
  if (target.severity === 'severe') return 'reserve';
  if (effects.some((e) => e.kind === 'generic_port_ratio')) {
    return 'commerce';
  }
  return 'harvest';
}

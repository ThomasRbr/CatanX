import type { Season } from '@catanx/engine';
import { seasonAccents } from '../../design/tokens';

/** Pixi UIOverlay season tint colors (as CSS hex)  aligned with brand accents. */
export const SEASON_TINT_HEX: Record<Season, string> = {
  spring: seasonAccents.spring,
  summer: seasonAccents.summer,
  autumn: seasonAccents.autumn,
  winter: seasonAccents.winter,
};

/** Soft wash for strategic readability (legacy parity). */
export const SEASON_WASH_STRENGTH = 0.08;

/** Stronger living-kingdom seasonal shift (not a flat recolor). */
export const SEASON_LIVING_STRENGTH = 0.22;

export type SeasonParticleKind = 'rain' | 'fire' | 'mist' | 'snow';

export function normalizeSeason(season: string | undefined | null): Season {
  if (season === 'summer' || season === 'autumn' || season === 'winter') return season;
  return 'spring';
}

/** Pixi ParticleSystem mapping on season change. */
export function seasonParticleKind(season: string | undefined | null): SeasonParticleKind {
  const s = normalizeSeason(season);
  if (s === 'winter') return 'snow';
  if (s === 'summer') return 'fire';
  if (s === 'autumn') return 'mist';
  return 'rain';
}

export interface SeasonEnvPreset {
  background: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambient: number;
  sunColor: string;
  sunIntensity: number;
  /** Shallow water base RGB (01) when static */
  waterShallow: [number, number, number];
  waterDeep: string;
  waterMid: string;
  foliage: string;
  scrub: string;
}

export interface SeasonEnvOptions {
  /** H7  tighter fog for promo captures. */
  cinematic?: boolean;
  /** CatanX Next  richer light, sky, water and foliage without a flat wash. */
  living?: boolean;
}

const BASE_ENV: SeasonEnvPreset = {
  background: '#7fa3b8',
  fog: '#a8c0cc',
  fogNear: 48,
  fogFar: 118,
  hemiSky: '#d4e4ec',
  hemiGround: '#3a4a42',
  hemiIntensity: 0.42,
  ambient: 0.1,
  sunColor: '#ffe0a8',
  sunIntensity: 1.22,
  waterShallow: [0.16, 0.46, 0.55],
  waterDeep: '#0d2436',
  waterMid: '#1f5a72',
  foliage: '#3f684b',
  scrub: '#71815b',
};

/** Per-season base overrides for living mode (silhouette + climate, not flat tint). */
const LIVING_OVERRIDES: Record<Season, Partial<SeasonEnvPreset>> = {
  spring: {
    background: '#9bb6bd',
    fog: '#c2d0cf',
    hemiSky: '#e2ebe6',
    sunColor: '#f2dfc2',
    sunIntensity: 1.06,
    foliage: '#496f50',
    scrub: '#778b62',
    waterMid: '#347586',
  },
  summer: {
    background: '#5e8aa0',
    fog: '#9eb8c0',
    fogNear: 55,
    fogFar: 140,
    hemiSky: '#dceef4',
    hemiGround: '#3a4a36',
    hemiIntensity: 0.55,
    sunColor: '#ffe2a0',
    sunIntensity: 1.45,
    ambient: 0.06,
    foliage: '#3f6840',
    scrub: '#6a7a52',
    waterMid: '#1f6582',
    waterDeep: '#0a2032',
    waterShallow: [0.14, 0.44, 0.54],
  },
  autumn: {
    background: '#7a6e62',
    fog: '#b8a894',
    hemiSky: '#ead6c2',
    hemiGround: '#453f34',
    sunColor: '#f0b878',
    sunIntensity: 1.2,
    ambient: 0.08,
    foliage: '#80563f',
    scrub: '#9a7146',
    waterMid: '#436f7a',
  },
  winter: {
    background: '#4e6a80',
    fog: '#9eb0c0',
    fogNear: 34,
    fogFar: 95,
    hemiSky: '#c8d8e6',
    hemiGround: '#3e4a52',
    hemiIntensity: 0.58,
    sunColor: '#b8c8d8',
    sunIntensity: 0.88,
    ambient: 0.1,
    foliage: '#3f4a3d',
    scrub: '#5d6258',
    waterDeep: '#102030',
    waterMid: '#2e5870',
    waterShallow: [0.28, 0.46, 0.55],
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Mix base toward tint by strength (Pixi-style wash). */
export function mixHex(base: string, tint: string, strength: number): string {
  const [br, bg, bb] = hexToRgb(base);
  const [tr, tg, tb] = hexToRgb(tint);
  const t = Math.max(0, Math.min(1, strength));
  return rgbToHex(br + (tr - br) * t, bg + (tg - bg) * t, bb + (tb - bb) * t);
}

export function mixRgb(
  base: [number, number, number],
  tintHex: string,
  strength: number,
): [number, number, number] {
  const [tr, tg, tb] = hexToRgb(tintHex);
  const t = Math.max(0, Math.min(1, strength));
  return [
    base[0] + (tr - base[0]) * t,
    base[1] + (tg - base[1]) * t,
    base[2] + (tb - base[2]) * t,
  ];
}

function mergePreset(base: SeasonEnvPreset, over: Partial<SeasonEnvPreset>): SeasonEnvPreset {
  return { ...base, ...over };
}

/**
 * Season environment  soft wash by default; `living: true` uses climate overrides.
 */
export function seasonEnv(
  season: string | undefined | null,
  options: SeasonEnvOptions = {},
): SeasonEnvPreset {
  const s = normalizeSeason(season);
  const cinematic = options.cinematic === true;
  const living = options.living === true;

  if (living) {
    const preset = mergePreset(BASE_ENV, LIVING_OVERRIDES[s]);
    if (cinematic) {
      return {
        ...preset,
        // Keep depth — tight fog flattened the island into a brown miniature.
        fogNear: Math.max(preset.fogNear, s === 'winter' ? 36 : 50),
        fogFar: Math.max(preset.fogFar, s === 'winter' ? 100 : 140),
      };
    }
    return preset;
  }

  const tint = SEASON_TINT_HEX[s];
  const wash = SEASON_WASH_STRENGTH;
  const foliageWash = wash * 1.6;
  const waterWash = wash * 1.25;

  return {
    background: mixHex(BASE_ENV.background, tint, wash + (cinematic ? 0.02 : 0)),
    fog: mixHex(BASE_ENV.fog, tint, wash + (cinematic ? 0.02 : 0)),
    fogNear: cinematic ? 34 : BASE_ENV.fogNear,
    fogFar: cinematic ? 78 : BASE_ENV.fogFar,
    hemiSky: mixHex(BASE_ENV.hemiSky, tint, wash * 0.9),
    hemiGround: mixHex(BASE_ENV.hemiGround, tint, wash * 1.1),
    hemiIntensity: BASE_ENV.hemiIntensity,
    ambient: BASE_ENV.ambient,
    sunColor: mixHex(BASE_ENV.sunColor, tint, wash * 0.7),
    sunIntensity: BASE_ENV.sunIntensity,
    waterShallow: mixRgb(BASE_ENV.waterShallow, tint, waterWash),
    waterDeep: mixHex(BASE_ENV.waterDeep, tint, waterWash * 0.6),
    waterMid: mixHex(BASE_ENV.waterMid, tint, waterWash * 0.8),
    foliage: mixHex(BASE_ENV.foliage, tint, foliageWash),
    scrub: mixHex(BASE_ENV.scrub, tint, foliageWash * 0.85),
  };
}

/**
 * H6  density multipliers for seasonal decor variants (scrub/trees).
 * Winter thins foliage; summer densifies scrub slightly.
 */
export function seasonDecorDensity(season: string | undefined | null): {
  scrub: number;
  tree: number;
  rock: number;
} {
  const s = normalizeSeason(season);
  if (s === 'winter') return { scrub: 0.62, tree: 0.78, rock: 1.15 };
  if (s === 'autumn') return { scrub: 0.88, tree: 0.92, rock: 1.05 };
  if (s === 'summer') return { scrub: 1.08, tree: 1.0, rock: 0.95 };
  return { scrub: 1.0, tree: 1.05, rock: 1.0 };
}

/** Couche 2 — presets par climat (sévères immédiatement perceptibles). */
export interface ClimateVisualPreset {
  label: string;
  fogNearDelta: number;
  fogFarDelta: number;
  sunIntensityMult: number;
  waterShallowBoost: number;
  particle:
    | SeasonParticleKind
    | 'dust'
    | 'wind'
    | 'blizzard'
    | 'pollen'
    | 'leaves'
    | 'frost';
  transitionMs: number;
  terrainTint: string;
  terrainTintStrength: number;
  roughnessDelta: number;
  weatherDensity: number;
  windStrength: number;
  foliageDensity: number;
  waterLevelDelta: number;
  waterWaveMult: number;
  surfaceOpacity: number;
  roadOverlayOpacity: number;
  roadOverlayColor: string;
  skyTint: string;
  skyTintStrength: number;
}

function climateVisual(
  label: string,
  particle: ClimateVisualPreset['particle'],
  overrides: Partial<Omit<ClimateVisualPreset, 'label' | 'particle'>> = {},
): ClimateVisualPreset {
  return {
    label,
    particle,
    fogNearDelta: 0,
    fogFarDelta: 0,
    sunIntensityMult: 1,
    waterShallowBoost: 0,
    transitionMs: 1250,
    terrainTint: '#ffffff',
    terrainTintStrength: 0,
    roughnessDelta: 0,
    weatherDensity: 0.18,
    windStrength: 1,
    foliageDensity: 1,
    waterLevelDelta: 0,
    waterWaveMult: 1,
    surfaceOpacity: 0,
    roadOverlayOpacity: 0,
    roadOverlayColor: '#ffffff',
    skyTint: '#ffffff',
    skyTintStrength: 0,
    ...overrides,
  };
}

/** Every rules climate has a visual identity; severe climates use the strongest surface grade. */
const CLIMATE_VISUALS: Record<string, ClimateVisualPreset> = {
  spring_gentle_renewal: climateVisual('Renouveau doux', 'pollen', {
    terrainTint: '#dff5d6', terrainTintStrength: 0.08, weatherDensity: 0.28,
    foliageDensity: 1.08, surfaceOpacity: 0.035, skyTint: '#ddfff0', skyTintStrength: 0.06,
  }),
  spring_flower_mists: climateVisual('Brumes fleuries', 'mist', {
    fogNearDelta: -5, fogFarDelta: -8, terrainTint: '#e3f2df', terrainTintStrength: 0.1,
    weatherDensity: 0.38, foliageDensity: 1.12, surfaceOpacity: 0.045,
    skyTint: '#e8e0f4', skyTintStrength: 0.08,
  }),
  spring_great_thaw: climateVisual('Grand dégel', 'mist', {
    fogNearDelta: -2, waterShallowBoost: 0.07, waterLevelDelta: 0.008,
    waterWaveMult: 1.12, terrainTint: '#dcebdc', terrainTintStrength: 0.08,
    roughnessDelta: 0.04, weatherDensity: 0.22, surfaceOpacity: 0.045,
  }),
  spring_march_winds: climateVisual('Vents de mars', 'wind', {
    fogFarDelta: 8, weatherDensity: 0.48, windStrength: 1.7, waterWaveMult: 1.35,
    terrainTint: '#e8f1d9', terrainTintStrength: 0.05, skyTint: '#d9f4ff', skyTintStrength: 0.08,
  }),
  spring_floods: {
    ...climateVisual('Crues printanières', 'rain'),
    fogNearDelta: -4,
    fogFarDelta: -8,
    sunIntensityMult: 0.9,
    waterShallowBoost: 0.18,
    transitionMs: 1400,
    terrainTint: '#c8dcd6', terrainTintStrength: 0.19, roughnessDelta: 0.13,
    weatherDensity: 0.9, windStrength: 1.25, foliageDensity: 0.94,
    waterLevelDelta: 0.026, waterWaveMult: 1.42, surfaceOpacity: 0.12,
    roadOverlayOpacity: 0.26, roadOverlayColor: '#456d72', skyTint: '#9db9c0', skyTintStrength: 0.2,
  },
  summer_golden: climateVisual('Été doré', 'pollen', {
    fogFarDelta: 12, sunIntensityMult: 1.14, terrainTint: '#ffe39b', terrainTintStrength: 0.13,
    weatherDensity: 0.2, foliageDensity: 1.03, surfaceOpacity: 0.035,
    skyTint: '#fff1bd', skyTintStrength: 0.12,
  }),
  summer_hot_storms: climateVisual('Orages chauds', 'rain', {
    fogNearDelta: -5, fogFarDelta: -8, sunIntensityMult: 0.78, waterShallowBoost: 0.08,
    waterLevelDelta: 0.008, waterWaveMult: 1.55, terrainTint: '#c8d1c4', terrainTintStrength: 0.12,
    roughnessDelta: 0.08, weatherDensity: 0.72, windStrength: 1.6, surfaceOpacity: 0.06,
    roadOverlayOpacity: 0.12, roadOverlayColor: '#4f6670', skyTint: '#8195a8', skyTintStrength: 0.24,
  }),
  summer_etesian: climateVisual('Vents étésiens', 'wind', {
    fogFarDelta: 14, weatherDensity: 0.55, windStrength: 1.85, waterWaveMult: 1.46,
    terrainTint: '#f4e8bd', terrainTintStrength: 0.08, skyTint: '#d9efff', skyTintStrength: 0.1,
  }),
  summer_drought: {
    ...climateVisual('Grande sécheresse', 'dust'),
    fogNearDelta: 6,
    fogFarDelta: 10,
    sunIntensityMult: 1.25,
    waterShallowBoost: -0.12,
    transitionMs: 1600,
    terrainTint: '#d7a75f', terrainTintStrength: 0.28, roughnessDelta: 0.15,
    weatherDensity: 0.75, windStrength: 1.15, foliageDensity: 0.7,
    waterLevelDelta: -0.024, waterWaveMult: 0.7, surfaceOpacity: 0.16,
    roadOverlayOpacity: 0.18, roadOverlayColor: '#c79a5b', skyTint: '#efc47d', skyTintStrength: 0.2,
  },
  summer_heatwave: {
    ...climateVisual('Canicule', 'dust'),
    fogNearDelta: 2,
    fogFarDelta: 4,
    sunIntensityMult: 1.4,
    waterShallowBoost: -0.08,
    transitionMs: 1500,
    terrainTint: '#e7b66f', terrainTintStrength: 0.22, roughnessDelta: 0.1,
    weatherDensity: 0.48, foliageDensity: 0.78, waterLevelDelta: -0.014,
    waterWaveMult: 0.82, surfaceOpacity: 0.1, roadOverlayOpacity: 0.1,
    roadOverlayColor: '#c18a4c', skyTint: '#f3b86f', skyTintStrength: 0.25,
  },
  autumn_golden_harvest: climateVisual('Moisson dorée', 'leaves', {
    sunIntensityMult: 1.08, terrainTint: '#e8a65d', terrainTintStrength: 0.13,
    weatherDensity: 0.38, windStrength: 1.15, foliageDensity: 0.96,
    surfaceOpacity: 0.06, skyTint: '#ffd1a0', skyTintStrength: 0.12,
  }),
  autumn_great_fairs: climateVisual('Grandes foires', 'leaves', {
    fogFarDelta: 8, terrainTint: '#e9b36e', terrainTintStrength: 0.09,
    weatherDensity: 0.22, windStrength: 0.9, surfaceOpacity: 0.035,
  }),
  autumn_russet_rains: climateVisual('Pluies rousses', 'rain', {
    fogNearDelta: -4, fogFarDelta: -7, sunIntensityMult: 0.86, waterShallowBoost: 0.08,
    waterWaveMult: 1.28, terrainTint: '#b77a59', terrainTintStrength: 0.14,
    roughnessDelta: 0.1, weatherDensity: 0.62, surfaceOpacity: 0.07,
    roadOverlayOpacity: 0.13, roadOverlayColor: '#604c48', skyTint: '#a98e86', skyTintStrength: 0.16,
  }),
  autumn_transhumance: climateVisual('Transhumance', 'leaves', {
    fogFarDelta: 5, terrainTint: '#dfa46b', terrainTintStrength: 0.08,
    weatherDensity: 0.3, windStrength: 1.25, foliageDensity: 0.9, surfaceOpacity: 0.045,
  }),
  autumn_equinox_storm: {
    ...climateVisual("Tempête d'équinoxe", 'wind'),
    fogNearDelta: -8,
    fogFarDelta: -12,
    sunIntensityMult: 0.75,
    waterShallowBoost: 0.1,
    transitionMs: 1700,
    terrainTint: '#71808b', terrainTintStrength: 0.22, roughnessDelta: 0.12,
    weatherDensity: 1, windStrength: 2.35, foliageDensity: 0.78,
    waterLevelDelta: 0.012, waterWaveMult: 1.95, surfaceOpacity: 0.08,
    roadOverlayOpacity: 0.22, roadOverlayColor: '#52606b', skyTint: '#667381', skyTintStrength: 0.34,
  },
  winter_clear_frost: climateVisual('Gel clair', 'frost', {
    fogNearDelta: -2, sunIntensityMult: 1.06, terrainTint: '#dcecff', terrainTintStrength: 0.17,
    roughnessDelta: 0.08, weatherDensity: 0.3, foliageDensity: 0.82,
    waterWaveMult: 0.72, surfaceOpacity: 0.12, roadOverlayOpacity: 0.08,
    roadOverlayColor: '#dbeaff', skyTint: '#dcecff', skyTintStrength: 0.14,
  }),
  winter_mineral_night: climateVisual('Nuit minérale', 'frost', {
    fogNearDelta: -5, fogFarDelta: -7, sunIntensityMult: 0.75,
    terrainTint: '#b8c8dc', terrainTintStrength: 0.18, weatherDensity: 0.18,
    foliageDensity: 0.78, waterWaveMult: 0.62, surfaceOpacity: 0.1,
    skyTint: '#7c8fa9', skyTintStrength: 0.24,
  }),
  winter_merchant: climateVisual('Hiver marchand', 'snow', {
    fogNearDelta: -3, terrainTint: '#d4e2ec', terrainTintStrength: 0.11,
    weatherDensity: 0.32, windStrength: 0.8, foliageDensity: 0.84,
    waterWaveMult: 0.78, surfaceOpacity: 0.08,
  }),
  winter_deep_snows: {
    ...climateVisual('Neiges profondes', 'snow'),
    fogNearDelta: -2,
    fogFarDelta: -6,
    sunIntensityMult: 0.85,
    waterShallowBoost: -0.05,
    transitionMs: 1500,
    terrainTint: '#e4eef7', terrainTintStrength: 0.42, roughnessDelta: 0.17,
    weatherDensity: 0.82, windStrength: 1.15, foliageDensity: 0.64,
    waterLevelDelta: -0.006, waterWaveMult: 0.56, surfaceOpacity: 0.31,
    roadOverlayOpacity: 0.42, roadOverlayColor: '#edf5fb', skyTint: '#c8d9e8', skyTintStrength: 0.24,
  },
  winter_announced_blizzard: {
    ...climateVisual('Blizzard annoncé', 'blizzard'),
    fogNearDelta: -14,
    fogFarDelta: -20,
    sunIntensityMult: 0.65,
    waterShallowBoost: -0.1,
    transitionMs: 1800,
    terrainTint: '#eaf3f8', terrainTintStrength: 0.56, roughnessDelta: 0.2,
    weatherDensity: 1, windStrength: 2.6, foliageDensity: 0.48,
    waterLevelDelta: -0.01, waterWaveMult: 1.35, surfaceOpacity: 0.45,
    roadOverlayOpacity: 0.62, roadOverlayColor: '#f5f9fc', skyTint: '#c2d0dc', skyTintStrength: 0.42,
  },
};

export function getClimateVisualPreset(
  climateId: string | undefined | null,
): ClimateVisualPreset | null {
  if (!climateId) return null;
  return CLIMATE_VISUALS[climateId] ?? null;
}

export function applyClimateToSeasonEnv(
  env: SeasonEnvPreset,
  climateId: string | undefined | null,
): SeasonEnvPreset {
  const climate = getClimateVisualPreset(climateId);
  if (!climate) return env;
  const shallow: [number, number, number] = [
    Math.max(0, Math.min(1, env.waterShallow[0] + climate.waterShallowBoost)),
    Math.max(0, Math.min(1, env.waterShallow[1] + climate.waterShallowBoost * 0.6)),
    Math.max(0, Math.min(1, env.waterShallow[2] + climate.waterShallowBoost * 0.4)),
  ];
  return {
    ...env,
    background: mixHex(env.background, climate.skyTint, climate.skyTintStrength),
    fog: mixHex(env.fog, climate.skyTint, climate.skyTintStrength * 0.85),
    fogNear: Math.max(12, env.fogNear + climate.fogNearDelta),
    fogFar: Math.max(40, env.fogFar + climate.fogFarDelta),
    sunIntensity: env.sunIntensity * climate.sunIntensityMult,
    waterShallow: shallow,
  };
}

export function climateParticleKind(
  climateId: string | undefined | null,
  seasonFallback: string | undefined | null,
): SeasonParticleKind {
  const climate = getClimateVisualPreset(climateId);
  if (!climate) return seasonParticleKind(seasonFallback);
  if (
    climate.particle === 'dust' || climate.particle === 'wind' ||
    climate.particle === 'pollen' || climate.particle === 'leaves' ||
    climate.particle === 'frost'
  ) return 'mist';
  if (climate.particle === 'blizzard') return 'snow';
  return climate.particle;
}

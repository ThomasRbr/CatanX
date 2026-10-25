import * as THREE from 'three';
import type { BoardLayer } from '../../components/Map/boardLayer';
import {
  applyClimateToSeasonEnv,
  normalizeSeason,
  seasonEnv,
  type SeasonEnvPreset,
} from '../utils/seasonVisuals';

/**
 * Single source of truth for the outdoor atmosphere.
 *
 * Sky dome, key light, fog and ocean used to derive their own colours and their
 * own idea of where the sun was. They disagreed, which is why the horizon never
 * matched the water and the specular highlight pointed nowhere. Everything now
 * reads from one description of the sky.
 */
export interface AtmosphereGrade {
  /** Unit vector pointing from the board towards the sun. */
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Sky colour straight up. */
  zenith: THREE.Color;
  /** Sky colour at eye level, where the ocean meets it. */
  horizon: THREE.Color;
  /** Warm haze surrounding the sun disc. */
  haze: THREE.Color;
  /** Bounce colour coming back up off the sea. */
  groundBounce: THREE.Color;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  ambient: number;
  /** Multiplier applied to scene.environmentIntensity. */
  envIntensity: number;
  waterShallow: THREE.Color;
  waterMid: THREE.Color;
  waterDeep: THREE.Color;
  /**
   * Colour light takes on after passing through a wave crest. Always a brighter,
   * greener turquoise than any of the body colours — that back-lit glow is most
   * of what separates real sea water from a tinted mirror.
   */
  waterScatter: THREE.Color;
}

export interface AtmosphereOptions {
  season?: string | null;
  climateId?: string | null;
  cinematic?: boolean;
  layer?: BoardLayer;
}

/**
 * Sun elevation is deliberately modest. A high sun flattens a miniature: every
 * roof and ridge loses its cast shadow and the island reads as a painted disc.
 * These angles keep contact shadows long enough to model the relief.
 */
const SUN_ELEVATION_DEG: Record<string, number> = {
  spring: 40,
  summer: 46,
  autumn: 32,
  winter: 26,
};

/** Azimuth measured clockwise from -Z, so the key light comes over one shoulder. */
const SUN_AZIMUTH_DEG = -46;

export function sunDirectionFor(season: string, cinematic: boolean): THREE.Vector3 {
  const elevation = THREE.MathUtils.degToRad(
    (SUN_ELEVATION_DEG[season] ?? 40) - (cinematic ? 12 : 0),
  );
  const azimuth = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG);
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ).normalize();
}

/** Per-season sky, kept separate from the legacy flat `background` colour. */
const SKY: Record<string, { zenith: string; horizon: string; haze: string; bounce: string }> = {
  spring: { zenith: '#2f6ea8', horizon: '#bcd8e4', haze: '#ffe9c4', bounce: '#4a6d74' },
  summer: { zenith: '#1f66ad', horizon: '#a8cfe2', haze: '#ffe2a6', bounce: '#3f6a78' },
  autumn: { zenith: '#3d6b90', horizon: '#d8c3a4', haze: '#ffcf94', bounce: '#5c5f56' },
  winter: { zenith: '#42648c', horizon: '#c6d6e4', haze: '#e6ecf4', bounce: '#4d5b68' },
};

/**
 * Ocean is graded from the sky it reflects rather than from a private palette.
 *
 * These are the *lit* colours — the water shader is not a PBR material, so it
 * has to land on the same exposure as the island next to it. Open water is
 * deliberately dark: a bright deep sea flattened the whole composition by
 * making the land read as a shadow sitting on a lightbox.
 */
const WATER: Record<string, { shallow: string; mid: string; deep: string; scatter: string }> = {
  spring: { shallow: '#43919f', mid: '#1a5570', deep: '#0a2740', scatter: '#2fbfa4' },
  summer: { shallow: '#46a2af', mid: '#155c78', deep: '#082a46', scatter: '#31d0ad' },
  autumn: { shallow: '#3f7f88', mid: '#1b4c5b', deep: '#0c2432', scatter: '#2aa38c' },
  winter: { shallow: '#50829a', mid: '#204c69', deep: '#0f2739', scatter: '#2f9bab' },
};

function color(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/**
 * Underground and sky layers are self-lit sets rather than an outdoor sky, so
 * they override the grade wholesale instead of tinting it.
 */
function layerOverride(layer: BoardLayer, grade: AtmosphereGrade): AtmosphereGrade {
  if (layer === 'underground') {
    return {
      ...grade,
      zenith: color('#070a0d'),
      horizon: color('#141a1f'),
      haze: color('#2a2119'),
      groundBounce: color('#0b0d0e'),
      fog: color('#15191c'),
      fogNear: Math.max(grade.fogNear, 14),
      fogFar: Math.max(grade.fogFar, 34),
      hemiSky: color('#89939a'),
      hemiGround: color('#08090a'),
      hemiIntensity: 0.24,
      ambient: 0.1,
      sunColor: color('#d0a17d'),
      sunIntensity: 0.58,
      envIntensity: 0.42,
    };
  }
  if (layer === 'sky') {
    return {
      ...grade,
      zenith: color('#3f7fb4'),
      horizon: color('#dbe7ee'),
      haze: color('#fff2d4'),
      groundBounce: color('#8fa5b4'),
      fog: color('#bac9d2'),
      fogNear: Math.max(grade.fogNear, 18),
      fogFar: Math.max(grade.fogFar, 42),
      hemiSky: color('#e8ecee'),
      hemiGround: color('#53616c'),
      hemiIntensity: 0.72,
      ambient: 0.28,
      sunColor: color('#f3dfc3'),
      sunIntensity: 1.18,
      envIntensity: 0.9,
    };
  }
  return grade;
}

/**
 * Resolve the full atmosphere. Season/climate presets still drive fog distance
 * and sun strength; the sky, hemisphere and water are derived here so they can
 * never drift apart again.
 */
export function resolveAtmosphere(options: AtmosphereOptions = {}): AtmosphereGrade {
  const season = normalizeSeason(options.season);
  const cinematic = options.cinematic === true;
  const layer = options.layer ?? 'surface';

  const base: SeasonEnvPreset = applyClimateToSeasonEnv(
    seasonEnv(season, { cinematic, living: true }),
    options.climateId,
  );
  const sky = SKY[season] ?? SKY.spring!;
  const water = WATER[season] ?? WATER.spring!;

  // Climate presets tint the sky; reuse that so weather still reads, but apply
  // it to the real gradient instead of to a single flat colour.
  const zenith = color(sky.zenith);
  const horizon = color(sky.horizon);
  const haze = color(sky.haze);
  const backgroundTint = color(base.background);
  // A gentle pull towards the legacy background keeps climate identity.
  zenith.lerp(backgroundTint, 0.18);
  horizon.lerp(backgroundTint, 0.26);

  const grade: AtmosphereGrade = {
    sunDirection: sunDirectionFor(season, cinematic),
    sunColor: color(base.sunColor),
    // The removed fills contributed ~0.42 against a key of ~1.06, so the key
    // only has to absorb that much. Total exposure stays where it was; what
    // changes is that nearly all of it now comes from one direction, which is
    // what gives the island form instead of a flat wash.
    sunIntensity: base.sunIntensity * (cinematic ? 2.8 : 2.65),
    zenith,
    horizon,
    haze,
    groundBounce: color(sky.bounce),
    fog: color(base.fog).lerp(horizon, 0.45),
    // Fog must start beyond the island or the board itself goes milky.
    fogNear: Math.max(base.fogNear, cinematic ? 42 : 34),
    fogFar: Math.max(base.fogFar, cinematic ? 150 : 190),
    hemiSky: horizon.clone().lerp(zenith, 0.35),
    hemiGround: color(sky.bounce),
    hemiIntensity: base.hemiIntensity * 2.05,
    ambient: base.ambient * 1.05,
    envIntensity: cinematic ? 1.3 : 1.18,
    waterShallow: color(water.shallow),
    waterMid: color(water.mid),
    waterDeep: color(water.deep),
    waterScatter: color(water.scatter),
  };

  return layerOverride(layer, grade);
}

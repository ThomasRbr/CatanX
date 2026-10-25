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
    // "Les Profondeurs": a near-black cave. A cool, dim key from above models
    // the rock; every warm or coloured light comes from the cave itself
    // (chamber glow, lanterns, magma), which is what makes them read.
    return {
      ...grade,
      zenith: color('#030304'),
      horizon: color('#060607'),
      haze: color('#1c130e'),
      groundBounce: color('#120a07'),
      fog: color('#050505'),
      fogNear: 17,
      fogFar: 42,
      hemiSky: color('#5d6a80'),
      hemiGround: color('#24140c'),
      hemiIntensity: 1.25,
      ambient: 0.08,
      sunColor: color('#9fb2cc'),
      sunIntensity: 1.6,
      envIntensity: 0.32,
    };
  }
  if (layer === 'sky') {
    // "Les Alizés": golden hour above a sea of clouds. A low warm sun rakes
    // across the cloud deck and the floating islands; the shade side is filled
    // by a cool blue sky so every island keeps a lit face and a shadowed face.
    // The sun is the same for every season: the sky layer is a set, not weather.
    const elevation = THREE.MathUtils.degToRad(35);
    const azimuth = THREE.MathUtils.degToRad(-58);
    return {
      ...grade,
      sunDirection: new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ).normalize(),
      zenith: color('#1c4f9c'),
      horizon: color('#f4c98f'),
      haze: color('#ffd49a'),
      // Below the horizon the dome stands in for distant cloud: soft lavender.
      groundBounce: color('#8d93c4'),
      fog: color('#e9c9a6'),
      fogNear: 24,
      fogFar: 72,
      hemiSky: color('#9fc0ee'),
      hemiGround: color('#b39a97'),
      hemiIntensity: 0.95,
      ambient: 0.1,
      sunColor: color('#ffd09a'),
      sunIntensity: 2.7,
      envIntensity: 0.75,
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

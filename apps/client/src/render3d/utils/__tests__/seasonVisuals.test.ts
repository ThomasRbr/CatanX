import { describe, expect, it } from 'vitest';
import {
  mixHex,
  normalizeSeason,
  seasonDecorDensity,
  seasonEnv,
  seasonParticleKind,
  climateParticleKind,
  applyClimateToSeasonEnv,
  getClimateVisualPreset,
  SEASON_TINT_HEX,
  SEASON_WASH_STRENGTH,
} from '../seasonVisuals';
import { shouldAnimateDecor, shouldShowScrub, zoomToLod } from '../mapLod';

describe('seasonVisuals', () => {
  it('normalizes unknown seasons to spring', () => {
    expect(normalizeSeason(undefined)).toBe('spring');
    expect(normalizeSeason('nope')).toBe('spring');
    expect(normalizeSeason('winter')).toBe('winter');
  });

  it('exposes brand season accents and wash strength', () => {
    expect(SEASON_TINT_HEX.spring).toBe('#57C785');
    expect(SEASON_TINT_HEX.summer).toBe('#FFCD4A');
    expect(SEASON_TINT_HEX.autumn).toBe('#FF7C56');
    expect(SEASON_TINT_HEX.winter).toBe('#76B7FF');
    expect(SEASON_WASH_STRENGTH).toBe(0.08);
  });

  it('maps season change particles like Pixi', () => {
    expect(seasonParticleKind('winter')).toBe('snow');
    expect(seasonParticleKind('summer')).toBe('fire');
    expect(seasonParticleKind('autumn')).toBe('mist');
    expect(seasonParticleKind('spring')).toBe('rain');
  });

  it('thins foliage density in winter (H6 seasonal variants)', () => {
    const winter = seasonDecorDensity('winter');
    const summer = seasonDecorDensity('summer');
    expect(winter.scrub).toBeLessThan(summer.scrub);
    expect(winter.tree).toBeLessThan(1);
    expect(winter.rock).toBeGreaterThan(1);
  });

  it('washes base env toward tint without hard swaps', () => {
    const summer = seasonEnv('summer');
    const autumn = seasonEnv('autumn');
    expect(summer.background).not.toBe(autumn.background);
    expect(summer.foliage.startsWith('#')).toBe(true);
    expect(mixHex('#c5d2c4', '#D4A84B', 0)).toBe('#c5d2c4');
  });

  it('living mode uses climate overrides distinct from wash', () => {
    const washWinter = seasonEnv('winter');
    const livingWinter = seasonEnv('winter', { living: true });
    expect(livingWinter.background).not.toBe(washWinter.background);
    expect(livingWinter.sunIntensity).toBeLessThan(seasonEnv('summer', { living: true }).sunIntensity);
  });
  it('maps climate particles for severe weather', () => {
    expect(climateParticleKind('spring_floods', 'spring')).toBe('rain');
    expect(climateParticleKind('summer_drought', 'summer')).toBe('mist');
    expect(climateParticleKind('summer_heatwave', 'summer')).toBe('mist');
    expect(climateParticleKind('winter_announced_blizzard', 'winter')).toBe('snow');
    expect(climateParticleKind(null, 'autumn')).toBe('mist');
  });

  it('applies climate fog/sun overrides on season env', () => {
    const base = seasonEnv('summer', { living: true });
    const drought = applyClimateToSeasonEnv(base, 'summer_drought');
    expect(drought.sunIntensity).toBeGreaterThan(base.sunIntensity);
    expect(drought.fogFar).toBeGreaterThan(base.fogFar);
  });

  it('gives all twenty rules climates a persistent visual identity', () => {
    const ids = [
      'spring_gentle_renewal', 'spring_flower_mists', 'spring_great_thaw',
      'spring_march_winds', 'spring_floods', 'summer_golden', 'summer_hot_storms',
      'summer_etesian', 'summer_drought', 'summer_heatwave', 'autumn_golden_harvest',
      'autumn_great_fairs', 'autumn_russet_rains', 'autumn_transhumance',
      'autumn_equinox_storm', 'winter_clear_frost', 'winter_mineral_night',
      'winter_merchant', 'winter_deep_snows', 'winter_announced_blizzard',
    ];
    expect(ids.map((id) => getClimateVisualPreset(id)).filter(Boolean)).toHaveLength(20);
  });

  it('makes severe climates materially change surfaces, roads and weather', () => {
    const blizzard = getClimateVisualPreset('winter_announced_blizzard')!;
    const drought = getClimateVisualPreset('summer_drought')!;
    expect(blizzard.surfaceOpacity).toBeGreaterThan(0.4);
    expect(blizzard.roadOverlayOpacity).toBeGreaterThan(0.5);
    expect(blizzard.weatherDensity).toBe(1);
    expect(drought.waterLevelDelta).toBeLessThan(0);
    expect(drought.foliageDensity).toBeLessThan(1);
  });
});

describe('mapLod', () => {
  it('classifies zoom bands with hysteresis', () => {
    expect(zoomToLod(30, 1)).toBe(2);
    expect(zoomToLod(40, 2)).toBe(2); // still in LOD2 until > 42
    expect(zoomToLod(45, 2)).toBe(1);
    expect(zoomToLod(55, 1)).toBe(1);
    expect(zoomToLod(90, 1)).toBe(0);
    expect(zoomToLod(70, 0)).toBe(0); // leave LOD0 only below 66
    expect(zoomToLod(60, 0)).toBe(1);
  });

  it('gates decor motion and scrub at LOD2', () => {
    expect(shouldAnimateDecor(true, 1)).toBe(true);
    expect(shouldAnimateDecor(true, 2)).toBe(false);
    expect(shouldAnimateDecor(false, 0)).toBe(false);
    expect(shouldShowScrub(2)).toBe(false);
    expect(shouldShowScrub(1)).toBe(true);
  });
});

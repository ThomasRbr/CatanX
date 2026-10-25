import { describe, expect, it } from 'vitest';
import { clusterPartCount, resolveBuildingCluster } from '../buildingCluster';

describe('buildingCluster H5', () => {
  it('builds compact multi-house settlements', () => {
    const parts = resolveBuildingCluster('settlement', 'b-settlement-1', 'empire');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts.filter((p) => p.kind === 'house' || p.kind === 'cottage').length).toBe(2);
    expect(parts.some((p) => p.kind === 'well' || p.kind === 'campfire')).toBe(true);
    // Empire column only on cities — settlements stay light.
    expect(parts.some((p) => p.kind === 'civColumn')).toBe(false);
  });

  it('builds denser city clusters than settlements', () => {
    expect(clusterPartCount('city')).toBeGreaterThan(clusterPartCount('settlement'));
    expect(clusterPartCount('metropolis')).toBeGreaterThan(clusterPartCount('city'));
    const metro = resolveBuildingCluster('metropolis', 'b-metro-1', 'empire');
    expect(metro.some((p) => p.kind === 'tower' || p.kind === 'hall')).toBe(true);
  });

  it('makes city halls larger than settlement houses', () => {
    const settlement = resolveBuildingCluster('settlement', 'b-s', 'empire');
    const city = resolveBuildingCluster('city', 'b-c', 'empire');
    const house = settlement.find((p) => p.kind === 'house')!;
    const hall = city.find((p) => p.kind === 'hall')!;
    expect(hall.scale).toBeGreaterThan(house.scale);
  });

  it('adds merchant cargo accents on cities', () => {
    const parts = resolveBuildingCluster('city', 'b-city-merch', 'merchants');
    expect(parts.some((p) => p.kind === 'civAwning' || p.kind === 'crate')).toBe(true);
  });

  it('uses real civilization ids (northerners)', () => {
    const parts = resolveBuildingCluster('settlement', 'b-north-1', 'northerners');
    expect(parts.some((p) => p.kind === 'campfire')).toBe(true);
  });
});

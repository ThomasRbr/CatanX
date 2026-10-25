import { describe, expect, it } from 'vitest';
import { fogAlphaForTile, fogColorForTile, shouldRenderFog } from '../fogVisibility';
import { tileStackOffset, unitStackOffset } from '../stackOffset';
import { resolveBuildingVisual } from '../buildingVisual';
import { resolveUnitKind } from '../unitKind';
import { eventMarkerKind } from '../eventMarkerKind';

describe('fogVisibility', () => {
  it('matches Pixi alphas', () => {
    expect(fogAlphaForTile(true, true)).toBe(0);
    expect(fogAlphaForTile(true, false)).toBe(0.34);
    expect(fogAlphaForTile(false, false)).toBe(0.76);
  });

  it('uses darker color for unexplored', () => {
    expect(fogColorForTile(false)).toBe('#0b0d10');
    expect(fogColorForTile(true)).toBe('#3a404c');
  });

  it('disables fog during setup', () => {
    expect(shouldRenderFog(true, 'setup')).toBe(false);
    expect(shouldRenderFog(true, 'playing')).toBe(true);
    expect(shouldRenderFog(false, 'playing')).toBe(false);
  });
});

describe('stackOffset', () => {
  it('spreads units on an arc like Pixi', () => {
    const a = unitStackOffset(0);
    const b = unitStackOffset(1);
    expect(a.x).toBeCloseTo(0.22, 5);
    expect(a.z).toBeCloseTo(0, 5);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.1);
  });

  it('grids tile buildings', () => {
    expect(tileStackOffset(0)).toEqual({ x: -0.22, z: 0.12 });
    expect(tileStackOffset(1).x).toBeGreaterThan(tileStackOffset(0).x);
  });
});

describe('entity catalogs', () => {
  it('resolves build-menu buildings', () => {
    expect(resolveBuildingVisual('farm')).toBe('farm');
    expect(resolveBuildingVisual('barracks')).toBe('barracks');
    expect(resolveBuildingVisual('wonder_pyramid')).toBe('fallback');
  });

  it('resolves recruit unit kinds', () => {
    expect(resolveUnitKind('worker')).toBe('worker');
    expect(resolveUnitKind('archer')).toBe('ranged');
    expect(resolveUnitKind('swordsman')).toBe('melee');
    expect(resolveUnitKind('dragon')).toBe('fallback');
  });

  it('maps known events with generic fallback', () => {
    expect(eventMarkerKind({ type: 'forest_fire' })).toBe('fire');
    expect(eventMarkerKind({ type: 'gold_rush' })).toBe('gold');
    expect(eventMarkerKind({ type: 'rebellion' as never })).toBe('generic');
  });
});

import { describe, expect, it } from 'vitest';
import {
  countTriangles,
  createPremiumGeometry,
  PREMIUM_MODEL_IDS,
  PREMIUM_MODEL_URL,
} from '../../assets/meshCatalog';
import {
  DRAW_CALL_BUDGET,
  drawCallBudgetForRadius,
  evaluatePerfSample,
  selectShadowCasterDecor,
  shadowMapSizeForLod,
  shouldCastDecorShadows,
} from '../perfBudgets';

describe('meshCatalog', () => {
  it('builds every premium model with triangles and a public GLB URL', () => {
    for (const id of PREMIUM_MODEL_IDS) {
      const geo = createPremiumGeometry(id);
      expect(countTriangles(geo)).toBeGreaterThan(8);
      expect(geo.getAttribute('color')).toBeTruthy();
      expect(PREMIUM_MODEL_URL[id]).toBe(`/assets/models/${id}.glb`);
      geo.dispose();
    }
  });
});

describe('perfBudgets', () => {
  it('exposes classic / large draw-call budgets', () => {
    expect(DRAW_CALL_BUDGET.classic).toBe(150);
    expect(DRAW_CALL_BUDGET.large).toBe(300);
    expect(drawCallBudgetForRadius(2)).toBe(150);
    expect(drawCallBudgetForRadius(3)).toBe(150);
    expect(drawCallBudgetForRadius(5)).toBe(300);
  });

  it('scales shadow map and decor shadows with LOD', () => {
    expect(shadowMapSizeForLod(0)).toBe(2048);
    expect(shadowMapSizeForLod(1)).toBe(1024);
    expect(shadowMapSizeForLod(2)).toBe(512);
    expect(shouldCastDecorShadows(0)).toBe(true);
    expect(shouldCastDecorShadows(1)).toBe(false);
    expect(shouldCastDecorShadows(2)).toBe(false);
  });

  it('keeps the largest decor instances as shadow casters', () => {
    const items = [
      { scale: 0.4, variant: 0 },
      { scale: 1.2, variant: 2 },
      { scale: 0.6, variant: 1 },
      { scale: 1.5, variant: 4 },
      { scale: 0.5, variant: 3 },
      { scale: 0.9, variant: 5 },
      { scale: 0.7, variant: 6 },
      { scale: 1.1, variant: 7 },
    ];
    const kept = selectShadowCasterDecor(items, 0.4);
    expect(kept.length).toBe(4);
    expect(kept[0]!.scale).toBe(1.5);
  });

  it('evaluates samples against budget', () => {
    const ok = evaluatePerfSample(
      { render: { calls: 120, triangles: 40_000 }, memory: { geometries: 40, textures: 8 } },
      2,
    );
    expect(ok.withinBudget).toBe(true);
    expect(ok.budget).toBe(150);

    const over = evaluatePerfSample(
      { render: { calls: 400, triangles: 90_000 }, memory: { geometries: 80, textures: 12 } },
      5,
    );
    expect(over.withinBudget).toBe(false);
  });
});

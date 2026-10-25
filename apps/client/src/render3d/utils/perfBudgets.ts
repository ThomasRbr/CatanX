import type { MapLodLevel } from './mapLod';

/** Phase F draw-call budgets (1920×1080 desktop, after terrain instancing). */
export const DRAW_CALL_BUDGET = {
  classic: 150,
  large: 300,
} as const;

/** Map radius thresholds matching MapGenerator sizes. */
export function drawCallBudgetForRadius(mapRadius: number): number {
  // classic / tiny–small ≈ radius ≤ 3; large+ ≈ radius ≥ 5
  if (mapRadius <= 3) return DRAW_CALL_BUDGET.classic;
  if (mapRadius <= 4) return 220;
  return DRAW_CALL_BUDGET.large;
}

export function shadowMapSizeForLod(lod: MapLodLevel): 512 | 1024 | 2048 {
  if (lod >= 2) return 512;
  if (lod === 1) return 1024;
  return 2048;
}

export function shouldCastDecorShadows(lod: MapLodLevel): boolean {
  // Lod0 only — lod1 tree shadows into 2k maps crushed FPS on diorama Ultra.
  return lod === 0;
}

/** Keep the largest trees as shadow casters; small saplings barely read in the map. */
export function selectShadowCasterDecor<T extends { scale: number; variant: number }>(
  items: readonly T[],
  keepFraction = 0.4,
): T[] {
  if (items.length <= 6 || keepFraction >= 0.99) return [...items];
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      score: item.scale * (0.7 + (item.variant % 5) * 0.095)
        * (0.68 + ((item.variant * 5) % 11) * 0.075),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const keep = Math.max(4, Math.ceil(items.length * keepFraction));
  return ranked.slice(0, keep).map((entry) => entry.item);
}

export interface RenderPerfSample {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  mapRadius: number;
  budget: number;
  withinBudget: boolean;
}

export function evaluatePerfSample(
  info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } },
  mapRadius: number,
): RenderPerfSample {
  const budget = drawCallBudgetForRadius(mapRadius);
  const drawCalls = info.render.calls;
  return {
    drawCalls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    mapRadius,
    budget,
    withinBudget: drawCalls <= budget,
  };
}

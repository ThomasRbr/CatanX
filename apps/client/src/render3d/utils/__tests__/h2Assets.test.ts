import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOARD_PRELOAD_URLS,
  CK_VISUAL_ASSETS,
  H2_VISUAL_ASSETS,
  H3_VISUAL_ASSETS,
  H1_VISUAL_ASSETS,
  LEGACY_TO_H1,
  resolveFallbackModelId,
  resolveVisualAssetUrl,
  TREE_VARIANT_IDS,
  VISUAL_ASSETS,
  VISUAL_ASSET_BY_ID,
} from '../../assets/visualAssetManifest';

const modelsRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../public/assets/models',
);

describe('H1+H2+H3+CK visual assets', () => {
  it('lists combined premium assets with license and url', () => {
    expect(H1_VISUAL_ASSETS.length).toBeGreaterThanOrEqual(20);
    expect(VISUAL_ASSETS.length).toBeGreaterThanOrEqual(
      H1_VISUAL_ASSETS.length + H2_VISUAL_ASSETS.length,
    );
    for (const asset of VISUAL_ASSETS) {
      expect(asset.id).toBeTruthy();
      expect(asset.url.startsWith('/assets/models/')).toBe(true);
      expect(asset.license).toBeTruthy();
      expect(asset.author).toBeTruthy();
      const materialBudget = CK_VISUAL_ASSETS.includes(asset) ? 4 : 3;
      expect(asset.materials ?? 1).toBeLessThanOrEqual(materialBudget);
    }
  });

  it('maps legacy meshCatalog ids to premium assets', () => {
    for (const [legacy, premium] of Object.entries(LEGACY_TO_H1)) {
      const url = resolveVisualAssetUrl(legacy);
      expect(url).toBeTruthy();
      if (VISUAL_ASSET_BY_ID[premium]) {
        expect(url).toBe(VISUAL_ASSET_BY_ID[premium]!.url);
      }
    }
  });

  it('exposes tree variant pools and board preload urls', () => {
    expect(TREE_VARIANT_IDS.length).toBeGreaterThanOrEqual(4);
    expect(BOARD_PRELOAD_URLS.length).toBeGreaterThanOrEqual(8);
    for (const url of BOARD_PRELOAD_URLS) {
      expect(url.startsWith('/assets/models/')).toBe(true);
    }
  });

  it('resolves procedural fallback ids for variant families', () => {
    expect(resolveFallbackModelId('tree_pine_c')).toBe('tree');
    expect(resolveFallbackModelId('rock_d')).toBe('rock');
    expect(resolveFallbackModelId('bush_c')).toBe('scrub');
    expect(resolveFallbackModelId('house_city_a')).toBe('city');
    expect(resolveFallbackModelId('robber_a')).toBe('robber');
    expect(resolveFallbackModelId('hill_a')).toBe('rock');
    expect(resolveFallbackModelId('tree_group_a')).toBe('tree');
  });

  it('has GLB files on disk for every manifest entry', () => {
    for (const asset of VISUAL_ASSETS) {
      const rel = asset.url.replace(/^\/assets\/models\//, '');
      const file = join(modelsRoot, rel);
      expect(existsSync(file), `missing ${file}`).toBe(true);
    }
  });
});

describe('H3 batch', () => {
  it('adds classic biome kit assets', () => {
    expect(H3_VISUAL_ASSETS.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(H3_VISUAL_ASSETS.map((a) => a.id));
    expect(ids.has('tree_group_a')).toBe(true);
    expect(ids.has('hill_a')).toBe(true);
    expect(ids.has('beach_strip_a')).toBe(true);
    expect(ids.has('field_row_b')).toBe(true);
    expect(ids.has('mine_entrance_a')).toBe(true);
  });
});

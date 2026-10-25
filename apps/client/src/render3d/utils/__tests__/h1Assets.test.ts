import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  H1_VISUAL_ASSETS,
  LEGACY_TO_H1,
  resolveVisualAssetUrl,
  VISUAL_ASSET_BY_ID,
} from '../../assets/visualAssetManifest';

const modelsRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../public/assets/models',
);

describe('H1 visual assets', () => {
  it('lists at least 20 premium assets with license and url', () => {
    expect(H1_VISUAL_ASSETS.length).toBeGreaterThanOrEqual(20);
    for (const asset of H1_VISUAL_ASSETS) {
      expect(asset.id).toBeTruthy();
      expect(asset.url.startsWith('/assets/models/')).toBe(true);
      expect(asset.license).toBeTruthy();
      expect(asset.author).toBeTruthy();
      expect(asset.materials ?? 1).toBeLessThanOrEqual(3);
      expect(asset.triangles ?? 1).toBeGreaterThan(0);
    }
  });

  it('maps legacy meshCatalog ids to H1 Blender assets', () => {
    for (const [legacy, h1] of Object.entries(LEGACY_TO_H1)) {
      expect(VISUAL_ASSET_BY_ID[h1]).toBeTruthy();
      expect(resolveVisualAssetUrl(legacy)).toBe(VISUAL_ASSET_BY_ID[h1]!.url);
    }
  });

  it('has GLB files on disk for every manifest entry', () => {
    for (const asset of H1_VISUAL_ASSETS) {
      const rel = asset.url.replace(/^\/assets\/models\//, '');
      const file = join(modelsRoot, rel);
      expect(existsSync(file), `missing ${file}`).toBe(true);
    }
  });
});

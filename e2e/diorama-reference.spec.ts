import { expect, test } from '@playwright/test';
import path from 'node:path';

const allShots = [
  { name: 'summer-island', query: 'season=summer&shot=island&view=cinematic' },
  { name: 'summer-village', query: 'season=summer&shot=village&view=cinematic' },
  { name: 'winter-island', query: 'season=winter&shot=island&view=cinematic' },
  { name: 'strategic', query: 'season=summer&shot=strategic' },
] as const;

const requestedShot = process.env.CATANX_REFERENCE_SHOT;
const shots = requestedShot
  ? allShots.filter((shot) => shot.name === requestedShot)
  : allShots;

test('scène étalon Diorama — quatre captures contractuelles', async ({ page }) => {
  test.setTimeout(420_000);
  // Match the approved art-reference framing (1823x863) within one pixel so
  // perceptual comparisons are not distorted by a different aspect ratio.
  await page.setViewportSize({ width: 1824, height: 864 });

  for (const shot of shots) {
    await page.goto(`/?scene=diorama&${shot.query}&capture=1`);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    // The marker mounts inside the R3F Suspense boundary only after every
    // texture/model dependency is available. Waiting on it prevents a visible
    // but completely blank WebGL canvas from becoming a contractual capture.
    await page.waitForFunction(
      () => document.documentElement.dataset.catanxDioramaReady === 'true',
      undefined,
      { timeout: 180_000 },
    );
    // Leave a few frames for shader compilation, TAA history and shadows.
    await page.waitForTimeout(2_500);
    await page.screenshot({
      path: path.resolve(`docs/captures/diorama-${shot.name}.png`),
      fullPage: false,
    });
  }
});

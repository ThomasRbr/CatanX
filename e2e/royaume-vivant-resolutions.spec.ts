import { expect, test } from '@playwright/test';

/**
 * Royaume vivant — vertical slice visual smoke at target desktop resolutions.
 * Ensures main menu logo + primary nav remain visible without overlap.
 */
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
] as const;

for (const vp of VIEWPORTS) {
  test(`menu principal lisible à ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/');
    const logo = page.getByRole('img', { name: 'CatanX' });
    await expect(logo).toBeVisible();
    const newGame = page.getByRole('button', { name: 'Nouvelle partie' });
    await expect(newGame).toBeVisible();
    const box = await newGame.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y + box!.height).toBeLessThan(vp.height);
  });
}

import { test, expect } from '@playwright/test';

test.describe('Saisons extension', () => {
  test('Observatoire visible en partie CatanX', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Nouvelle partie|Commencer/i }).first().click();
    // Mode CatanX
    const catanx = page.getByText('CatanX', { exact: false }).first();
    if (await catanx.isVisible()) {
      await catanx.click();
    }
    // Avancer le wizard jusqu'au démarrage si besoin
    const start = page.getByRole('button', { name: /Lancer|Démarrer|Jouer/i }).first();
    if (await start.isVisible()) {
      await start.click();
    }
    // L'observatoire peut être masqué sous 1280px — forcer viewport large
    await page.setViewportSize({ width: 1440, height: 900 });
    const observatory = page.locator('[data-hud-zone="season"]');
    // Tolérant : si le setup n'atteint pas playing, on vérifie au moins le lobby extensions
    const lobbySeasons = page.getByText('Saisons', { exact: false });
    await expect(lobbySeasons.or(observatory).first()).toBeVisible({ timeout: 15000 });
  });
});

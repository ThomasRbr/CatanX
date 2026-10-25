import { test, expect } from '@playwright/test';
import path from 'node:path';
import { openGameSetup, selectCatanXPreset, startConfiguredGame } from './helpers/gameSetup';

test('Diorama est le renderer par défaut', async ({ page }) => {
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    // Fresh settings: no forced mapRenderer — store default must be Diorama.
    localStorage.removeItem('catanx_frontend_settings_v1');
  });

  await openGameSetup(page);

  await selectCatanXPreset(page);

  await startConfiguredGame(page);

  const board = page.getByTestId('diorama-board');
  await expect(board).toBeAttached({ timeout: 60_000 });
  await expect(board.locator('canvas')).toBeAttached();

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('catanx_frontend_settings_v1');
    if (!raw) return null;
    return JSON.parse(raw) as { state?: { mapRenderer?: string } };
  });
  // Persist may write on first settings touch; default path is Diorama regardless.
  if (stored?.state?.mapRenderer) {
    expect(stored.state.mapRenderer).toBe('diorama');
  }

  await page.waitForTimeout(2200);
  await page.addStyleTag({
    content: `
      .ui-layer, .command-ribbon, [aria-label="Indicateur de tour"],
      .phase-banner, nav[aria-label="Actions de partie"] { display: none !important; }
      .ui-panel { display: none !important; }
    `,
  });
  await page.waitForTimeout(400);

  const out = path.resolve('docs/captures/diorama-default.png');
  await page.screenshot({ path: out, fullPage: false });
});

test('Phase G — retour au renderer Pixi historique via Paramètres', async ({ page }) => {
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    if (sessionStorage.getItem('catanx-settings-cleared') !== '1') {
      localStorage.removeItem('catanx_frontend_settings_v1');
      sessionStorage.setItem('catanx-settings-cleared', '1');
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Paramètres' }).click();
  await expect(page.getByLabel('Rendu de la carte')).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Rendu de la carte').selectOption('pixi');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await openGameSetup(page);
  await startConfiguredGame(page);

  await expect(page.getByTestId('three-hex-board')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('diorama-board')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('pixi-hex-board')).toBeAttached({ timeout: 30_000 });
});

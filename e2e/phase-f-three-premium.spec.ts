import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { advanceSetupToWorld, openGameSetup, selectCatanXPreset } from './helpers/gameSetup';

const MODEL_IDS = ['tree', 'scrub', 'rock', 'peak', 'dune', 'settlement', 'city', 'robber'] as const;

async function startThreeGame(
  page: import('@playwright/test').Page,
  mapSizeLabel: string,
) {
  await page.addInitScript(() => {
    const key = 'catanx_frontend_settings_v1';
    const existing = localStorage.getItem(key);
    const parsed = existing ? JSON.parse(existing) : { state: {}, version: 0 };
    parsed.state = {
      ...(parsed.state ?? {}),
      mapRenderer: 'threeLegacy',
      showGrid: false,
      showAnimations: true,
    };
    parsed.version = 5;
    localStorage.setItem(key, JSON.stringify(parsed));
  });

  await openGameSetup(page);

  await selectCatanXPreset(page);

  await advanceSetupToWorld(page);
  await page.getByLabel('Taille de la carte').selectOption({ label: mapSizeLabel });
  await page.getByRole('button', { name: /^Lancer$/i }).click();

  const board = page.getByTestId('three-hex-board');
  await expect(board).toBeAttached({ timeout: 60_000 });
  await expect(board.locator('canvas')).toBeAttached();
  await page.waitForTimeout(3200);
  return board;
}

test('Phase F — GLB assets exist + classic map under draw-call budget', async ({ page }) => {
  test.setTimeout(120_000);

  for (const id of MODEL_IDS) {
    const file = path.resolve(`apps/client/public/assets/models/${id}.glb`);
    expect(fs.existsSync(file), `missing ${id}.glb`).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(200);
  }

  await startThreeGame(page, 'Très petite');
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __catanxRenderPerf?: { drawCalls: number } }).__catanxRenderPerf;
      return Boolean(s && s.drawCalls > 0);
    },
    { timeout: 15_000 },
  );

  const perf = await page.evaluate(() => (window as unknown as { __catanxRenderPerf: {
    drawCalls: number;
    budget: number;
    withinBudget: boolean;
    mapRadius: number;
  } }).__catanxRenderPerf);

  expect(perf.mapRadius).toBeLessThanOrEqual(3);
  expect(perf.drawCalls).toBeLessThanOrEqual(perf.budget);
  expect(perf.withinBudget).toBe(true);

  await page.addStyleTag({
    content: `
      .ui-layer, .command-ribbon, [aria-label="Indicateur de tour"],
      .phase-banner, nav[aria-label="Actions de partie"] { display: none !important; }
      .ui-panel { display: none !important; }
    `,
  });
  await page.waitForTimeout(400);

  const out = path.resolve('docs/captures/phase-f-three-premium.png');
  await page.screenshot({ path: out, fullPage: false });
});

test('Phase F — large map stays within large draw-call budget', async ({ page }) => {
  test.setTimeout(150_000);

  await startThreeGame(page, 'Grande');
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __catanxRenderPerf?: { drawCalls: number } }).__catanxRenderPerf;
      return Boolean(s && s.drawCalls > 0);
    },
    { timeout: 20_000 },
  );

  const perf = await page.evaluate(() => (window as unknown as { __catanxRenderPerf: {
    drawCalls: number;
    budget: number;
    withinBudget: boolean;
  } }).__catanxRenderPerf);

  expect(perf.drawCalls).toBeLessThanOrEqual(Math.max(perf.budget, 300));
  expect(perf.withinBudget).toBe(true);
});

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { openGameSetup, selectCatanXPreset, startConfiguredGame } from './helpers/gameSetup';

test('capture Phase D CatanX entities Three', async ({ page }) => {
  test.setTimeout(120_000);

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

  // Switch to CatanX preset if available (fog / military / events)
  await selectCatanXPreset(page);

  await startConfiguredGame(page);

  // Prefer Three board; fall back wait helps diagnose Pixi fallback
  const board = page.getByTestId('three-hex-board');
  await expect(board).toBeAttached({ timeout: 60_000 });
  await expect(board.locator('canvas')).toBeAttached();
  await page.waitForTimeout(2800);

  await page.addStyleTag({
    content: `
      .ui-layer, .command-ribbon, [aria-label="Indicateur de tour"],
      .phase-banner, nav[aria-label="Actions de partie"] { display: none !important; }
      .ui-panel { display: none !important; }
    `,
  });
  await page.waitForTimeout(400);

  const size = await board.evaluate((el) => ({
    w: (el as HTMLElement).clientWidth,
    h: (el as HTMLElement).clientHeight,
  }));
  expect(size.w).toBeGreaterThan(400);
  expect(size.h).toBeGreaterThan(300);

  const out = path.resolve('docs/captures/phase-d-three-entities.png');
  await page.screenshot({ path: out, fullPage: false });
});

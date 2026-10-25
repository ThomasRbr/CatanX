import { test, expect } from '@playwright/test';
import path from 'node:path';
import { openGameSetup, startConfiguredGame } from './helpers/gameSetup';

test('capture Phase A renderer Three', async ({ page }) => {
  test.setTimeout(90_000);

  await page.addInitScript(() => {
    const key = 'catanx_frontend_settings_v1';
    const existing = localStorage.getItem(key);
    const parsed = existing ? JSON.parse(existing) : { state: {}, version: 0 };
    parsed.state = {
      ...(parsed.state ?? {}),
      mapRenderer: 'threeLegacy',
      showGrid: true,
      showAnimations: true,
    };
    parsed.version = 5;
    localStorage.setItem(key, JSON.stringify(parsed));
  });

  await openGameSetup(page);
  await startConfiguredGame(page);

  const board = page.getByTestId('three-hex-board');
  await expect(board).toBeAttached({ timeout: 45_000 });
  await expect(board.locator('canvas')).toBeAttached();
  await page.waitForTimeout(2000);

  const size = await board.evaluate((el) => ({
    w: (el as HTMLElement).clientWidth,
    h: (el as HTMLElement).clientHeight,
  }));
  expect(size.w).toBeGreaterThan(400);
  expect(size.h).toBeGreaterThan(300);

  const out = path.resolve('docs/captures/phase-a-three-hex-board.png');
  await page.screenshot({ path: out, fullPage: false });
});

import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { openGameSetup, startConfiguredGame } from './helpers/gameSetup';

type PlacementHit = {
  id: string;
  kind: 'intersection' | 'edge';
  clientX: number;
  clientY: number;
};

async function readPlacementHits(board: Locator): Promise<PlacementHit[]> {
  await expect
    .poll(
      async () => {
        const raw = await board.getAttribute('data-placement-hits');
        if (!raw) return 0;
        try {
          return (JSON.parse(raw) as PlacementHit[]).length;
        } catch {
          return 0;
        }
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  const raw = await board.getAttribute('data-placement-hits');
  return JSON.parse(raw!) as PlacementHit[];
}

async function clickHit(page: Page, hit: PlacementHit) {
  await page.mouse.click(hit.clientX, hit.clientY);
}

test('Phase C: placement initial settlement + route en Three', async ({ page }) => {
  test.setTimeout(120_000);

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
  await expect(page.getByText('Placement initial (style Catan)')).toBeVisible({ timeout: 20_000 });

  const settlementHits = await readPlacementHits(board);
  expect(settlementHits.some((h) => h.kind === 'intersection')).toBe(true);
  await clickHit(page, settlementHits.find((h) => h.kind === 'intersection')!);
  await expect(page.getByRole('button', { name: 'Confirmer' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page.getByText(/place une route/i)).toBeVisible({ timeout: 10_000 });
  const roadHits = await readPlacementHits(board);
  expect(roadHits.some((h) => h.kind === 'edge')).toBe(true);
  await clickHit(page, roadHits.find((h) => h.kind === 'edge')!);
  await expect(page.getByRole('button', { name: 'Confirmer' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page.getByText('Placement initial (style Catan)')).toBeVisible();
  await expect(page.getByText(/Progression:/i)).toBeVisible();

  await page.addStyleTag({
    content: `
      .ui-layer, .command-ribbon, [aria-label="Indicateur de tour"],
      .phase-banner, nav[aria-label="Actions de partie"] { display: none !important; }
      .ui-panel { display: none !important; }
    `,
  });
  await page.waitForTimeout(500);

  const out = path.resolve('docs/captures/phase-c-three-placement.png');
  await page.screenshot({ path: out, fullPage: false });
});

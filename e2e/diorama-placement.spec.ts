import { test, expect, type Locator, type Page } from '@playwright/test';
import { openGameSetup, startConfiguredGame } from './helpers/gameSetup';

type PlacementHit = {
  id: string;
  kind: 'intersection' | 'edge';
  clientX: number;
  clientY: number;
};

async function readVisibleHits(board: Locator, kind: PlacementHit['kind']): Promise<PlacementHit[]> {
  await expect.poll(async () => {
    const raw = await board.getAttribute('data-placement-hits');
    if (!raw) return 0;
    try {
      return (JSON.parse(raw) as PlacementHit[]).filter((hit) => hit.kind === kind).length;
    } catch {
      return 0;
    }
  }, { timeout: 30_000 }).toBeGreaterThan(0);

  const raw = await board.getAttribute('data-placement-hits');
  return (JSON.parse(raw!) as PlacementHit[]).filter((hit) => hit.kind === kind);
}

async function selectAndConfirm(page: Page, hit: PlacementHit) {
  await page.mouse.click(hit.clientX, hit.clientY);
  const confirm = page.getByRole('button', { name: 'Confirmer' });
  await expect(confirm).toBeVisible({ timeout: 10_000 });
  await confirm.click();
}

test('Diorama conserve le picking du placement colonie puis route', async ({ page }) => {
  test.setTimeout(120_000);
  const renderErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' || text.includes('THREE.WebGLProgram')) renderErrors.push(text);
  });
  page.on('pageerror', (error) => renderErrors.push(error.message));
  await page.addInitScript(() => localStorage.removeItem('catanx_frontend_settings_v1'));

  await openGameSetup(page);
  await startConfiguredGame(page);

  const board = page.getByTestId('diorama-board');
  await expect(board).toBeAttached({ timeout: 60_000 });
  await expect(board.locator('canvas')).toBeAttached();
  const setupPanel = page.getByRole('complementary', { name: 'Placement initial' });
  await expect(setupPanel).toBeVisible({ timeout: 20_000 });
  await expect(setupPanel.getByText(/placez un village/i)).toBeVisible();

  const settlements = await readVisibleHits(board, 'intersection');
  await selectAndConfirm(page, settlements[Math.floor(settlements.length / 2)]!);

  await expect(setupPanel.getByText(/placez une route/i)).toBeVisible({ timeout: 10_000 });
  const roads = await readVisibleHits(board, 'edge');
  await selectAndConfirm(page, roads[0]!);

  await expect(setupPanel).toBeVisible();
  await expect(setupPanel.getByRole('progressbar', { name: 'Progression' })).toBeVisible();
  await page.waitForTimeout(2_500);
  expect(renderErrors, renderErrors.join('\n\n')).toEqual([]);
});

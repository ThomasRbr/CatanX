import { test, expect } from '@playwright/test';
import { advanceSetupToWorld, openGameSetup } from './helpers/gameSetup';

test('lobby : active Villes & Chevaliers et reflète +3 PV', async ({ page }) => {
  await openGameSetup(page);
  await advanceSetupToWorld(page);
  await expect(page.getByText('Villes & Chevaliers').first()).toBeVisible({ timeout: 15_000 });

  const ckLabel = page.locator('label').filter({ hasText: 'Villes & Chevaliers' });
  await ckLabel.locator('input[type="checkbox"]').check();

  await expect(page.getByText(/\(\+3\)/)).toBeVisible();
  await expect(page.getByText('Villes & Chevaliers').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lancer$/i })).toBeVisible();
});

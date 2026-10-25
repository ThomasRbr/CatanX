import { expect, type Page } from '@playwright/test';

export async function openGameSetup(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Nouvelle partie' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  await expect(page.getByRole('region', { name: 'Configuration de la partie' })).toBeVisible({
    timeout: 15_000,
  });
}

export async function advanceSetupToWorld(page: Page): Promise<void> {
  const launch = page.getByRole('button', { name: /^Lancer$/i });
  for (let step = 0; step < 3 && !(await launch.isVisible()); step++) {
    const next = page.getByRole('button', { name: /^Suivant$/i });
    await expect(next).toBeVisible({ timeout: 15_000 });
    await next.click();
  }
  await expect(launch).toBeVisible({ timeout: 15_000 });
}

export async function selectCatanXPreset(page: Page): Promise<void> {
  const preset = page.getByRole('button', { name: /^CatanX\b/i });
  await expect(preset).toBeVisible({ timeout: 15_000 });
  await preset.click();
  await expect(preset).toHaveAttribute('aria-pressed', 'true');
}

export async function startConfiguredGame(page: Page): Promise<void> {
  await advanceSetupToWorld(page);
  await page.getByRole('button', { name: /^Lancer$/i }).click();
}

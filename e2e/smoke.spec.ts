import { test, expect } from '@playwright/test';
import { advanceSetupToWorld, openGameSetup, startConfiguredGame } from './helpers/gameSetup';

test('page de démarrage CatanX', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/CatanX/i);
  await expect(page.locator('#root')).toBeVisible();
});

test('skip link accessible au clavier', async ({ page }) => {
  await page.goto('/');
  const skipLink = page.getByRole('link', { name: /aller au contenu principal/i });
  await expect(skipLink).toBeAttached();
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
});

test('menu principal expose guide et nouvelle partie', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CatanX' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nouvelle partie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guide' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Multijoueur' })).toBeVisible();
});

test('ouvre le guide joueur depuis le menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Guide' }).click();
  await expect(page.getByRole('heading', { name: 'Guide du joueur' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('But de la partie')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('heading', { name: 'Guide du joueur' })).toHaveCount(0);
});

test('parcours configuration classique', async ({ page }) => {
  await openGameSetup(page);
  await expect(page.getByText(/Classique|Personnalisé|CatanX/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await advanceSetupToWorld(page);
  await expect(page.getByRole('button', { name: /^Lancer$/i })).toBeVisible();
});

test('parcours jusqu’à la carte (guide en jeu)', async ({ page }) => {
  await openGameSetup(page);
  await startConfiguredGame(page);
  const guide = page.getByRole('navigation', { name: /Actions de partie/i }).getByRole('button', {
    name: /^Guide$/i,
  });
  await expect(guide).toBeAttached({ timeout: 15_000 });
  await guide.evaluate((el: HTMLElement) => el.click());
  await expect(page.getByRole('heading', { name: 'Guide du joueur' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Guide du joueur' })).toHaveCount(0);
});

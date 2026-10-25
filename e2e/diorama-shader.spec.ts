import { expect, test } from '@playwright/test';

test('Diorama compiles its terrain shaders without WebGL errors', async ({ page }) => {
  const renderErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' || text.includes('THREE.WebGLProgram')) renderErrors.push(text);
  });
  page.on('pageerror', (error) => renderErrors.push(error.message));

  await page.goto('/?scene=diorama&season=summer&shot=island&view=cinematic');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.catanxDioramaReady === 'true',
    undefined,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(2_500);

  expect(renderErrors, renderErrors.join('\n\n')).toEqual([]);
});

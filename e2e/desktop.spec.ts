import { test, expect } from '@playwright/test';
import { signIn, openScheduledMatch, selectFirstOdds } from './helpers';

test.describe('desktop layout', () => {
  test('shows the sidebar and a persistent betslip rail without overlap', async ({ page }) => {
    await signIn(page);
    await page.goto('/');

    const sidenav = page.getByRole('complementary').first();
    const rail = page.getByRole('complementary', { name: 'Betslip panel' });
    await expect(sidenav).toBeVisible();
    await expect(rail).toBeVisible();
    await expect(page.getByRole('button', { name: /Open betslip/ })).toHaveCount(0);

    const railBox = (await rail.boundingBox())!;
    const mainPaddingRight = await page.locator('main').evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
    expect(mainPaddingRight).toBeGreaterThanOrEqual(railBox.width);
  });

  test('selecting odds fills the rail without opening a sheet', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);
    await selectFirstOdds(page);

    const rail = page.getByRole('complementary', { name: 'Betslip panel' });
    await expect(rail.getByLabel('Stake amount')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('holds the layout at 1024 where the rail first appears', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const rail = page.getByRole('complementary', { name: 'Betslip panel' });
    await expect(rail).toBeVisible();
    const railBox = (await rail.boundingBox())!;
    const mainPaddingRight = await page.locator('main').evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
    expect(mainPaddingRight).toBeGreaterThanOrEqual(railBox.width);
  });
});

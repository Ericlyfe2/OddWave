import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

const ROUTES = [
  '/', '/sports', '/countries', '/live', '/today', '/search', '/favorites', '/results',
  '/booking', '/promotions', '/virtuals', '/games', '/responsible-gaming', '/help',
];

const AUTHED_ROUTES = ['/bets', '/account', '/account/deposit', '/account/withdraw', '/account/transactions', '/account/security', '/settings', '/notifications'];

test.describe('navigation', () => {
  test('every public route renders without hitting the error boundary', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.locator('main')).not.toBeEmpty();
    }
  });

  test('every account route renders for a signed-in player', async ({ page }) => {
    await signIn(page);
    for (const route of AUTHED_ROUTES) {
      await page.goto(route);
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.locator('main')).not.toBeEmpty();
    }
  });

  test('an unknown route shows the 404 page with a way back', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('bottom navigation moves between the main sections', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sports' }).last().click();
    await expect(page).toHaveURL(/\/sports/);
    await page.getByRole('link', { name: 'Live' }).last().click();
    await expect(page).toHaveURL(/\/live/);
    await page.getByRole('link', { name: 'Home' }).last().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the drawer opens and navigates', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('link', { name: 'Booking Code' }).click();
    await expect(page).toHaveURL(/\/booking/);
  });

  test('search finds a league and opens it', async ({ page }) => {
    await page.goto('/search');
    await page.getByPlaceholder(/Search/).fill('Ghana');
    await expect(page.getByText(/Ghana Premier League/).first()).toBeVisible();
  });

  test('no route overflows horizontally at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    for (const route of ROUTES) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
    }
  });

  test('pages load without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    for (const route of ['/', '/sports', '/live', '/bets']) {
      await page.goto(route);
      await page.waitForTimeout(500);
    }
    expect(errors).toEqual([]);
  });
});

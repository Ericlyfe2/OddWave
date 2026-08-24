import { test, expect } from '@playwright/test';

test.describe('countries browser', () => {
  test('groups leagues by country and opens one', async ({ page }) => {
    await page.goto('/countries');
    const countries = page.locator('button[aria-expanded]');
    await expect(countries.first()).toBeVisible();
    const total = await countries.count();
    expect(total).toBeGreaterThan(1);

    await countries.first().click();
    const leagues = page.locator('ul li button');
    await expect(leagues.first()).toBeVisible();

    await leagues.first().click();
    await expect(page).toHaveURL(/\/league\//);
    await expect(page.getByText('Event not found')).toHaveCount(0);
  });

  test('filters by country and by league name', async ({ page }) => {
    await page.goto('/countries');
    const filter = page.getByLabel('Filter countries');

    await filter.fill('ghana');
    await expect(page.locator('button[aria-expanded]')).toHaveCount(1);
    await expect(page.getByRole('main').getByText('Ghana')).toBeVisible();

    // Matching a league name should surface its country too.
    await filter.fill('hoops');
    const matched = await page.locator('button[aria-expanded]').count();
    expect(matched).toBeGreaterThan(0);
  });

  test('shows an empty state for an unknown country', async ({ page }) => {
    await page.goto('/countries');
    await page.getByLabel('Filter countries').fill('nowhereland');
    await expect(page.getByText('No countries match')).toBeVisible();
  });

  test('narrows to a single sport', async ({ page }) => {
    await page.goto('/countries');
    const rows = page.locator('button[aria-expanded]');
    await expect(rows.first()).toBeVisible();
    const all = await rows.count();

    await page.getByRole('tab', { name: 'Tennis' }).click();
    await expect.poll(() => rows.count()).toBeLessThan(all);
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('is reachable from the side navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('link', { name: 'Countries' }).click();
    await expect(page).toHaveURL(/\/countries/);
  });
});

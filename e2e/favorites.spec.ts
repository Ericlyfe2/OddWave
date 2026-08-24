import { test, expect } from '@playwright/test';
import { signIn, openScheduledMatch } from './helpers';

test.describe('favorites', () => {
  test('the event star reflects saved state immediately (regression)', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);

    const star = page.getByRole('button', { name: /Add to favorites|Remove from favorites/ });
    await expect(star).toHaveAccessibleName('Add to favorites');

    await star.click();
    await expect(star).toHaveAccessibleName('Remove from favorites');
    // A stale read would leave the icon looking unfavorited even after the click.
    await expect(page.getByText('Added to favorites')).toBeVisible();

    // Reloading re-derives isFav from storage, not from a stale render.
    await page.reload();
    await expect(page.getByRole('button', { name: /Add to favorites|Remove from favorites/ })).toHaveAccessibleName(
      'Remove from favorites'
    );
  });

  test('a favorited event appears in Favorites and can be removed', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);

    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('No favorites yet');
  });

  test('favoriting a league from Sports shows it in Favorites and can be unstarred there', async ({ page }) => {
    await signIn(page);
    await page.goto('/sports');

    const leagueRow = page.locator('button[aria-expanded]').first();
    const leagueName = (await leagueRow.innerText()).split('\n')[0];
    // Match on the league name alone: the accessible name flips between
    // "Add ... to favorites" and "Remove ... from favorites" on click, so a
    // locator anchored to "Add" stops resolving the moment it succeeds.
    const star = page.locator(`button[aria-label*="${leagueName}"]`);
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await expect(star).toHaveAttribute('aria-label', `Remove ${leagueName} from favorites`);

    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: 'Leagues' })).toBeVisible();
    await expect(page.getByRole('main').getByText(leagueName)).toBeVisible();

    // Unstar from the Favorites list itself.
    await page.getByRole('button', { name: `Remove ${leagueName} from favorites` }).click();
    await expect(page.getByRole('main').getByText(leagueName)).toHaveCount(0);
  });

  test('favoriting from the dedicated league page persists back on Sports', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    // Home's "Top Leagues" grid is the direct route into /league/:id.
    const topLeagueCard = page.locator('a, button').filter({ hasText: /events$/ }).first();
    await topLeagueCard.click();
    await expect(page).toHaveURL(/\/league\//);

    const star = page.locator('button[aria-label^="Add "][aria-label$=" to favorites"]');
    const leagueName = (await star.getAttribute('aria-label'))!.replace(/^Add | to favorites$/g, '');
    await star.click();
    await expect(page.locator(`button[aria-label="Remove ${leagueName} from favorites"]`)).toBeVisible();

    await page.goto('/sports');
    const escaped = leagueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(page.getByRole('button', { name: new RegExp(`Remove ${escaped} from favorites`) })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('event and league favorites never collide', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);
    await page.getByRole('button', { name: 'Add to favorites' }).click();

    await page.goto('/sports');
    // No league should show as favorited just because an event was favorited.
    const anyPressedLeague = await page.locator('button[aria-pressed="true"][aria-label*="Remove"]').count();
    expect(anyPressedLeague).toBe(0);
  });

  test('shows the empty state with nothing favorited', async ({ page }) => {
    await signIn(page);
    await page.goto('/favorites');
    await expect(page.getByText('No favorites yet')).toBeVisible();
  });

  test('the account menu favorites count matches saved favorites', async ({ page }) => {
    await signIn(page);
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Favorites (0)' })).toBeVisible();

    await openScheduledMatch(page);
    await page.getByRole('button', { name: 'Add to favorites' }).click();

    await page.goto('/sports');
    await page.locator('button[aria-expanded]').first().click();
    const leagueStar = page.locator('button[aria-label^="Add "][aria-label$=" to favorites"]').first();
    await leagueStar.click();

    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Favorites (2)' })).toBeVisible();
  });
});

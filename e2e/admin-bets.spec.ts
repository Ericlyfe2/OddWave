import { test, expect } from '@playwright/test';
import { signIn, signOut, deposit, openScheduledMatch, openBetslip, betslip, selectFirstOdds, DEMO_ADMIN } from './helpers';

test.describe('admin bet management', () => {
  test('voiding a bet refunds the stake and moves it out of open bets', async ({ page }) => {
    // Fan places a real bet.
    await signIn(page);
    await deposit(page, 100);
    await openScheduledMatch(page);
    await selectFirstOdds(page);
    await openBetslip(page);

    const slip = betslip(page);
    await slip.getByLabel('Stake amount').fill('20');
    await slip.getByRole('button', { name: /^Place Bet/ }).click();
    await expect(page.getByText('Bet Placed!')).toBeVisible({ timeout: 15_000 });
    const code = (await page.getByRole('button', { name: 'Copy booking code' }).innerText()).trim();

    await page.goto('/account');
    await expect(page.getByRole('main').getByText('80.00 GH₵').first()).toBeVisible();

    // Admin finds and voids that exact bet.
    await signOut(page);
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin?tab=bets');
    await expect(page.getByRole('main').getByText(code)).toBeVisible();

    const row = page.locator('div.rounded-xl').filter({ hasText: code });
    await row.getByRole('button', { name: /Void & refund/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Void this bet?' });
    await expect(dialog).toBeVisible();
    await expect(page.getByText('20.00 GH₵ will be refunded to')).toBeVisible();
    await dialog.getByRole('button', { name: 'Trading error' }).click();
    await dialog.getByRole('button', { name: 'Void & Refund', exact: true }).click();

    await expect(page.getByRole('main').getByText(code)).toHaveCount(0);

    // Fan sees the refund and the bet as voided, not open.
    await signOut(page);
    await signIn(page);
    await page.goto('/account');
    await expect(page.getByRole('main').getByText('100.00 GH₵').first()).toBeVisible();

    await page.goto('/bets');
    await expect(page.getByText('No open bets')).toBeVisible();
    await page.getByRole('tab', { name: 'Settled' }).click();
    await page.getByRole('button', { name: /^void$/i }).click();
    await expect(page.getByRole('main').getByText(code)).toBeVisible();
  });

  test('shows an empty state when there are no open bets to manage', async ({ page }) => {
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin?tab=bets');
    await expect(page.getByText('No open bets')).toBeVisible();
  });

  test('the bets tab is only reachable by an admin', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin?tab=bets');
    await expect(page.getByText('Admin access required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bets', exact: true })).toHaveCount(0);
  });
});

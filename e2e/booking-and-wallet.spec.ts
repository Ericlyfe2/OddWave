import { test, expect } from '@playwright/test';
import { signIn, signOut, deposit, openScheduledMatch, openBetslip, betslip, selectFirstOdds, DEMO_ADMIN } from './helpers';

test.describe('booking codes', () => {
  test('saves a slip to a code and reloads it', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);
    await selectFirstOdds(page);
    await openBetslip(page);

    const slip = betslip(page);
    await slip.getByRole('button', { name: 'Save' }).click();
    const toast = page.getByText(/Booking code [A-Z0-9]+ copied/);
    await expect(toast).toBeVisible();
    // Anchored to " copied" rather than a leading \D*: codes can contain digits
    // partway through (e.g. "MLRBW2B9"), and a greedy \D* prefix will backtrack
    // into the code itself to satisfy a {6,10} minimum, silently truncating it.
    const code = (await toast.innerText()).match(/([A-Z0-9]{6,10})\s+copied/)![1];

    await slip.getByRole('button', { name: 'Clear betslip' }).click();
    await expect(slip.getByText('Your betslip is empty')).toBeVisible();

    await slip.getByLabel('Load booking code').fill(code);
    await slip.getByRole('button', { name: 'Load' }).click();
    await expect(page.getByRole('button', { name: /Open betslip, 1 selection/ })).toBeVisible();
  });

  test('reports an unknown code instead of failing silently', async ({ page }) => {
    await signIn(page);
    await page.goto('/booking');
    await page.getByPlaceholder('ENTER CODE').fill('ZZZZZZZZ');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByText(/Invalid|not found|expired/i).first()).toBeVisible();
  });
});

test.describe('wallet', () => {
  test('deposit and withdrawal both move the ledger', async ({ page }) => {
    await signIn(page);
    await deposit(page, 500);
    await expect(page.getByRole('main').getByText('500.00 GH₵').first()).toBeVisible();

    await page.goto('/account/withdraw');
    await page.getByLabel('Withdrawal amount').fill('100');
    await page.getByRole('button', { name: 'Request Withdrawal' }).click();
    await expect(page.getByText(/Withdrawal Requested|on the way|pending/i).first()).toBeVisible({ timeout: 15_000 });

    await page.goto('/account/transactions');
    const ledger = page.getByRole('main');
    await expect(ledger.getByText('deposit', { exact: false }).first()).toBeVisible();
    await expect(ledger.getByText('withdrawal', { exact: false }).first()).toBeVisible();
  });

  test('enforces the minimum withdrawal', async ({ page }) => {
    await signIn(page);
    await deposit(page, 100);
    await page.goto('/account/withdraw');
    await page.getByLabel('Withdrawal amount').fill('5');
    await page.getByRole('button', { name: 'Request Withdrawal' }).click();
    await expect(page.getByText(/Minimum withdrawal/)).toBeVisible();
  });

  test('refuses a withdrawal larger than the balance', async ({ page }) => {
    await signIn(page);
    await deposit(page, 50);
    await page.goto('/account/withdraw');
    await page.getByLabel('Withdrawal amount').fill('5000');
    await page.getByRole('button', { name: 'Request Withdrawal' }).click();
    await expect(page.getByText(/Insufficient|exceed|Maximum/i).first()).toBeVisible();
  });
});

test.describe('betslip ownership', () => {
  test('one account never sees another account’s selections', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);
    await selectFirstOdds(page);
    await expect(page.getByRole('button', { name: /Open betslip, 1 selection/ })).toBeVisible();

    await signOut(page);
    await expect(page.getByRole('button', { name: /Open betslip/ })).toHaveCount(0);

    await signIn(page, DEMO_ADMIN);
    await expect(page.getByRole('button', { name: /Open betslip/ })).toHaveCount(0);

    await signOut(page);
    await signIn(page);
    await expect(page.getByRole('button', { name: /Open betslip, 1 selection/ })).toBeVisible();
  });
});

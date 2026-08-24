import { test, expect } from '@playwright/test';
import { signIn, deposit, openScheduledMatch, openBetslip, betslip, selectFirstOdds } from './helpers';

test.describe('the critical betting journey', () => {
  test('deposit, select, stake, place, cash out, settle into history', async ({ page }) => {
    await signIn(page);
    await deposit(page, 200);
    await expect(page.getByRole('main').getByText('200.00 GH₵').first()).toBeVisible();

    await openScheduledMatch(page);
    await selectFirstOdds(page);

    await openBetslip(page);
    const slip = betslip(page);
    await expect(slip.getByText(/Betslip \(1\)|Betslip/).first()).toBeVisible();

    // Payout recalculates from the stake.
    const stake = slip.getByLabel('Stake amount');
    const readSlip = async () => (await slip.innerText()).replace(/\s+/g, ' ');
    const potentialFor = (text: string) => Number(text.match(/POTENTIAL WIN ([\d,.]+)/i)![1].replace(/,/g, ''));
    const oddsFor = (text: string) => Number(text.match(/Total Odds ([\d.]+)/)![1]);

    await stake.fill('20');
    await expect(async () => {
      const text = await readSlip();
      expect(potentialFor(text)).toBeCloseTo(20 * oddsFor(text), 1);
    }).toPass();

    await stake.fill('40');
    await expect(async () => {
      const text = await readSlip();
      expect(potentialFor(text)).toBeCloseTo(40 * oddsFor(text), 1);
    }).toPass();

    await stake.fill('20');
    await slip.getByRole('button', { name: /^Place Bet/ }).click();
    await expect(page.getByText('Bet Placed!')).toBeVisible({ timeout: 15_000 });

    const bookingCode = await page.getByRole('button', { name: 'Copy booking code' }).innerText();
    expect(bookingCode.trim()).toMatch(/^[A-Z0-9]{6,10}$/);

    // Wallet is debited by the stake.
    await page.goto('/account');
    await expect(page.getByRole('main').getByText('180.00 GH₵').first()).toBeVisible();

    // Bet is open, with a cashout offer.
    await page.goto('/bets');
    await expect(page.getByText(bookingCode.trim())).toBeVisible();
    const cashout = page.getByRole('button', { name: /^Cash Out ·/ });
    await expect(cashout).toBeVisible();

    const cashoutLabel = await cashout.innerText();
    const cashoutAmount = Number(cashoutLabel.replace(/[^0-9.]/g, ''));
    expect(cashoutAmount).toBeGreaterThan(0);
    expect(cashoutAmount).toBeLessThan(20 * 100);

    await cashout.click();
    await expect(page.getByText('No open bets')).toBeVisible({ timeout: 15_000 });

    // Settled history records the cashout, and the wallet is credited.
    await page.getByRole('tab', { name: 'Settled' }).click();
    const settled = page.getByRole('main');
    await expect(settled.getByText('Cashed out at', { exact: false })).toBeVisible();
    await expect(settled.getByText(cashoutAmount.toFixed(2), { exact: false }).first()).toBeVisible();

    await page.goto('/account/transactions');
    const ledger = page.getByRole('main');
    await expect(ledger.getByText('cashout', { exact: false }).first()).toBeVisible();
    await expect(ledger.getByText('stake', { exact: false }).first()).toBeVisible();
    await expect(ledger.getByText('deposit', { exact: false }).first()).toBeVisible();
  });

  test('refuses a bet the wallet cannot cover', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);
    await selectFirstOdds(page);
    await openBetslip(page);

    const slip = betslip(page);
    await slip.getByLabel('Stake amount').fill('50');
    await expect(slip.getByText(/Insufficient balance/)).toBeVisible();
  });

  test('a multi combines selections into one ticket', async ({ page }) => {
    await signIn(page);
    await deposit(page, 100);

    await openScheduledMatch(page);
    await selectFirstOdds(page);

    // A second selection, from a different fixture.
    await page.goto('/sports');
    await page.locator('button[aria-expanded]').first().click();
    await page.locator('div[role="button"]').nth(1).click();
    await expect(page).toHaveURL(/\/match\//);
    await selectFirstOdds(page);
    await expect(page.getByRole('button', { name: /Open betslip, 2 selection/ })).toBeVisible();

    await openBetslip(page);
    const slip = betslip(page);
    await slip.getByRole('radio', { name: 'Multi' }).click();
    await expect(slip.getByRole('radio', { name: 'Multi' })).toBeChecked();
    await expect(slip.getByText(/Total Odds/)).toBeVisible();

    await slip.getByLabel('Stake amount').fill('10');
    await slip.getByRole('button', { name: /^Place Bet/ }).click();
    await expect(page.getByText('Bet Placed!')).toBeVisible({ timeout: 15_000 });

    await page.goto('/bets');
    await expect(page.getByRole('main').getByText(/open · multi/i).first()).toBeVisible();
  });

  test('selections survive navigation across the app', async ({ page }) => {
    await signIn(page);
    await openScheduledMatch(page);
    await selectFirstOdds(page);

    for (const route of ['/', '/live', '/promotions', '/results', '/account']) {
      await page.goto(route);
      await expect(page.getByRole('button', { name: /Open betslip, 1 selection/ })).toBeVisible();
    }

    // Assert on the selection itself rather than its price: odds drift once a
    // fixture goes live, and that drift is not what this test is about.
    await openBetslip(page);
    await expect(betslip(page).getByRole('button', { name: /^Remove / })).toHaveCount(1);
  });
});

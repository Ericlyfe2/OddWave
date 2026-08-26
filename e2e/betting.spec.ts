import { test, expect } from '@playwright/test';
import { signIn, deposit, readBalance, openScheduledMatch, openBetslip, betslip, selectFirstOdds } from './helpers';

test.describe('the critical betting journey', () => {
  test('deposit, select, stake, place, cash out, settle into history', async ({ page }) => {
    await signIn(page);
    // The demo account's wallet is one real, shared, persistent ledger now
    // (not a fresh-per-browser-context localStorage balance) — other tests
    // in this same run may have already deposited into it, so assert the
    // deposit's effect as a delta against whatever the balance already was,
    // not an absolute figure.
    const before = await readBalance(page);
    await deposit(page, 200);
    await expect(page.getByRole('main').getByText(`${(before + 200).toFixed(2)} GH₵`).first()).toBeVisible();

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
    await expect(page.getByRole('main').getByText(`${(before + 180).toFixed(2)} GH₵`).first()).toBeVisible();

    // Bet is open, with a cashout offer. The shared demo account can have
    // other open bets left by other tests in this same run, so scope
    // everything to this specific bet's own card (matched by booking code)
    // rather than assuming it's the only one / that the list goes empty
    // once it's cashed out.
    await page.goto('/bets');
    const code = bookingCode.trim();
    const card = page.locator('div.rounded-xl').filter({ hasText: code });
    await expect(card).toBeVisible();
    const cashout = card.getByRole('button', { name: /^Cash Out ·/ });
    await expect(cashout).toBeVisible();

    const cashoutLabel = await cashout.innerText();
    const cashoutAmount = Number(cashoutLabel.replace(/[^0-9.]/g, ''));
    expect(cashoutAmount).toBeGreaterThan(0);
    expect(cashoutAmount).toBeLessThan(20 * 100);

    await cashout.click();
    await expect(page.getByRole('main').getByText(code)).toHaveCount(0, { timeout: 15_000 });

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

    // Stake comfortably above anything this suite's other tests could have
    // accumulated in the shared demo wallet, but still under LIMITS.maxStake
    // (20000) so the rejection is genuinely "insufficient balance", not a
    // different "maximum stake" error.
    const slip = betslip(page);
    await slip.getByLabel('Stake amount').fill('15000');
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

import { test, expect, type Page } from '@playwright/test';
import { signIn, deposit, openScheduledMatch, openBetslip, betslip } from './helpers';

// Reads the stored notification count directly rather than navigating to
// /account and scraping its badge text: that extra page hop was interacting
// badly with the odds-selection step that follows in some tests, and a data-
// level read is a more precise check of the store logic being verified here
// anyway, since it isn't coupled to how the badge happens to render.
async function unreadCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const notifs = JSON.parse(localStorage.getItem('oddwave:v1:notifs') ?? '[]') as Array<{ read: boolean }>;
    return notifs.filter((n) => !n.read).length;
  });
}

/**
 * Live odds can re-price on their own tick independently of anything the
 * test does; occasionally that lands squarely between the click landing and
 * the aria-pressed state committing, so a single click can be missed. Retry
 * a few times rather than let that timing coincidence fail the test.
 */
async function selectOddsReliably(page: Page): Promise<void> {
  const cell = page.locator('button[aria-pressed]:not([disabled])').first();
  for (let attempt = 0; attempt < 3; attempt++) {
    await cell.click();
    try {
      await expect(cell).toHaveAttribute('aria-pressed', 'true', { timeout: 4_000 });
      return;
    } catch {
      // try again
    }
  }
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
}

async function placeSmallBet(page: Page): Promise<void> {
  await openScheduledMatch(page);
  await selectOddsReliably(page);
  await openBetslip(page);
  const slip = betslip(page);
  await slip.getByLabel('Stake amount').fill('5');
  await slip.getByRole('button', { name: /^Place Bet/ }).click();
  await expect(page.getByText('Bet Placed!')).toBeVisible({ timeout: 15_000 });
}

test.describe('notification preferences', () => {
  test('toggling "Bet updates" off suppresses bet notifications; on delivers them', async ({ page }) => {
    await signIn(page);
    await deposit(page, 200);

    await page.goto('/settings');
    const betToggle = page.getByRole('switch', { name: /Bet updates/ });
    await expect(betToggle).toHaveAttribute('aria-checked', 'true');
    await betToggle.click();
    await expect(betToggle).toHaveAttribute('aria-checked', 'false');

    const before = await unreadCount(page);
    await placeSmallBet(page);
    const afterSuppressed = await unreadCount(page);
    expect(afterSuppressed).toBe(before);

    await page.goto('/settings');
    await page.getByRole('switch', { name: /Bet updates/ }).click();
    await expect(page.getByRole('switch', { name: /Bet updates/ })).toHaveAttribute('aria-checked', 'true');

    await placeSmallBet(page);
    const afterDelivered = await unreadCount(page);
    expect(afterDelivered).toBe(afterSuppressed + 1);
  });

  test('deposit and withdrawal notifications are never suppressed, even with every toggle off', async ({ page }) => {
    await signIn(page);

    await page.goto('/settings');
    for (const label of [/Bet updates/, /Live events/, /Promotions/]) {
      const toggle = page.getByRole('switch', { name: label });
      if ((await toggle.getAttribute('aria-checked')) === 'true') await toggle.click();
    }

    const before = await unreadCount(page);
    await deposit(page, 50);
    const after = await unreadCount(page);
    expect(after).toBeGreaterThan(before);

    await page.goto('/notifications');
    await expect(page.getByRole('main').getByText('Deposit').first()).toBeVisible();
  });

  test('the withdrawal-approved notice is correctly categorized, not shown as a deposit', async ({ page }) => {
    // The real auto-approve sweep only fires WITHDRAWAL_AUTO_APPROVE_MS
    // (2 minutes) after the request. A localStorage rewrite can't fake that:
    // the sweep reads the already-running zustand store's in-memory state,
    // which a raw storage write never touches. Playwright's clock replaces
    // the page's own Date/timers, so advancing it genuinely ages the request
    // and fires the interval-based sweep — install it before anything else
    // starts so the whole page (including the store's initial load) runs on it.
    await page.clock.install();

    await signIn(page);
    await deposit(page, 100);

    await page.goto('/account/withdraw');
    await page.getByLabel('Withdrawal amount').fill('30');
    await page.getByRole('button', { name: 'Request Withdrawal' }).click();
    await expect(page.getByText(/Withdrawal Requested|on the way|pending/i).first()).toBeVisible({ timeout: 15_000 });

    // Advance past the auto-approve threshold, letting the sweep's setInterval
    // actually fire along the way rather than just jumping the clock.
    await page.clock.runFor(2 * 60_000 + 20_000);

    await page.goto('/notifications');
    await expect(page.getByRole('main').getByText('Withdrawal approved')).toBeVisible({ timeout: 10_000 });

    // The visible copy alone can't distinguish `kind`, since only the icon and
    // tone key off it — assert on the stored record directly, which is what
    // was actually mislabeled ('deposit' instead of 'withdrawal') before the fix.
    const kind = await page.evaluate(() => {
      const notifs = JSON.parse(localStorage.getItem('oddwave:v1:notifs') ?? '[]');
      return notifs.find((n: { title: string }) => n.title === 'Withdrawal approved')?.kind;
    });
    expect(kind).toBe('withdrawal');
  });
});

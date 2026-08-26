import { test, expect, type Page } from '@playwright/test';
import { signIn, deposit, openScheduledMatch, openBetslip, betslip, DEMO_ADMIN } from './helpers';

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

  test('the withdrawal-approved notice is correctly categorized, not shown as a deposit', async ({ page, browser }) => {
    // The withdrawal auto-approve sweep is a real server-side process now
    // (server/src/walletSweep.ts, a genuine setInterval in the Node process),
    // not client-driven state a fake clock can fast-forward — page.clock
    // only fakes THIS page's own timers, and has no effect on the server, so
    // advancing it does nothing to actually age and approve the request.
    // Trigger the approval directly via an admin (same effect the real
    // sweep has, immediately, instead of waiting out its real 2-minute
    // threshold), then wait on this page's own real notification poller
    // (src/store/wallet.ts's startWithdrawalNotificationPoller, a real 15s
    // client-side interval) to pick up the change and notify — that's the
    // actual client behavior this test exists to verify.
    await signIn(page);
    await deposit(page, 100);

    await page.goto('/account/withdraw');
    await page.getByLabel('Withdrawal amount').fill('30');
    await page.getByRole('button', { name: 'Request Withdrawal' }).click();
    await expect(page.getByText(/Withdrawal Requested|on the way|pending/i).first()).toBeVisible({ timeout: 15_000 });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, DEMO_ADMIN);
    await adminPage.goto('/admin?tab=withdrawals');
    // listPendingWithdrawals is cross-user and ordered oldest-first, so
    // `.first()` can approve a DIFFERENT pending withdrawal left over from
    // another test (e.g. booking-and-wallet.spec.ts's own request, which
    // only auto-approves after a real 2-minute delay) instead of the 30
    // GH₵ request this test just created. Scope the click to that specific
    // card by its displayed amount.
    const card = adminPage.locator('div.rounded-xl').filter({ hasText: '30.00' });
    await card.getByRole('button', { name: /Approve/ }).click();
    // Wait for the mutation + refetch to actually land (the card leaving the
    // pending list) before tearing down the context — closing immediately
    // after the click can abort the in-flight request.
    await expect(card).toHaveCount(0);
    await adminContext.close();

    // Poll the actual write target instead of guessing a fixed sleep long
    // enough to cover one real poller tick (~15s) plus its own network
    // round trip (notifPrefsFor) before the notification is written.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const notifs = JSON.parse(localStorage.getItem('oddwave:v1:notifs') ?? '[]') as Array<{ title: string }>;
            return notifs.some((n) => n.title === 'Withdrawal approved');
          }),
        { timeout: 30_000 }
      )
      .toBe(true);

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

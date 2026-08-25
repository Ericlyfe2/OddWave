import { test, expect, type Page } from '@playwright/test';
import { signIn, signOut, DEMO_PLAYER } from './helpers';

async function signInWith(page: Page, email: string, password: string) {
  await page.goto('/auth');
  await page.getByPlaceholder('Email Address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).last().click();
}

test.describe('account security', () => {
  test('reaches the security screen from the account menu', async ({ page }) => {
    await signIn(page);
    await page.goto('/account');
    await page.getByRole('button', { name: /Security & Sessions/ }).click();
    await expect(page).toHaveURL(/\/account\/security/);
    await expect(page.getByRole('main').getByText('Change Password')).toBeVisible();
  });

  test('rejects a wrong current password and a mismatched confirmation', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/security');

    await page.getByLabel('Current password').fill('Fan12345');
    await page.getByLabel('New password', { exact: true }).fill('Newpass123');
    await page.getByLabel('Confirm new password').fill('Different123');
    await page.getByRole('button', { name: /Update Password/ }).click();
    await expect(page.getByText('New passwords do not match')).toBeVisible();

    await page.getByLabel('Confirm new password').fill('Newpass123');
    await page.getByLabel('Current password').fill('definitely-wrong');
    await page.getByRole('button', { name: /Update Password/ }).click();
    await expect(page.getByText('Current password is incorrect')).toBeVisible();
  });

  test('a changed password actually replaces the old one', async ({ page }) => {
    // The demo account's password is a fixed, shared credential (the login
    // screen's own quick-fill button, and every other test's signIn() helper,
    // hardcode 'Fan12345') against one real, persistent database — a failed
    // assertion partway through rotation must not leave it stuck on
    // 'Rotated456' and poison every test that runs after this one, so the
    // restore runs in `finally` no matter what fails above it.
    try {
      await signIn(page);
      await page.goto('/account/security');
      await page.getByLabel('Current password').fill('Fan12345');
      await page.getByLabel('New password', { exact: true }).fill('Rotated456');
      await page.getByLabel('Confirm new password').fill('Rotated456');
      await page.getByRole('button', { name: /Update Password/ }).click();
      await expect(page.getByText('Password updated')).toBeVisible();

      await signOut(page);

      await signInWith(page, DEMO_PLAYER, 'Fan12345');
      await expect(page.getByText(/Incorrect email or password/)).toBeVisible();

      await signInWith(page, DEMO_PLAYER, 'Rotated456');
      await expect(page).not.toHaveURL(/\/auth/);
    } finally {
      // Restore via direct API calls rather than the UI: a UI-driven restore
      // (fill/click/check-for-toast) has exactly the timing hazard this file
      // fixes elsewhere — the toast can render after a short isVisible()
      // check gives up, which reads as failure even though the mutation
      // landed, sending a second attempt in with the wrong current password
      // and leaving the account rotated for every later test. Signing in via
      // the API tells us the real state with no UI involved.
      const rotatedSignIn = await page.request.post('/api/auth.signIn', {
        data: { email: DEMO_PLAYER, password: 'Rotated456' },
      });
      const rotatedBody = await rotatedSignIn.json().catch(() => null);
      if (rotatedBody?.result?.data?.profile) {
        const restore = await page.request.post('/api/auth.changePassword', {
          data: { currentPassword: 'Rotated456', newPassword: 'Fan12345' },
        });
        if (!restore.ok()) throw new Error(`security.spec.ts: failed to restore demo password (${restore.status()})`);
      }
      // else: current password is already 'Fan12345' (either the rotation
      // above never landed, or a prior restore already ran) — nothing to do.
    }
  });

  test('verifies a contact channel with the issued code', async ({ page }) => {
    // Unlike the password test above, there's no `unverifyContact` endpoint to
    // reset emailVerified/phoneVerified afterward, so this test is only
    // idempotent against a freshly-seeded demo account (`npm run db:seed`) —
    // running it twice in a row without reseeding leaves the account already
    // verified and this precondition fails.
    await signIn(page);
    await page.goto('/account/security');
    await expect(page.getByText('Not verified').first()).toBeVisible();

    await page.getByRole('button', { name: 'Verify' }).first().click();
    // requestVerification is now a real network round trip (it used to generate
    // the code synchronously in-browser), so the code text isn't there the
    // instant the button click resolves — wait for it rather than reading
    // immediately.
    const codeNote = page.getByText(/your code is/);
    await expect(codeNote).toContainText(/\d{6}/);
    const note = await codeNote.innerText();
    const code = note.match(/(\d{6})/)![1];

    await page.getByLabel('Verification code').fill('000000');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Invalid verification code')).toBeVisible();

    await page.getByLabel('Verification code').fill(code);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  });

  test('lists another device and revokes only that one', async ({ page, browser }) => {
    await signIn(page);

    // The demo account is one real, persistent row shared by every test run,
    // not isolated per test — clear out anything left over from earlier runs
    // first, via a direct API call (shares page's cookie jar) rather than the
    // UI, so this doesn't depend on the session list's own load timing.
    const cleanup = await page.request.post('/api/auth.revokeOtherSessions', { data: {} });
    expect(cleanup.ok()).toBe(true);

    // A second device is a second browser context with its own cookie jar,
    // signed in to the same account — exactly how a real second device behaves.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await signIn(otherPage);

    await page.goto('/account/security');
    await page.reload();
    await expect(page.getByRole('button', { name: /^Revoke session/ })).toHaveCount(2);
    await expect(page.getByText('This device')).toHaveCount(1);

    await page.getByRole('button', { name: /Sign out other devices/ }).click();
    await expect(page.getByText(/1 other session revoked/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Revoke session/ })).toHaveCount(1);

    // Revoking someone else's session must not sign this device out.
    await page.goto('/bets');
    await expect(page).not.toHaveURL(/\/auth/);

    // The other device really is signed out now.
    await otherPage.goto('/bets');
    await expect(otherPage).toHaveURL(/\/auth/);
    await otherContext.close();
  });

  test('a revoked session no longer restores on reload', async ({ page, browser }) => {
    await signIn(page);

    // Same shared-account cleanup as the previous test, same reasoning.
    const cleanup = await page.request.post('/api/auth.revokeOtherSessions', { data: {} });
    expect(cleanup.ok()).toBe(true);

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await signIn(otherPage);
    await otherPage.goto('/account/security');
    // Revoke every other session from the second device's own view of itself —
    // i.e. revoke the *first* page's session from here.
    await otherPage.getByRole('button', { name: /Sign out other devices/ }).click();
    // The click firing isn't the mutation completing — wait for confirmation
    // before checking the other device's fate, same as everywhere else this
    // action appears in this file.
    await expect(otherPage.getByText(/other sessions? revoked/)).toBeVisible();

    await page.goto('/bets');
    await expect(page).toHaveURL(/\/auth/);
    await otherContext.close();
  });

  test('revoking the current session signs this device out', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/security');
    await page.getByRole('button', { name: /^Revoke session/ }).first().click();
    await expect(page).toHaveURL(/\/auth/);

    await page.goto('/bets');
    await expect(page).toHaveURL(/\/auth/);
  });
});

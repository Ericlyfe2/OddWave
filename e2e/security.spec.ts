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
  });

  test('verifies a contact channel with the issued code', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/security');
    await expect(page.getByText('Not verified').first()).toBeVisible();

    await page.getByRole('button', { name: 'Verify' }).first().click();
    const note = await page.getByText(/your code is/).innerText();
    const code = note.match(/(\d{6})/)![1];

    await page.getByLabel('Verification code').fill('000000');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Invalid verification code')).toBeVisible();

    await page.getByLabel('Verification code').fill(code);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  });

  test('lists another device and revokes only that one', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/security');
    await expect(page.getByRole('button', { name: /^Revoke session/ })).toHaveCount(1);

    // The registry is the app's own storage, so a second device is seeded there
    // directly. A separate browser context cannot stand in for one: it gets its
    // own localStorage, which is the demo's substitute for a shared backend.
    await page.evaluate(() => {
      const KEY = 'oddwave:v1:device_sessions';
      const registry = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      const mine = registry['u-fan'] ?? [];
      mine.push({
        id: 'sess-other-device',
        userId: 'u-fan',
        device: 'Safari on iOS',
        createdAt: Date.now() - 3_600_000,
        lastSeenAt: Date.now() - 600_000,
        exp: Date.now() + 86_400_000,
      });
      registry['u-fan'] = mine;
      localStorage.setItem(KEY, JSON.stringify(registry));
    });

    await page.reload();
    await expect(page.getByRole('button', { name: /^Revoke session/ })).toHaveCount(2);
    await expect(page.getByText('Safari on iOS')).toBeVisible();
    await expect(page.getByText('This device')).toHaveCount(1);

    await page.getByRole('button', { name: /Sign out other devices/ }).click();
    await expect(page.getByText(/1 other session revoked/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Revoke session/ })).toHaveCount(1);
    await expect(page.getByText('Safari on iOS')).toHaveCount(0);

    // Revoking someone else's session must not sign this device out.
    await page.goto('/bets');
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('a revoked session no longer restores on reload', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/security');

    // Drop this device's own record, as another device revoking it would.
    await page.evaluate(() => {
      const KEY = 'oddwave:v1:device_sessions';
      const registry = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      registry['u-fan'] = [];
      localStorage.setItem(KEY, JSON.stringify(registry));
    });

    await page.goto('/bets');
    await expect(page).toHaveURL(/\/auth/);
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

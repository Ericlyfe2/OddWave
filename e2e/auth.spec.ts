import { test, expect } from '@playwright/test';
import { signIn, signOut, DEMO_ADMIN } from './helpers';

test.describe('authentication', () => {
  test('rejects bad credentials with a readable error', async ({ page }) => {
    await page.goto('/auth');
    await page.getByPlaceholder('Email Address').fill('nobody@oddwave.demo');
    await page.getByPlaceholder('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login', exact: true }).last().click();
    await expect(page.getByText(/No account found|Incorrect email or password/)).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('signs a player in and back out', async ({ page }) => {
    await signIn(page);
    await page.goto('/account');
    await expect(page.getByRole('main').getByText('Kwame Fan')).toBeVisible();

    await signOut(page);
    await expect(page.getByRole('link', { name: 'Join' })).toBeVisible();
  });

  test('sends signed-out visitors from a protected route to sign in', async ({ page }) => {
    await page.goto('/bets');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('registers a new account and lands signed in', async ({ page }) => {
    const email = `player.${Date.now()}@oddwave.demo`;
    await page.goto('/auth');
    await page.getByRole('button', { name: 'Sign Up' }).first().click();
    await page.getByPlaceholder('Full Name').fill('Ama Tester');
    await page.getByPlaceholder(/Phone/).fill('0244000111');
    await page.getByPlaceholder('Email Address').fill(email);
    await page.getByPlaceholder('Password').fill('Testing123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).not.toHaveURL(/\/auth/);
    await page.goto('/account');
    await expect(page.getByRole('main').getByText('Ama Tester')).toBeVisible();
  });

  test('keeps the admin console away from ordinary players', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin');
    await expect(page.getByText('Admin access required')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin Console' })).toHaveCount(0);
  });

  test('lets an admin into the console', async ({ page }) => {
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible();
    await expect(page.getByText('Admin access required')).toHaveCount(0);
  });
});

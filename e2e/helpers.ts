import { expect, type Page } from '@playwright/test';

export const DEMO_PLAYER = 'fan@oddwave.demo';
export const DEMO_ADMIN = 'admin@oddwave.demo';

/** Signs in through the real form using the demo quick-fill buttons. */
export async function signIn(page: Page, email: string = DEMO_PLAYER): Promise<void> {
  await page.goto('/auth');
  await page.getByRole('button', { name: new RegExp(email) }).click();
  await page.getByRole('button', { name: 'Login', exact: true }).last().click();
  await expect(page).toHaveURL(/\/$|\/(?!auth)/);
  await expect(page.getByRole('link', { name: 'Account' }).first()).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign Out' }).first().click();
  await expect(page.getByRole('link', { name: 'Login' }).first()).toBeVisible();
}

/** Funds the wallet through the deposit screen so bets can actually be placed. */
export async function deposit(page: Page, amount: number): Promise<void> {
  await page.goto('/account/deposit');
  await page.locator('input[type="tel"]').fill('0244567890');
  await page.locator('input[type="number"]').fill(String(amount));
  await page.getByRole('button', { name: /^Deposit\s/ }).click();
  await expect(page).toHaveURL(/\/account$/, { timeout: 15_000 });
}

/**
 * Opens a scheduled (non-virtual) fixture. Virtual rounds recycle every ~40s,
 * so tests must never depend on one still existing a moment later.
 */
export async function openScheduledMatch(page: Page): Promise<void> {
  await page.goto('/sports');
  await page.locator('button[aria-expanded]').first().click();
  await page.locator('div[role="button"]').first().click();
  await expect(page).toHaveURL(/\/match\//);
  await expect(page.getByText('Event not found')).toHaveCount(0);
}

/** The betslip panel: a bottom sheet on phones, a fixed rail on desktop. */
export async function openBetslip(page: Page): Promise<void> {
  const floating = page.getByRole('button', { name: /Open betslip/ });
  if (await floating.isVisible().catch(() => false)) {
    await floating.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  }
}

export function betslip(page: Page) {
  return page.getByRole('dialog').or(page.getByRole('complementary', { name: 'Betslip panel' })).first();
}

/** Adds the first available selection on the current match page. */
export async function selectFirstOdds(page: Page): Promise<string> {
  const cell = page.locator('button[aria-pressed]:not([disabled])').first();
  const label = (await cell.getAttribute('aria-label')) ?? '';
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  return label;
}

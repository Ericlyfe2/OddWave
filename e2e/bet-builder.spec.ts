import { test, expect } from '@playwright/test';
import { signIn, openFootballMatch, openBetslip, betslip } from './helpers';

test.describe('bet builder same-market conflicts', () => {
  test('picking a second outcome from the same market swaps it instead of stacking', async ({ page }) => {
    await signIn(page);
    await openFootballMatch(page);

    const builderToggle = page.getByRole('button', { name: 'Create Bet Builder' });
    await expect(builderToggle).toBeVisible();
    await builderToggle.click();
    await expect(page.getByRole('button', { name: /Bet Builder ON/ })).toBeVisible();

    // Two mutually exclusive outcomes from the same "Match Result" market.
    await page.getByRole('button', { name: 'Match Result: 1' }).click();
    await expect(page.getByRole('button', { name: /Bet Builder ON — 1 market/ })).toBeVisible();

    await page.getByRole('button', { name: 'Match Result: 2' }).click();

    // A toast confirms the swap, not a silent stack.
    await expect(page.getByRole('status').filter({ hasText: 'one selection per market in Bet Builder' })).toBeVisible();

    // Still one market combined, not two — the second pick replaced the first.
    await expect(page.getByRole('button', { name: /Bet Builder ON — 1 market\b/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bet Builder ON — 2 markets/ })).toHaveCount(0);

    await openBetslip(page);
    const slip = betslip(page);
    await expect(slip.getByRole('button', { name: /^Remove / })).toHaveCount(1);
    // The surviving selection is "2" (Match Result), not the original "1".
    await expect(slip.getByRole('button', { name: /^Remove 2 on/ })).toBeVisible();
  });

  test('a second, different market from the same match combines alongside the first', async ({ page }) => {
    await signIn(page);
    await openFootballMatch(page);

    await page.getByRole('button', { name: 'Create Bet Builder' }).click();
    await page.getByRole('button', { name: 'Match Result: 1' }).click();

    // "Total Goals" lives in the collapsed "Goals" accordion group.
    await page.getByRole('button', { name: /^Goals \d markets?$/ }).click();

    // A different, Bet-Builder-eligible market on the same match.
    const overButton = page.getByRole('button', { name: /^Total Goals [\d.]+: Over [\d.]+$/ });
    await overButton.click();

    await expect(page.getByRole('button', { name: /Bet Builder ON — 2 markets/ })).toBeVisible();

    await openBetslip(page);
    const slip = betslip(page);
    await expect(slip.getByRole('button', { name: /^Remove / })).toHaveCount(2);
  });
});

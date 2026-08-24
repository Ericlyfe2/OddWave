import { test, expect } from '@playwright/test';
import { signIn, DEMO_ADMIN } from './helpers';

test.describe('admin promotions management', () => {
  test('creates a campaign that immediately appears for customers', async ({ page }) => {
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin?tab=promotions');

    await page.getByRole('button', { name: /New Campaign/ }).click();
    const dialog = page.getByRole('dialog', { name: 'New Campaign' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'boost', exact: true }).click();
    await dialog.getByLabel('Campaign title').fill('E2E Test Boost');
    await dialog.getByLabel('Campaign blurb').fill('Created by an automated test.');
    await dialog.getByLabel('Bonus value').fill('15');
    await dialog.getByLabel('Campaign terms').fill('Term one\nTerm two');
    await dialog.getByRole('button', { name: 'Create Campaign' }).click();

    await expect(dialog).toBeHidden();
    const card = page.locator('div.rounded-xl').filter({ hasText: 'E2E Test Boost' });
    await expect(card).toBeVisible();
    await expect(card.getByText('live', { exact: true })).toBeVisible();

    await page.goto('/promotions');
    await expect(page.getByRole('main').getByText('E2E Test Boost')).toBeVisible();
    await expect(page.getByRole('main').getByText('Created by an automated test.')).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('main').getByText('E2E Test Boost')).toBeVisible();
  });

  test('hiding a campaign removes it from customer pages but keeps it in admin', async ({ page }) => {
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin?tab=promotions');

    const card = page.locator('div.rounded-xl').filter({ hasText: '100% Welcome Boost' });
    await card.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(card.getByText('hidden', { exact: true })).toBeVisible();

    await page.goto('/promotions');
    await expect(page.getByRole('main').getByText('100% Welcome Boost')).toHaveCount(0);

    await page.goto('/');
    await expect(page.getByRole('main').getByText('100% Welcome Boost')).toHaveCount(0);

    // Publishing again restores it everywhere.
    await page.goto('/admin?tab=promotions');
    const cardAgain = page.locator('div.rounded-xl').filter({ hasText: '100% Welcome Boost' });
    await cardAgain.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(cardAgain.getByText('live', { exact: true })).toBeVisible();

    await page.goto('/promotions');
    await expect(page.getByRole('main').getByText('100% Welcome Boost')).toBeVisible();
  });

  test('editing a campaign updates its content everywhere', async ({ page }) => {
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin?tab=promotions');

    const card = page.locator('div.rounded-xl').filter({ hasText: 'Free Bet Friday' });
    await card.getByRole('button', { name: 'Edit', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit Campaign' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Bonus value').fill('99');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.locator('div.rounded-xl').filter({ hasText: 'Free Bet Friday' })).toContainText('99.00 GH₵');

    await page.goto('/promotions');
    await expect(page.getByRole('main').getByText('99', { exact: true })).toBeVisible();
  });

  test('deleting a campaign removes it everywhere', async ({ page }) => {
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin?tab=promotions');

    await page.getByRole('button', { name: /New Campaign/ }).click();
    const createDialog = page.getByRole('dialog', { name: 'New Campaign' });
    await createDialog.getByLabel('Campaign title').fill('Deletable Campaign');
    await createDialog.getByLabel('Campaign blurb').fill('Will be deleted.');
    await createDialog.getByRole('button', { name: 'Create Campaign' }).click();
    await expect(createDialog).toBeHidden();

    const card = page.locator('div.rounded-xl').filter({ hasText: 'Deletable Campaign' });
    await card.getByRole('button', { name: 'Delete', exact: true }).click();

    const confirm = page.getByRole('dialog', { name: 'Delete this campaign?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.locator('div.rounded-xl').filter({ hasText: 'Deletable Campaign' })).toHaveCount(0);

    await page.goto('/promotions');
    await expect(page.getByRole('main').getByText('Deletable Campaign')).toHaveCount(0);
  });

  test('a claimed promotion still shows a customer-facing empty state once every campaign is hidden', async ({ page }) => {
    await signIn(page, DEMO_ADMIN);
    await page.goto('/admin?tab=promotions');

    // Repeatedly click the first "Hide" button and wait (via toHaveCount's
    // built-in retry) for the count to actually drop before continuing. A
    // blind click-then-requery loop races React's re-render: querying again
    // before the DOM commits can re-select and re-click the same node,
    // toggling that campaign back to live instead of advancing to the next.
    const hideButtons = page.getByRole('button', { name: 'Hide', exact: true });
    // .count() is a one-shot DOM snapshot with no auto-wait, unlike expect();
    // the admin console (overview + ops) can still be rendering right after
    // navigation, so wait for the first button before trusting the count.
    await expect(hideButtons.first()).toBeVisible();
    let remaining = await hideButtons.count();
    expect(remaining).toBeGreaterThan(0);
    while (remaining > 0) {
      await hideButtons.first().click();
      remaining -= 1;
      await expect(hideButtons).toHaveCount(remaining);
    }

    await page.goto('/promotions');
    await expect(page.getByText('No promotions right now')).toBeVisible();

    // Restore for the next test run, the same careful way.
    await page.goto('/admin?tab=promotions');
    const publishButtons = page.getByRole('button', { name: 'Publish', exact: true });
    let toRestore = await publishButtons.count();
    while (toRestore > 0) {
      await publishButtons.first().click();
      toRestore -= 1;
      await expect(publishButtons).toHaveCount(toRestore);
    }
    await page.goto('/promotions');
    await expect(page.getByText('No promotions right now')).toHaveCount(0);
  });

  test('customers cannot reach the promotions admin tab', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin?tab=promotions');
    await expect(page.getByText('Admin access required')).toBeVisible();
    await expect(page.getByRole('button', { name: /New Campaign/ })).toHaveCount(0);
  });
});

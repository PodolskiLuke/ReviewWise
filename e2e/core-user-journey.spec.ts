import { expect, test } from '@playwright/test';

test.describe('Core user smoke journey', () => {
  test('shows login state when unauthenticated', async ({ page }) => {
    await page.route('**/api/auth/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: false })
      });
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Welcome to ReviewWise' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Login with GitHub' })).toBeVisible();
  });

  test('authenticated flow loads repositories, selects PR, and generates review', async ({ page }) => {
    await page.route('**/api/auth/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          username: 'ci-user',
          provider: 'GitHub'
        })
      });
    });

    await page.goto('/');

    await expect(page.getByText('Signed in as ci-user via GitHub')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Authenticated navigation' })
      .getByRole('link', { name: 'Repositories', exact: true })
      .click();
    await expect(page).toHaveURL(/\/repositories$/);

    const repositoryOption = page.getByRole('option').filter({ hasText: 'ReviewWise' });
    await expect(repositoryOption).toBeVisible({ timeout: 20000 });

    await repositoryOption.click();

    await expect(page.getByRole('heading', { name: 'Selected repository: ReviewWise' })).toBeVisible();
    const pullRequestOption = page.getByRole('option', { name: '#101 Add e2e smoke test' });
    await expect(pullRequestOption).toBeVisible();

    await pullRequestOption.click();

    await expect(page.getByText('Generated review: looks good overall.')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('status').filter({ hasText: 'Review generated and displayed.' })).toBeVisible({ timeout: 15000 });
  });
});

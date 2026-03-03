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
    let recentReviews: Array<{ owner: string; repo: string; prNumber: number; createdAt: string; username: string }> = [];

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

    await page.route('**/api/repositories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, name: 'ReviewWise', owner: { login: 'PodolskiLuke' } }])
      });
    });

    await page.route('**/api/repositories/PodolskiLuke/ReviewWise/pull-requests', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ number: 101, title: 'Add e2e smoke test' }])
      });
    });

    await page.route('**/api/repositories/PodolskiLuke/ReviewWise/pull-requests/101/review', async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ review: null, createdAt: null, username: null })
        });
        return;
      }

      if (method === 'POST') {
        const createdAt = new Date().toISOString();
        recentReviews = [{
          owner: 'PodolskiLuke',
          repo: 'ReviewWise',
          prNumber: 101,
          createdAt,
          username: 'ci-user'
        }];

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            review: 'Generated review: looks good overall.',
            createdAt,
            username: 'ci-user',
            reused: false
          })
        });
        return;
      }

      await route.continue();
    });

    await page.route('**/api/reviews/recent?limit=5', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reviews: recentReviews })
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
    await page.getByRole('button', { name: 'Generate review' }).click();

    await expect(page.getByText('Generated review: looks good overall.')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('status').filter({ hasText: 'Review generated and displayed.' })).toBeVisible({ timeout: 15000 });

    await page
      .getByRole('navigation', { name: 'Authenticated navigation' })
      .getByRole('link', { name: 'Home', exact: true })
      .click();
    await expect(page).toHaveURL(/\/(|home)$/);
    await expect(page.getByRole('heading', { name: 'Recent reviews' })).toBeVisible();
    await expect(page.getByText('PodolskiLuke/ReviewWise #101')).toBeVisible();
  });

  test('authenticated user can save settings and sees persisted values after reload', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    const storedSettings = {
      schemaVersion: 1,
      profile: {
        displayName: 'ci-user',
        timezone: 'Europe/London'
      },
      reviewPreferences: {
        depth: 'standard',
        focusAreas: ['bugs', 'security', 'quality'],
        outputLength: 'medium',
        autoLoadLatestReview: true,
        autoGenerateWhenMissing: true
      },
      repositoryPreferences: {
        defaultRepository: {
          owner: 'PodolskiLuke',
          name: 'ReviewWise'
        },
        excludedRepositories: []
      },
      uiPreferences: {
        showCooldownHints: true
      },
      updatedAt: null as string | null
    };

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

    await page.route(/http:\/\/(localhost|127\.0\.0\.1):5010\/api\/user-settings\/?(\?.*)?$/, async (route) => {
      const request = route.request();

      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ settings: storedSettings })
        });
        return;
      }

      if (request.method() === 'PUT') {
        const payload = request.postDataJSON() as { settings: typeof storedSettings };
        Object.assign(storedSettings, {
          ...payload.settings,
          updatedAt: new Date().toISOString()
        });

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ settings: storedSettings })
        });
        return;
      }

      await route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Method not allowed' })
      });
    });

    await page.goto('/');

    await expect(page.getByText('Signed in as ci-user via GitHub')).toBeVisible();
    const settingsResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/user-settings') && response.request().method() === 'GET',
      { timeout: 15000 }
    );
    await page
      .getByRole('navigation', { name: 'Authenticated navigation' })
      .getByRole('link', { name: 'Settings', exact: true })
      .click();
    await expect(page).toHaveURL(/\/settings$/);
    expect(pageErrors).toEqual([]);
    const settingsResponse = await settingsResponsePromise;
    expect(settingsResponse.status()).toBe(200);
    await expect(page.getByText('Loading settings…')).not.toBeVisible({ timeout: 15000 });

    await expect(page.getByLabel('Display name')).toHaveValue('ci-user');
    await page.getByLabel('Display name').fill('ci-updated');
    await page.getByLabel('Timezone').fill('UTC');
    await page.getByLabel('Default repository owner').fill('acme');
    await page.getByLabel('Default repository name').fill('widget');
    await page.getByLabel('Excluded repositories (one per line, owner/name)').fill('acme/legacy-repo');
    await page.getByRole('checkbox', { name: 'Show cooldown hints in the review panel' }).uncheck();

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();

    await page.reload();
    await page
      .getByRole('navigation', { name: 'Authenticated navigation' })
      .getByRole('link', { name: 'Settings', exact: true })
      .click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText('Loading settings…')).not.toBeVisible({ timeout: 15000 });

    await expect(page.getByLabel('Display name')).toHaveValue('ci-updated');
    await expect(page.getByLabel('Timezone')).toHaveValue('UTC');
    await expect(page.getByLabel('Default repository owner')).toHaveValue('acme');
    await expect(page.getByLabel('Default repository name')).toHaveValue('widget');
    await expect(page.getByLabel('Excluded repositories (one per line, owner/name)')).toHaveValue('acme/legacy-repo');
    await expect(page.getByRole('checkbox', { name: 'Show cooldown hints in the review panel' })).not.toBeChecked();
  });
});

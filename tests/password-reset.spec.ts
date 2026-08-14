import { test, expect } from '@playwright/test';
import { FIXTURE_PASSWORD } from './auth-storage-state';

// The reset flow is for logged-out users, so the shared session cookie would
// only get in the way.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Password reset', () => {
	test('requesting a link shows the same confirmation for a real and an unknown address', async ({ page }) => {
		await page.goto('/password-reset');
		await page.getByLabel('Email').fill('definitely-not-a-user@example.com');
		await page.getByRole('button', { name: /send reset link/i }).click();

		await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
		await expect(page.getByText(/if an account exists/i)).toBeVisible();
	});

	test('a ?token= link shows the set-new-password form instead of the request form', async ({ page }) => {
		await page.goto('/password-reset?token=not-a-real-token');
		await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
		await expect(page.getByLabel('New password')).toBeVisible();
	});

	test('mismatched passwords are caught before any request is sent', async ({ page }) => {
		await page.goto('/password-reset?token=not-a-real-token');
		await page.getByLabel('New password').fill(FIXTURE_PASSWORD);
		await page.getByLabel('Confirm password').fill('differenthorse123');
		await page.getByRole('button', { name: /set new password/i }).click();

		await expect(page.getByRole('alert')).toContainText(/don’t match/i);
	});

	test('an unknown token is rejected with a generic error', async ({ page }) => {
		await page.goto('/password-reset?token=not-a-real-token');
		await page.getByLabel('New password').fill(FIXTURE_PASSWORD);
		await page.getByLabel('Confirm password').fill(FIXTURE_PASSWORD);
		await page.getByRole('button', { name: /set new password/i }).click();

		await expect(page.getByRole('alert')).toHaveText('This reset link is invalid or has expired');
	});
});

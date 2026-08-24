import { test, expect } from '@playwright/test';
import { SHARED_USER } from './auth-storage-state';

// Unauthenticated by default so the login form itself is under test, not a
// redirect away from it because of the shared session cookie.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login page', () => {
	test('renders email and password fields with an enabled submit button', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByRole('button', { name: /log in/i })).toBeEnabled();
	});

	test('invalid credentials show one generic error, not which field was wrong', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill('no-such-user@example.com');
		await page.getByLabel('Password').fill('wrongpassword');
		await page.getByRole('button', { name: /log in/i }).click();

		await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
	});

	test('a valid login lands on /home @core', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill(SHARED_USER.email);
		await page.getByLabel('Password').fill(SHARED_USER.password);
		await page.getByRole('button', { name: /log in/i }).click();

		await page.waitForURL('**/home');
		await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
	});

	test('an unauthenticated visitor is redirected from a protected page to /login', async ({ page }) => {
		await page.goto('/documents');
		await page.waitForURL('**/login');
	});
});

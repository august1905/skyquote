import { test, expect } from '@playwright/test';
import { SHARED_USER, TEST_ADMIN, FIXTURE_PASSWORD } from './auth-storage-state.js';

// Same CATALYST_SERVE_PORT fallback as vite.config.js — `catalyst serve`
// moves off 3000 when another Catalyst project is already serving.
const BACKEND = `http://localhost:${process.env.CATALYST_SERVE_PORT || '3000'}/server/skyquote_function`;

function uniqueSuffix() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function logIn(page, { email, password }) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: /log in/i }).click();
	await page.waitForURL('**/home');
}

async function openAdminUsers(page) {
	await page.goto('/admin/users');
	await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
}

async function createUserViaUi(page, { firstName, lastName, email, password, role = 'member' }) {
	await page.getByRole('button', { name: 'New user' }).click();
	await page.getByLabel('First name').fill(firstName);
	await page.getByLabel('Last name').fill(lastName);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Initial password').fill(password);
	if (role !== 'member') {
		await page.getByLabel('Role').selectOption(role);
	}
	await page.getByRole('button', { name: 'Create user' }).click();
	// The form only closes on a successful create — this fails fast (rather
	// than on a later, more confusing assertion) if creation actually errored.
	await expect(page.locator('.admin-users-form')).toHaveCount(0);
}

test.describe('Admin-only user management', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('a non-admin has no Users nav link and is redirected away from /admin/users', async ({ page }) => {
		await logIn(page, SHARED_USER);
		await expect(page.locator('.app-sidebar-link', { hasText: 'Users' })).toHaveCount(0);

		await page.goto('/admin/users');
		await page.waitForURL('**/home');
	});

	test('an unauthenticated visitor is redirected to /login', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForURL('**/login');
	});

	test('an admin sees the Users nav link, and can create, list, and log in as a new user', async ({ page }) => {
		const suffix = uniqueSuffix();
		const newUser = {
			firstName: 'Nina',
			lastName: 'Newhire',
			email: `admin-created-${suffix}@example.com`,
			password: FIXTURE_PASSWORD,
		};

		await logIn(page, TEST_ADMIN);
		await expect(page.locator('.app-sidebar-link', { hasText: 'Users' })).toBeVisible();

		await openAdminUsers(page);
		await createUserViaUi(page, newUser);

		const row = page.locator('tr', { hasText: newUser.email });
		await expect(row).toBeVisible();
		await expect(row).toContainText('Nina Newhire');
		await expect(row).toContainText('Member');
		await expect(row.locator('.admin-users-status-active')).toBeVisible();

		await page.context().clearCookies();
		await logIn(page, newUser);
	});

	test('creating a user with an email that already exists shows a clear error', async ({ page }) => {
		await logIn(page, TEST_ADMIN);
		await openAdminUsers(page);

		await page.getByRole('button', { name: 'New user' }).click();
		await page.getByLabel('First name').fill('Dup');
		await page.getByLabel('Last name').fill('Licate');
		await page.getByLabel('Email').fill(SHARED_USER.email);
		await page.getByLabel('Initial password').fill(FIXTURE_PASSWORD);
		await page.getByRole('button', { name: 'Create user' }).click();

		await expect(page.getByRole('alert')).toHaveText('A user with this email already exists');
	});

	test('an admin can deactivate a user, who immediately can no longer log in', async ({ page }) => {
		const suffix = uniqueSuffix();
		const targetUser = {
			firstName: 'Deac',
			lastName: 'Tivated',
			email: `admin-deactivate-${suffix}@example.com`,
			password: FIXTURE_PASSWORD,
		};

		await logIn(page, TEST_ADMIN);
		await openAdminUsers(page);
		await createUserViaUi(page, targetUser);

		const row = page.locator('tr', { hasText: targetUser.email });
		await row.getByRole('button', { name: 'Deactivate' }).click();
		await row.getByRole('button', { name: 'Yes' }).click();

		await expect(row.locator('.admin-users-status-inactive')).toBeVisible();
		await expect(row.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);

		await page.context().clearCookies();
		await page.goto('/login');
		await page.getByLabel('Email').fill(targetUser.email);
		await page.getByLabel('Password').fill(targetUser.password);
		await page.getByRole('button', { name: /log in/i }).click();
		await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
	});

	test('an admin cannot deactivate their own account', async ({ page }) => {
		await logIn(page, TEST_ADMIN);
		await openAdminUsers(page);

		const row = page.locator('tr', { hasText: TEST_ADMIN.email });
		await expect(row).toContainText('This is you');
		await expect(row.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
	});

	test.describe('backend authorization', () => {
		test('there is no self-serve signup endpoint', async ({ request }) => {
			const res = await request.post(`${BACKEND}/auth/signup`, {
				data: { email: 'nobody@example.com', password: FIXTURE_PASSWORD, first_name: 'No', last_name: 'Body' },
			});
			expect(res.status()).toBe(404);
		});

		test('admin endpoints reject an unauthenticated caller with 401', async ({ request }) => {
			const listRes = await request.get(`${BACKEND}/admin/users`);
			expect(listRes.status()).toBe(401);

			const createRes = await request.post(`${BACKEND}/admin/users`, {
				data: { email: 'nobody@example.com', password: FIXTURE_PASSWORD, first_name: 'No', last_name: 'Body', role: 'member' },
			});
			expect(createRes.status()).toBe(401);
		});

		test('admin endpoints reject a logged-in non-admin with 403', async ({ request }) => {
			const loginRes = await request.post(`${BACKEND}/auth/login`, {
				data: { email: SHARED_USER.email, password: SHARED_USER.password },
			});
			expect(loginRes.ok()).toBe(true);

			const listRes = await request.get(`${BACKEND}/admin/users`);
			expect(listRes.status()).toBe(403);

			const createRes = await request.post(`${BACKEND}/admin/users`, {
				data: { email: 'nobody@example.com', password: FIXTURE_PASSWORD, first_name: 'No', last_name: 'Body', role: 'member' },
			});
			expect(createRes.status()).toBe(403);
		});
	});
});

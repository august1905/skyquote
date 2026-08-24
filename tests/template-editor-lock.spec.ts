import { test, expect, type Page } from '@playwright/test';
import { SHARED_USER, TEST_ADMIN, type TestAccount } from './auth-storage-state';
import { openNewTemplate } from './templateFixture';

// §12's exclusive edit lock, per Grayson's decision (2026-08-21): one editor
// at a time, everyone else refused entry — not real-time co-editing, and not
// the spec's suggested soft locking.
//
// Real backend, no mocking, and genuinely two different accounts: the whole
// point of this feature is what happens between *people*, so testing it with
// one identity in two tabs would test the opposite of the intended behaviour
// (same-user multi-tab is deliberately allowed — see the last test).
//
// The lock lives in Catalyst Cache with a 90s staleness window, so these
// tests release explicitly rather than relying on that timeout; a leaked lock
// would otherwise block the next run's assertions for a minute and a half.

async function logIn(page: Page, { email, password }: TestAccount): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: /log in/i }).click();
	await page.waitForURL('**/home');
}

/** Opens a fresh template as the already-signed-in shared user and returns its editor URL. */
async function newTemplate(page: Page): Promise<string> {
	await openNewTemplate(page);
	// The canvas being present is what proves the lock was actually acquired —
	// a blocked open renders the locked screen instead.
	await expect(page.locator('.canvas-page').first()).toBeVisible();
	return page.url();
}

test.describe('Exclusive edit lock (§12)', () => {
	test('a second person opening the same template is locked out and told who has it, then gets in once the first leaves @core', async ({ page, context }) => {
		// Person A: the suite's default signed-in user (see global-setup).
		const url = await newTemplate(page);

		// Person B: a genuinely separate account in a session-less context, so
		// there's no chance of sharing A's cookie.
		const otherContext = await context.browser()!.newContext({ storageState: { cookies: [], origins: [] } });
		const otherPage = await otherContext.newPage();
		try {
			await logIn(otherPage, TEST_ADMIN);
			await otherPage.goto(url);

			// Locked out entirely — no canvas at all, which is the decision this
			// feature encodes ("locked from even opening the document").
			const locked = otherPage.getByRole('alert').filter({ hasText: 'This template is being edited' });
			await expect(locked).toBeVisible();
			await expect(otherPage.locator('.canvas-page')).toHaveCount(0);
			// Named, so the reader knows who to go and ask.
			await expect(otherPage.locator('.template-locked-reason')).toContainText(`${SHARED_USER.firstName} ${SHARED_USER.lastName}`);
			await expect(otherPage.locator('.template-locked-reason')).toContainText('is editing this template');

			// A leaves the editor, which releases the lock.
			await page.goto('/templates');

			// B's screen retries on its own every few seconds — no reload, no
			// button press. That automatic recovery is the behaviour that makes
			// an exclusive lock tolerable to work with.
			await expect(otherPage.locator('.canvas-page').first()).toBeVisible({ timeout: 20000 });
			await expect(otherPage.locator('.template-locked-reason')).toHaveCount(0);
		} finally {
			// B may now hold the lock — leave the editor so it's released rather
			// than left for the staleness window to clear.
			await otherPage.goto('/templates').catch(() => undefined);
			await otherContext.close();
		}
	});

	test('the "Try again" button also recovers, without waiting for the automatic retry', async ({ page, context }) => {
		const url = await newTemplate(page);

		const otherContext = await context.browser()!.newContext({ storageState: { cookies: [], origins: [] } });
		const otherPage = await otherContext.newPage();
		try {
			await logIn(otherPage, TEST_ADMIN);
			await otherPage.goto(url);
			await expect(otherPage.locator('.template-locked-reason')).toBeVisible();

			await page.goto('/templates');

			await otherPage.getByRole('button', { name: 'Try again' }).click();
			await expect(otherPage.locator('.canvas-page').first()).toBeVisible({ timeout: 10000 });
		} finally {
			await otherPage.goto('/templates').catch(() => undefined);
			await otherContext.close();
		}
	});

	test('the same person can open their own template in a second tab — the lock is per person, not per tab', async ({ page, context }) => {
		// Deliberate: blocking your own second tab would lock you out of your
		// own work after a crash, and `Templates.version` optimistic
		// concurrency (phase 1) already prevents one tab clobbering the other —
		// which `template-autosave.spec.ts` covers directly.
		const url = await newTemplate(page);

		const secondTab = await context.newPage();
		try {
			await secondTab.goto(url);
			await expect(secondTab.locator('.canvas-page').first()).toBeVisible();
			await expect(secondTab.locator('.template-locked-reason')).toHaveCount(0);
		} finally {
			await secondTab.close();
		}
	});
});

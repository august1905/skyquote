import { test, expect } from '@playwright/test';

// The Documents list + detail view — real backend, no mocking. Exists to
// close a real gap: before this, there was no way to ever find a document
// again, or recover a recipient's link, once the Create Document wizard's
// own success screen was closed.

test('a created document shows up in the Documents list, and a lost recipient link can be regenerated from its detail view', async ({ page, context }) => {
	await page.goto('/templates');
	await page.getByRole('button', { name: '+ New template' }).click();
	await page.waitForURL(/\/templates\/.+\/edit/);

	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Client');
	await page.getByRole('button', { name: 'Close roles panel' }).click();

	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await wizard.getByRole('button', { name: 'Next' }).click(); // name

	await page.getByLabel('Client name').fill('Casey Client');
	await page.getByLabel('Client email').fill('casey@example.com');
	await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
	await wizard.getByRole('button', { name: 'Next' }).click(); // variables
	await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
	await wizard.getByRole('button', { name: 'Create document' }).click(); // review -> create

	const heading = await page.locator('.wizard-success-heading').textContent();
	const title = heading!.match(/“(.+)”/)![1];
	const originalLink = await page.getByLabel('Casey Client link').inputValue();
	// Close without keeping the link anywhere else — simulates losing it.
	await page.getByRole('button', { name: 'Done' }).click();

	await page.goto('/documents');
	// Newest first (ORDER BY CREATEDTIME DESC on the backend) — the document
	// just created is always the first row, regardless of how much other
	// test/curl-verification data already exists in this real backend.
	const row = page.locator('.documents-table tbody tr').first();
	await expect(row).toContainText(title);
	await expect(row.locator('.documents-status-pill')).toHaveText('Sent');

	await row.getByRole('button', { name: 'View' }).click();
	const modal = page.locator('.wizard-card');
	await expect(modal.getByText('Casey Client (Client) — Pending')).toBeVisible();

	await modal.getByRole('button', { name: 'Regenerate link' }).click();
	const newLinkInput = modal.getByLabel('Casey Client link');
	await expect(newLinkInput).toBeVisible();
	const newLink = await newLinkInput.inputValue();
	expect(newLink).toMatch(/\/d\/\d+\/.+/);
	expect(newLink).not.toBe(originalLink);

	await page.getByRole('button', { name: 'Close document detail' }).click();
	await expect(page.locator('.wizard-overlay')).toHaveCount(0);

	// The old link is dead; the regenerated one works — opened session-less.
	const recipientContext = await context.browser()!.newContext();
	const recipientPage = await recipientContext.newPage();
	await recipientPage.goto(originalLink);
	await expect(recipientPage.getByRole('alert')).toHaveText('This link is invalid or has expired.');

	await recipientPage.goto(newLink);
	await expect(recipientPage.getByText('Viewing as Casey Client (Client)')).toBeVisible();

	await recipientContext.close();
});

import { test, expect } from '@playwright/test';

// Real backend, no mocking, same convention as the rest of this suite. §3's
// Recipients/Roles panel — phase 3's first piece.
test.describe('Recipients / Roles panel', () => {
	test('adds, edits, reorders, and removes roles, and it persists through a reload', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await expect(page.locator('.roles-panel')).toHaveCount(0);
		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await expect(page.locator('.roles-panel')).toBeVisible();
		await expect(page.getByText('No roles yet.')).toBeVisible();

		await page.getByRole('button', { name: '+ Add role' }).click();
		await expect(page.getByText('No roles yet.')).toHaveCount(0);
		const firstRow = page.locator('.roles-panel-row').first();
		await expect(firstRow.getByLabel('Role name')).toHaveValue('Role 1');

		await firstRow.getByLabel('Role name').fill('Client');
		await firstRow.getByLabel('Signing order').fill('2');
		await firstRow.getByLabel(/color$/).fill('#ff0000');

		await page.getByRole('button', { name: '+ Add role' }).click();
		const rows = page.locator('.roles-panel-row');
		await expect(rows).toHaveCount(2);
		await rows.nth(1).getByLabel('Role name').fill('Sales Rep');
		await rows.nth(1).getByLabel('Sender').check();

		// Reorder: move "Sales Rep" (row 1) up above "Client".
		await rows.nth(1).getByRole('button', { name: 'Move role up' }).click();
		await expect(rows.nth(0).getByLabel('Role name')).toHaveValue('Sales Rep');
		await expect(rows.nth(1).getByLabel('Role name')).toHaveValue('Client');

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		const reloadedRows = page.locator('.roles-panel-row');
		await expect(reloadedRows).toHaveCount(2);
		await expect(reloadedRows.nth(0).getByLabel('Role name')).toHaveValue('Sales Rep');
		await expect(reloadedRows.nth(0).getByLabel('Sender')).toBeChecked();
		await expect(reloadedRows.nth(1).getByLabel('Role name')).toHaveValue('Client');
		await expect(reloadedRows.nth(1).getByLabel('Signing order')).toHaveValue('2');
		await expect(reloadedRows.nth(1).getByLabel(/color$/)).toHaveValue('#ff0000');

		await reloadedRows.nth(1).getByRole('button', { name: /Remove/ }).click();
		await expect(page.locator('.roles-panel-row')).toHaveCount(1);
		await expect(page.locator('.roles-panel-row').first().getByLabel('Role name')).toHaveValue('Sales Rep');
	});

	test('closes via its own close button', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await expect(page.locator('.roles-panel')).toBeVisible();

		await page.getByRole('button', { name: 'Close roles panel' }).click();
		await expect(page.locator('.roles-panel')).toHaveCount(0);
	});
});

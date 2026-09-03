import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// Real backend, no mocking, same convention as the rest of this suite. §3's
// Recipients/Roles panel — phase 3's first piece.
test.describe('Recipients / Roles panel', () => {
	test('adds, edits, and removes roles, and it persists through a reload', async ({ page }) => {
		await openNewTemplate(page);

		await expect(page.locator('.roles-panel')).toHaveCount(0);
		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await expect(page.locator('.roles-panel')).toBeVisible();

		// New templates are seeded with two roles: 'Contact (Signer)' then
		// 'Skyline Signer' (the sender), so there's no empty state up front.
		const rows = page.locator('.roles-panel-row');
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0).getByLabel('Role name')).toHaveValue('Contact (Signer)');
		await expect(rows.nth(0).getByLabel('Sender')).not.toBeChecked();
		await expect(rows.nth(1).getByLabel('Role name')).toHaveValue('Skyline Signer');
		await expect(rows.nth(1).getByLabel('Sender')).toBeChecked();
		await expect(page.getByText('No roles yet.')).toHaveCount(0);

		await page.getByRole('button', { name: '+ Add role' }).click();
		await expect(rows).toHaveCount(3);
		const addedRow = rows.nth(2);
		await expect(addedRow.getByLabel('Role name')).toHaveValue('Role 1');

		await addedRow.getByLabel('Role name').fill('Client');
		await addedRow.getByLabel('Signing order').fill('2');
		await addedRow.getByLabel(/color$/).fill('#ff0000');

		await page.getByRole('button', { name: '+ Add role' }).click();
		await expect(rows).toHaveCount(4);
		await rows.nth(3).getByLabel('Role name').fill('Sales Rep');
		await rows.nth(3).getByLabel('Sender').check();

		// Row order is the order roles were added, and there is nothing to
		// reorder it with: the ↑/↓ pair was removed (Grayson, 2026-09-03) because
		// it squeezed the name field down to about five characters, and the
		// "Signing order" field below is what actually sequences signers.
		await expect(page.getByRole('button', { name: /^Move role/ })).toHaveCount(0);

		await saveNow(page);
		await page.reload();

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		const reloadedRows = page.locator('.roles-panel-row');
		await expect(reloadedRows).toHaveCount(4);
		await expect(reloadedRows.nth(0).getByLabel('Role name')).toHaveValue('Contact (Signer)');
		await expect(reloadedRows.nth(1).getByLabel('Role name')).toHaveValue('Skyline Signer');
		await expect(reloadedRows.nth(1).getByLabel('Sender')).toBeChecked();
		await expect(reloadedRows.nth(2).getByLabel('Role name')).toHaveValue('Client');
		await expect(reloadedRows.nth(2).getByLabel('Signing order')).toHaveValue('2');
		await expect(reloadedRows.nth(2).getByLabel(/color$/)).toHaveValue('#ff0000');
		await expect(reloadedRows.nth(3).getByLabel('Role name')).toHaveValue('Sales Rep');
		await expect(reloadedRows.nth(3).getByLabel('Sender')).toBeChecked();

		await reloadedRows.nth(3).getByRole('button', { name: /Remove/ }).click();
		await expect(page.locator('.roles-panel-row')).toHaveCount(3);
		await expect(reloadedRows.nth(2).getByLabel('Role name')).toHaveValue('Client');

		// Removing the rest — Client, then both seeded roles — restores the
		// empty state. No fields are assigned, so each removal is immediate.
		await reloadedRows.nth(2).getByRole('button', { name: /Remove/ }).click();
		await reloadedRows.nth(1).getByRole('button', { name: /Remove/ }).click();
		await reloadedRows.nth(0).getByRole('button', { name: /Remove/ }).click();
		await expect(page.locator('.roles-panel-row')).toHaveCount(0);
		await expect(page.getByText('No roles yet.')).toBeVisible();
	});

});

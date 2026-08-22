import { test, expect } from '@playwright/test';
import { insertImageFromLibrary } from './imageLibrary';

// Real backend, no mocking, same convention as the rest of this suite. §9.4's
// persistent, dismissible issues indicator.
test.describe('Validation surface', () => {
	test('is absent on a clean template, then appears and lists a duplicate-field-name issue', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await expect(page.locator('.validation-indicator-badge')).toHaveCount(0);

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await page.getByRole('button', { name: '+ Add role' }).click();
		await page.getByRole('button', { name: 'Close roles panel' }).click();

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Signature' }).click();
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Initials' }).click();

		// Force a name collision — rename "Initials 1" to "Signature 1".
		await page.locator('.field-block').nth(1).click();
		await page.locator('.field-settings-popover').getByLabel('Field name').fill('Signature 1');
		await page.locator('.field-settings-popover').getByRole('button', { name: 'Done' }).click();

		const badge = page.locator('.validation-indicator-badge');
		await expect(badge).toBeVisible();
		await expect(badge).toContainText('issue');

		await badge.click();
		const panel = page.locator('.validation-indicator-panel');
		await expect(panel).toBeVisible();
		await expect(panel).toContainText('2 fields are named "Signature 1"');
		await expect(panel.locator('.validation-issue-error')).toHaveCount(1);

		await panel.getByRole('button', { name: 'Close issues' }).click();
		await expect(panel).toHaveCount(0);
		// The badge itself stays — only the expanded list was dismissed.
		await expect(badge).toBeVisible();
	});

	test('flags an unresolved variable with no default, and an image missing alt text, as warnings', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Client.Name');
		await page.keyboard.press('Enter');

		await insertImageFromLibrary(page);
		await expect(page.locator('.block-image')).toBeVisible();

		const badge = page.locator('.validation-indicator-badge');
		await expect(badge).toBeVisible();
		await badge.click();
		const panel = page.locator('.validation-indicator-panel');
		await expect(panel).toContainText('Variable "Client.Name" has no default value set.');
		await expect(panel).toContainText('An image is missing alt text.');
		await expect(panel.locator('.validation-issue-warning')).toHaveCount(2);
	});
});

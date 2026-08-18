import { test, expect } from '@playwright/test';

// §6.1 rule 3's "Preview as {role}" mode, real backend, no mocking.

async function newTemplate(page: import('@playwright/test').Page) {
	await page.goto('/templates');
	await page.getByRole('button', { name: '+ New template' }).click();
	await page.waitForURL(/\/templates\/.+\/edit/);
}

async function addRole(page: import('@playwright/test').Page, name: string) {
	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill(name);
	await page.getByRole('button', { name: 'Close roles panel' }).click();
}

test.describe('Preview as role', () => {
	test('the previewed role\'s fields become live/fillable; every other role\'s fields stay inert', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');
		await addRole(page, 'Sales Rep');

		// A standalone Text field, defaulted to the first role (Client).
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text field' }).click();

		// A standalone Checkbox field, explicitly for Sales Rep.
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByLabel('Fields for').selectOption({ label: 'Sales Rep' });
		await page.getByRole('menuitem', { name: 'Checkbox' }).click();

		const textField = page.locator('.field-block').filter({ hasText: 'Text field 1' });
		const checkboxField = page.locator('.field-block').filter({ hasText: 'Checkbox 1' });
		await expect(textField.locator('input[type="text"]')).toBeDisabled();
		await expect(checkboxField.locator('input[type="checkbox"]')).toBeDisabled();

		await expect(page.getByLabel('Preview as')).toBeVisible();
		await page.getByLabel('Preview as').selectOption({ label: 'Client' });

		// Client's own field is now live...
		const liveTextInput = textField.locator('input[type="text"]');
		await expect(liveTextInput).toBeEnabled();
		await liveTextInput.fill('Hello from preview');
		await expect(liveTextInput).toHaveValue('Hello from preview');

		// ...clicking it no longer opens settings...
		await expect(page.locator('.field-settings-popover')).toHaveCount(0);

		// ...while Sales Rep's field is untouched: still inert, still opens settings on click.
		await expect(checkboxField.locator('input[type="checkbox"]')).toBeDisabled();
		await checkboxField.click();
		await expect(page.locator('.field-settings-popover')).toBeVisible();
		await page.mouse.click(10, 10); // outside click closes it (FieldSettingsPopover's own convention)

		// Switching the preview to Sales Rep flips which field is live.
		await page.getByLabel('Preview as').selectOption({ label: 'Sales Rep' });
		await expect(textField.locator('input[type="text"]')).toBeDisabled();
		const liveCheckbox = checkboxField.locator('input[type="checkbox"]');
		await expect(liveCheckbox).toBeEnabled();
		await liveCheckbox.check();
		await expect(liveCheckbox).toBeChecked();

		// Turning preview off returns everything to its normal inert state.
		await page.getByLabel('Preview as').selectOption({ label: 'Not previewing' });
		await expect(textField.locator('input[type="text"]')).toBeDisabled();
		await expect(checkboxField.locator('input[type="checkbox"]')).toBeDisabled();
	});

	test('an inline field also goes live while previewing its role, and nothing typed in preview persists through a reload', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Radio buttons');
		await page.keyboard.press('Enter');

		const chipButton = editor.locator('.rt-field-chip-button');
		await expect(chipButton).toBeVisible();

		await page.getByLabel('Preview as').selectOption({ label: 'Client' });
		await expect(chipButton).toHaveCount(0); // swapped for the live control while previewing

		const liveRadios = editor.locator('.rt-field-chip-live input[type="radio"]');
		await expect(liveRadios).toHaveCount(1); // one default "Option 1"
		await liveRadios.first().check();
		await expect(liveRadios.first()).toBeChecked();

		// The preview toggle itself is ephemeral editor-UI state, not part of
		// the saved template — a reload always comes back to "Not previewing",
		// and nothing entered while previewing was ever sent to the backend.
		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();
		await expect(page.getByLabel('Preview as')).toHaveValue('');
		await expect(page.locator('.rt-field-chip-button')).toBeVisible();
	});
});

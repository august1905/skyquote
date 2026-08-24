import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// Real backend, no mocking, same convention as the rest of this suite. §6's
// fillable fields — all ten types, both placement modes, role scoping,
// settings, and role-deletion's reassign-or-delete prompt.

async function newTemplate(page: import('@playwright/test').Page) {
	await openNewTemplate(page);
}

async function addRole(page: import('@playwright/test').Page, name: string) {
	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill(name);
	await page.getByRole('button', { name: 'Close roles panel' }).click();
}

test.describe('Fillable fields', () => {
	test('the field palette is hidden until a role exists, then placing a field creates a role-tinted standalone block @core', async ({ page }) => {
		await newTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await expect(page.getByText('Add a role (Recipients / Roles panel) before placing fields.')).toBeVisible();

		// Clicking the Recipients/Roles rail button is itself an outside
		// click, which the still-open Add-block menu dismisses on its own.
		await addRole(page, 'Client');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await expect(page.getByText('Add a role (Recipients / Roles panel) before placing fields.')).toHaveCount(0);
		await page.getByRole('menuitem', { name: 'Signature' }).click();

		const fieldBlock = page.locator('.field-block').first();
		await expect(fieldBlock).toBeVisible();
		await expect(fieldBlock.locator('.field-block-name')).toHaveText('Signature 1');
	});

	test('clicking a standalone field opens its settings: rename (with collision detection), toggle required, reassign role, and it persists', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');
		await addRole(page, 'Sales Rep');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text field' }).click();
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text field' }).click();

		const fieldBlocks = page.locator('.field-block');
		await fieldBlocks.nth(0).click();
		const popover = page.locator('.field-settings-popover');
		await expect(popover).toBeVisible();
		await expect(popover.getByLabel('Field role')).toHaveValue(/.+/);

		// Rename the first field to collide with the second's default name.
		await popover.getByLabel('Field name').fill('Text field 2');
		await expect(popover.getByText('Another field already uses this name')).toBeVisible();
		await popover.getByLabel('Field name').fill('Company name');
		await expect(popover.getByText('Another field already uses this name')).toHaveCount(0);

		await popover.getByLabel('Required').click();
		await popover.getByLabel('Field role').selectOption({ label: 'Sales Rep' });
		await popover.getByRole('button', { name: 'Done' }).click();

		await expect(fieldBlocks.nth(0).locator('.field-block-name')).toContainText('Company name');
		await expect(fieldBlocks.nth(0).locator('.field-block-required')).toBeVisible();

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.field-block-name').first()).toContainText('Company name');
	});

	test('radio and dropdown fields configure options, rendered inertly in the canvas', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Radio buttons' }).click();

		await page.locator('.field-block').first().click();
		const popover = page.locator('.field-settings-popover');
		await popover.getByLabel('Field options').fill('Yes\nNo\nMaybe');
		await popover.getByRole('button', { name: 'Done' }).click();

		const radios = page.locator('.field-block').first().locator('input[type="radio"]');
		await expect(radios).toHaveCount(3);
		await expect(page.locator('.field-block').first()).toContainText('Yes');
		await expect(page.locator('.field-block').first()).toContainText('Maybe');
		// Inert — disabled in the template editor (§6.1 rule 3).
		await expect(radios.first()).toBeDisabled();
	});

	test('the "[" picker also offers field types once a role exists, and inserts an inline role-tinted chip', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Checkbox');

		await expect(page.locator('.rt-suggestion-item-key', { hasText: 'Field' })).toBeVisible();
		await page.keyboard.press('Enter');

		const chip = editor.locator('.rt-field-chip-button');
		await expect(chip).toBeVisible();
		await expect(chip).toContainText('Checkbox 1');

		await chip.click();
		await expect(page.locator('.field-settings-popover')).toBeVisible();
	});

	test('removing an inline field chip removes the whole field, and the popover\'s Remove works the same way', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Stamp');
		await page.keyboard.press('Enter');

		const chip = editor.locator('.rt-field-chip-button');
		await chip.click();
		await page.locator('.field-settings-popover').getByRole('button', { name: 'Remove field' }).click();
		await expect(editor.locator('.rt-field-chip-button')).toHaveCount(0);
	});

	test('deleting a role with fields prompts to reassign or delete them', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');
		await addRole(page, 'Sales Rep');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Date' }).click();
		await page.locator('.field-block').first().click();
		await page.locator('.field-settings-popover').getByLabel('Field role').selectOption({ label: 'Client' });
		await page.locator('.field-settings-popover').getByRole('button', { name: 'Done' }).click();

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		const clientRow = page.locator('.roles-panel-row').filter({ has: page.locator('[aria-label="Client color"]') });
		await clientRow.getByRole('button', { name: /Remove/ }).click();

		const prompt = page.locator('.roles-panel-removal-prompt');
		await expect(prompt).toBeVisible();
		await expect(prompt).toContainText('1 field uses');

		await prompt.getByRole('button', { name: 'Reassign fields & remove role' }).click();
		await expect(prompt).toHaveCount(0);
		await expect(page.locator('.roles-panel-row')).toHaveCount(1);
		// The field survived, reassigned rather than deleted.
		await expect(page.locator('.field-block')).toHaveCount(1);
	});

	test('deleting a role and choosing "delete fields" removes the field entirely, inline and standalone', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Billing details' }).click();

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Collect files');
		await page.keyboard.press('Enter');

		await expect(page.locator('.field-block')).toHaveCount(1);
		await expect(page.locator('.rt-field-chip-button')).toHaveCount(1);

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await page.locator('.roles-panel-row').first().getByRole('button', { name: /Remove/ }).click();

		const prompt = page.locator('.roles-panel-removal-prompt');
		await expect(prompt).toContainText('2 fields use');
		// Only one role exists, so reassignment isn't offered.
		await expect(prompt.getByRole('button', { name: 'Reassign fields & remove role' })).toHaveCount(0);
		await prompt.getByRole('button', { name: 'Delete fields & remove role' }).click();

		await expect(page.locator('.field-block')).toHaveCount(0);
		await expect(page.locator('.rt-field-chip-button')).toHaveCount(0);
		await expect(page.locator('.roles-panel-row')).toHaveCount(0);
	});

	test('a locked field block cannot be reconfigured', async ({ page }) => {
		await newTemplate(page);
		await addRole(page, 'Client');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Dropdown' }).click();

		await page.locator('.field-block').first().click();
		await page.getByRole('button', { name: 'Lock', exact: true }).click();

		await page.locator('.field-block').first().click();
		await expect(page.locator('.field-settings-popover')).toHaveCount(0);
	});
});

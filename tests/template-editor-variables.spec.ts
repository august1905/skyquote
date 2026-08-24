import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// Real backend, no mocking, same convention as the rest of this suite. §5/§6's
// variable model — system variables, custom variables, the inline `variable`
// Tiptap node (chip + click-to-edit popover), the `[` picker, the Variables
// right-rail panel, and the template name's variable-token support.
test.describe('Variables', () => {
	test('the Variables panel inserts a system variable at the caret as a chip, and it persists through a reload', async ({ page }) => {
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();

		await expect(page.locator('.variables-panel')).toHaveCount(0);
		await page.getByRole('button', { name: 'Variables' }).click();
		await expect(page.locator('.variables-panel')).toBeVisible();

		await page.getByRole('button', { name: 'Client name' }).click();
		const chip = editor.locator('.rt-variable-chip-button');
		await expect(chip).toHaveText('[Client.Name]');

		await saveNow(page);
		await page.reload();

		await expect(page.locator('.canvas-block .ProseMirror').first().locator('.rt-variable-chip-button')).toHaveText('[Client.Name]');
	});

	test('the "[" trigger opens a filtered, keyboard-navigable picker inside a text block', async ({ page }) => {
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Sender.Comp');

		const suggestionList = page.locator('.rt-suggestion-list');
		await expect(suggestionList).toBeVisible();
		await expect(page.locator('.rt-suggestion-item')).toHaveCount(1);
		await expect(page.locator('.rt-suggestion-item-key')).toHaveText('Sender.Company');

		await page.keyboard.press('Enter');
		await expect(suggestionList).toHaveCount(0);
		await expect(editor.locator('.rt-variable-chip-button')).toHaveText('[Sender.Company]');
		// The trigger text typed before insertion must be consumed, not left
		// behind alongside the chip.
		await expect(editor).not.toContainText('Sender.Comp[');
	});

	test('clicking a variable chip opens a popover to change the variable or set fallback text, and Remove deletes the whole chip', async ({
		page,
	}) => {
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Client.Name');
		await page.keyboard.press('Enter');
		await expect(editor.locator('.rt-variable-chip-button')).toHaveText('[Client.Name]');

		await editor.locator('.rt-variable-chip-button').click();
		const popover = page.locator('.rt-variable-popover');
		await expect(popover).toBeVisible();

		await popover.getByLabel('Fallback text').fill('N/A');
		await popover.getByLabel('Variable', { exact: true }).selectOption('Client.Company');
		await expect(editor.locator('.rt-variable-chip-button')).toHaveText('[Client.Company]');

		await popover.getByRole('button', { name: 'Remove variable' }).click();
		await expect(editor.locator('.rt-variable-chip-button')).toHaveCount(0);
	});

	test('creates a custom variable, inserts it, and removing it from the panel is undoable', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: 'Variables' }).click();
		await page.getByRole('button', { name: '+ Create custom variable' }).click();
		await page.getByLabel('Variable label').fill('Discount');
		await page.getByLabel('Variable default value').fill('10%');
		await page.getByRole('button', { name: 'Create', exact: true }).click();

		const customRow = page.locator('.variables-panel-group', { hasText: 'Custom' });
		await expect(customRow.getByRole('button', { name: 'Discount', exact: true })).toBeVisible();

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await customRow.getByRole('button', { name: 'Discount', exact: true }).click();
		await expect(editor.locator('.rt-variable-chip-button')).toHaveText('[Custom.Discount]');

		await customRow.getByRole('button', { name: 'Remove Discount' }).click();
		await expect(customRow.getByRole('button', { name: 'Discount', exact: true })).toHaveCount(0);

		// This app's undo is the header's Undo button (the command stack) —
		// there's no global Ctrl+Z shortcut yet (§9.3 isn't built), matching
		// the rest of this suite's convention (see template-editor.spec.ts).
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.locator('.variables-panel-group', { hasText: 'Custom' }).getByRole('button', { name: 'Discount', exact: true })).toBeVisible();
	});

	test('the template name accepts a variable token, rendered as a chip when not editing, and it persists', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: 'Edit template name' }).click();
		const nameInput = page.getByLabel('Template name');
		await nameInput.fill('[Client.Company');
		const namePicker = page.locator('.template-name-picker');
		await expect(namePicker).toBeVisible();
		await namePicker.getByRole('button', { name: /Client company/ }).click();
		// insertVariable restores caret position via requestAnimationFrame —
		// wait for the picker to actually close (a synchronous state update)
		// before typing more, so further keystrokes land after that reposition
		// instead of racing it.
		await expect(namePicker).toHaveCount(0);
		await nameInput.type(' Proposal');
		await nameInput.press('Escape');

		await expect(page.locator('.template-name-chip')).toHaveText('[Client.Company]');
		await expect(page.locator('.template-name-display')).toContainText('Proposal');

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.template-name-chip')).toHaveText('[Client.Company]');
	});

});

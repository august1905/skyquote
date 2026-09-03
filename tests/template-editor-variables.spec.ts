import { test, expect, type Locator, type Page } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

/**
 * Drags a Variables-panel row to a point and releases it.
 *
 * Same rhythm as the Content panel's own drag helper: dnd-kit's pointer sensor
 * needs 8px of travel to start a drag and a frame or two between steps to read
 * the new position.
 */
async function dragTo(page: Page, source: Locator, target: { x: number; y: number }) {
	const box = await source.boundingBox();
	if (!box) throw new Error('expected the variable row to have a bounding box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(100);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 15, { steps: 5 });
	await page.waitForTimeout(100);
	await page.mouse.move(target.x, target.y, { steps: 20 });
	await page.waitForTimeout(150);
	await page.mouse.up();
	await page.waitForTimeout(250);
}

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

	test('a merge field dragged onto a sentence lands between the two characters it was dropped between @core', async ({ page }) => {
		// Grayson, 2026-09-03: "ESSENTIAL to be able to drag the merge fields to a
		// specific spot." Clicking inserts at the caret, which is only useful if
		// there already is one; aimed at text, "a specific spot" means a position
		// inside that text.
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Dear  — welcome aboard.');

		await page.getByRole('button', { name: 'Variables' }).click();
		await expect(page.locator('.variables-panel')).toBeVisible();

		// The gap the author is aiming at: right after "Dear ", between the two
		// spaces. Measured from the DOM rather than guessed, so this asserts the
		// insertion position and not the width of a font.
		const gap = await page.evaluate(() => {
			const paragraph = document.querySelector('.canvas-block .ProseMirror p');
			const textNode = paragraph?.firstChild;
			if (!textNode) throw new Error('expected the typed paragraph');
			const range = document.createRange();
			range.setStart(textNode, 5);
			range.setEnd(textNode, 5);
			const rect = range.getBoundingClientRect();
			return { x: rect.left, y: rect.top + rect.height / 2 };
		});
		await dragTo(page, page.locator('.variables-panel').getByRole('button', { name: 'Client name' }), gap);

		await expect(editor.locator('.rt-variable-chip-button')).toHaveText('[Client.Name]');
		// Between the words, not appended to the end and not in a new block above.
		await expect(editor.locator('p').first()).toHaveText('Dear [Client.Name] — welcome aboard.');
		await expect(page.locator('.canvas-block')).toHaveCount(1);

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.canvas-block .ProseMirror p').first()).toHaveText('Dear [Client.Name] — welcome aboard.');
	});

	test('a merge field dropped on open paper becomes a text block pinned there', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: 'Variables' }).click();
		await expect(page.locator('.variables-panel')).toBeVisible();

		const pageBox = await page.locator('.canvas-page').first().boundingBox();
		if (!pageBox) throw new Error('expected the page to have a bounding box');
		await dragTo(page, page.locator('.variables-panel').getByRole('button', { name: 'Client company' }), {
			x: pageBox.x + pageBox.width * 0.35,
			y: 520,
		});

		// A variable has no block of its own, so placing one "on the page" means
		// the smallest block that can carry it.
		const placed = page.locator('.canvas-placed');
		await expect(placed).toHaveCount(1);
		await expect(placed.locator('.rt-variable-chip-button')).toHaveText('[Client.Company]');
	});

	test('a merge field can wear one of the house text styles, in the editor and in the document it becomes', async ({ page }) => {
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('[Client.Name');
		await page.keyboard.press('Enter');

		await editor.locator('.rt-variable-chip-button').click();
		const popover = page.locator('.rt-variable-popover');
		await popover.getByLabel('Merge field style').selectOption('navy-48');

		// The catalogue's own values — Skyline navy at 48px — not an approximation.
		const chip = editor.locator('.rt-variable-chip').first();
		await expect(chip).toHaveCSS('color', 'rgb(9, 77, 130)');
		await expect(chip).toHaveCSS('font-size', '48px');

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.canvas-block .rt-variable-chip').first()).toHaveCSS('font-size', '48px');
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

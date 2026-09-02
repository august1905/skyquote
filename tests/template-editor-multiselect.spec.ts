import { test, expect } from '@playwright/test';
import { openNewTemplate, unpinSelectedBlock } from './templateFixture';

// Real backend, no mocking, same convention as the rest of this suite. §4.2's
// multi-select. Drag-marquee and dragging the whole selection as one group
// are deliberately not built (see BUILD_STATUS.md) — shift-click is the one
// input path exercised here.
test.describe('Multi-select', () => {
	test('shift-click adds/removes blocks from the selection, and a plain click resets it to one', async ({ page }) => {
		await openNewTemplate(page);

		// Get to three blocks: the template's own default text block, plus two more.
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();

		const blocks = page.locator('.canvas-block');
		await expect(blocks).toHaveCount(3);

		await blocks.nth(0).click();
		await expect(blocks.nth(0)).toHaveClass(/canvas-block-selected/);

		await blocks.nth(1).click({ modifiers: ['Shift'] });
		await expect(blocks.nth(1)).toHaveClass(/canvas-block-multi-selected/);
		await expect(blocks.nth(0)).toHaveClass(/canvas-block-selected/);

		await blocks.nth(2).click({ modifiers: ['Shift'] });
		await expect(blocks.nth(2)).toHaveClass(/canvas-block-multi-selected/);

		// Shift-clicking an already-multi-selected block toggles it back out.
		await blocks.nth(1).click({ modifiers: ['Shift'] });
		await expect(blocks.nth(1)).not.toHaveClass(/canvas-block-multi-selected/);

		// A plain click resets to a single selection.
		await blocks.nth(2).click();
		await expect(blocks.nth(2)).toHaveClass(/canvas-block-selected/);
		await expect(blocks.nth(0)).not.toHaveClass(/canvas-block-selected|canvas-block-multi-selected/);
	});

	test('bulk Delete removes every selected block, and bulk Duplicate clones every selected block', async ({ page }) => {
		await openNewTemplate(page);

		// "Clone lands after its own source" is a *flow-order* concept, so this test
		// unpins each new block (they arrive pinned by default) before exercising it.
		const editors = page.locator('.canvas-block .ProseMirror');
		await editors.nth(0).click();
		await page.keyboard.type('First');
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();
		await unpinSelectedBlock(page);
		await editors.nth(1).click();
		await page.keyboard.type('Second');
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();
		await unpinSelectedBlock(page);
		await editors.nth(2).click();
		await page.keyboard.type('Third');

		const blocks = page.locator('.canvas-block');
		await blocks.nth(0).click();
		await blocks.nth(1).click({ modifiers: ['Shift'] });

		await expect(page.getByRole('button', { name: 'Duplicate (2)' })).toBeVisible();
		await page.getByRole('button', { name: 'Duplicate (2)' }).click();
		await expect(blocks).toHaveCount(5);
		// Each clone lands immediately after its own source (duplicateBlock's
		// normal single-block behavior, just applied once per selected block)
		// — not grouped at the end, so the two pairs interleave: First, its
		// own clone, then Second, its own clone, then the untouched Third.
		await expect(editors).toContainText(['First', 'First', 'Second', 'Second', 'Third']);

		// Re-select the two originals (index 0 and 2 now) and bulk-delete them.
		await blocks.nth(0).click();
		await blocks.nth(2).click({ modifiers: ['Shift'] });
		await page.getByRole('button', { name: 'Delete (2)' }).click();
		await expect(blocks).toHaveCount(3);
		await expect(editors).toContainText(['First', 'Second', 'Third']);
	});

	test('a locked block cannot be shift-clicked into a multi-selection', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();

		const blocks = page.locator('.canvas-block');
		await blocks.nth(1).click();
		await page.getByRole('button', { name: 'Lock', exact: true }).click();

		await blocks.nth(0).click();
		await blocks.nth(1).click({ modifiers: ['Shift'] });
		await expect(blocks.nth(1)).not.toHaveClass(/canvas-block-multi-selected/);
		await expect(page.getByRole('button', { name: /^Duplicate/ })).toHaveText('Duplicate');
	});
});

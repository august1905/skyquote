import { test, expect } from '@playwright/test';

// Real backend, no mocking. Home for phase 2's per-block-type coverage as
// the block catalog (§15 phase 2) grows — one describe per block type.
test.describe('Page break block', () => {
	test('inserts, selects, duplicates, deletes, and persists through the generic block commands', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Page break' }).click();

		const pageBreaks = page.locator('.block-page-break');
		await expect(pageBreaks).toHaveCount(1);
		await expect(pageBreaks.first()).toHaveText('Page break');

		// It's a real block, not a stub — the generic block commands (built
		// for any Block, never page-break-specific) should just work.
		const pageBreakBlockWrapper = page.locator('.canvas-block').filter({ has: page.locator('.block-page-break') });
		await pageBreakBlockWrapper.click();
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await expect(pageBreaks).toHaveCount(2);

		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(pageBreaks).toHaveCount(1);

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();
		await expect(page.locator('.block-page-break')).toHaveCount(1);
	});
});

test.describe('Columns block', () => {
	test('nested blocks are independently editable/selectable/reorderable per column, and it all persists', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Columns (2)' }).click();

		const columns = page.locator('.block-column');
		await expect(columns).toHaveCount(2);

		// Each column starts with one blank text block, seeded by createColumnsBlock.
		await expect(columns.nth(0).locator('.ProseMirror')).toHaveCount(1);
		await expect(columns.nth(1).locator('.ProseMirror')).toHaveCount(1);

		await columns.nth(0).locator('.ProseMirror').click();
		await page.keyboard.type('Left column');
		await columns.nth(1).locator('.ProseMirror').click();
		await page.keyboard.type('Right column');
		await expect(columns.nth(0).locator('.ProseMirror')).toContainText('Left column');
		await expect(columns.nth(1).locator('.ProseMirror')).toContainText('Right column');

		// Insert a second, different block type into column 0 only — via that
		// column's own "+ Add block" menu, not the page-level one.
		await columns.nth(0).getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Page break' }).click();
		await expect(columns.nth(0).locator('.block-page-break')).toHaveCount(1);
		await expect(columns.nth(1).locator('.block-page-break')).toHaveCount(0);

		// The generic block commands (select/duplicate/delete) work on a block
		// nested in a column exactly as they do on a top-level block.
		const pageBreakInColumn0 = columns.nth(0).locator('.canvas-block').filter({ has: page.locator('.block-page-break') });
		await pageBreakInColumn0.click();
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await expect(columns.nth(0).locator('.block-page-break')).toHaveCount(2);
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(columns.nth(0).locator('.block-page-break')).toHaveCount(1);

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();

		const columnsAfterReload = page.locator('.block-column');
		await expect(columnsAfterReload).toHaveCount(2);
		await expect(columnsAfterReload.nth(0).locator('.ProseMirror')).toContainText('Left column');
		await expect(columnsAfterReload.nth(1).locator('.ProseMirror')).toContainText('Right column');
		await expect(columnsAfterReload.nth(0).locator('.block-page-break')).toHaveCount(1);
		await expect(columnsAfterReload.nth(1).locator('.block-page-break')).toHaveCount(0);
	});

	test('reorders blocks within a single column via drag, without touching the other column', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Columns (2)' }).click();

		const columns = page.locator('.block-column');
		await columns.nth(0).locator('.ProseMirror').click();
		await page.keyboard.type('First');

		// Add a second text block to column 0 so there's something to reorder.
		await columns.nth(0).getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();
		const column0Editors = columns.nth(0).locator('.ProseMirror');
		await expect(column0Editors).toHaveCount(2);
		await column0Editors.nth(1).click();
		await page.keyboard.type('Second');

		await columns.nth(0).locator('.canvas-block').nth(1).click();
		const handle = page.getByRole('button', { name: 'Drag to reorder' });
		const handleBox = await handle.boundingBox();
		const targetBox = await columns.nth(0).locator('.canvas-block').nth(0).boundingBox();
		if (!handleBox || !targetBox) throw new Error('expected both blocks to have a bounding box');

		await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(100);
		await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 - 15, { steps: 10 });
		await page.waitForTimeout(100);
		await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 5, { steps: 20 });
		await page.waitForTimeout(100);
		await page.mouse.up();
		await page.waitForTimeout(150);

		await expect(column0Editors.nth(0)).toContainText('Second');
		await expect(column0Editors.nth(1)).toContainText('First');
		// Column 1's own untouched blank text block is unaffected.
		await expect(columns.nth(1).locator('.ProseMirror')).toHaveCount(1);
	});
});

test.describe('Table block', () => {
	test('cells are independently editable, row/column add-remove work, header-row toggles, and it all persists', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Table (2×2)' }).click();

		const cells = page.locator('.block-table-cell');
		await expect(cells).toHaveCount(4);
		await expect(page.locator('.block-table-header-row')).toHaveCount(1);

		// Cell content is independent per cell.
		await cells.nth(0).click();
		await page.keyboard.type('A1');
		await cells.nth(3).click();
		await page.keyboard.type('D2');
		await expect(cells.nth(0)).toContainText('A1');
		await expect(cells.nth(3)).toContainText('D2');
		await expect(cells.nth(1)).toHaveText('');

		// Clicking into a cell also selected the table block itself (the click
		// bubbles up to its SortableBlock) — its row/column controls now show.
		await page.getByRole('button', { name: '+ Row' }).click();
		await expect(page.locator('.block-table tbody tr')).toHaveCount(3);
		await expect(cells).toHaveCount(6);

		await page.getByRole('button', { name: '+ Column' }).click();
		await expect(cells).toHaveCount(9);

		await page.getByRole('button', { name: '− Column' }).click();
		await expect(cells).toHaveCount(6);
		await page.getByRole('button', { name: '− Row' }).click();
		await expect(cells).toHaveCount(4);

		// addRow/addColumn/removeRow/removeColumn above only ever acted on the
		// LAST row/column, so cell (0,0)'s content was never touched.
		await expect(cells.nth(0)).toContainText('A1');

		await page.getByLabel('Header row').uncheck();
		await expect(page.locator('.block-table-header-row')).toHaveCount(0);

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();

		await expect(page.locator('.block-table-cell')).toHaveCount(4);
		await expect(page.locator('.block-table-cell').first()).toContainText('A1');
		await expect(page.locator('.block-table-header-row')).toHaveCount(0);
	});

	test('the last row and the last column cannot be removed', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Table (2×2)' }).click();
		await page.locator('.block-table-cell').first().click();

		await page.getByRole('button', { name: '− Row' }).click();
		await expect(page.locator('.block-table tbody tr')).toHaveCount(1);
		await expect(page.getByRole('button', { name: '− Row' })).toBeDisabled();

		await page.getByRole('button', { name: '− Column' }).click();
		await expect(page.locator('.block-table-cell')).toHaveCount(1);
		await expect(page.getByRole('button', { name: '− Column' })).toBeDisabled();
	});
});

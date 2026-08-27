import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// Real backend, no mocking, same convention as the rest of this suite. §4.3's
// Settings and Lock toolbar controls — cross-cutting (every block type gets
// them), so this lives in its own file rather than template-editor-blocks.spec.ts's
// per-block-type describes.
test.describe('Block settings popover', () => {
	test('edits width, alignment, background, and border, and it persists through a reload', async ({ page }) => {
		await openNewTemplate(page);

		await page.locator('.canvas-block').first().click();
		await page.getByRole('button', { name: 'Settings', exact: true }).click();

		const content = page.locator('.canvas-block-content').first();

		await page.getByLabel('Width').fill('50');
		await expect(content).toHaveAttribute('style', /width:\s*50%/);

		await page.getByLabel('Alignment').selectOption('center');
		await expect(content).toHaveAttribute('style', /margin-left:\s*auto/);
		await expect(content).toHaveAttribute('style', /margin-right:\s*auto/);

		await page.getByLabel('Background').fill('#ff0000');
		await expect(content).toHaveAttribute('style', /background-color:\s*(#ff0000|rgb\(255,\s*0,\s*0\))/);

		await page.getByLabel('Border', { exact: true }).check();
		await expect(content).toHaveAttribute('style', /border:\s*1px solid/);

		await saveNow(page);
		await page.reload();

		const contentAfterReload = page.locator('.canvas-block-content').first();
		await expect(contentAfterReload).toHaveAttribute('style', /width:\s*50%/);
		await expect(contentAfterReload).toHaveAttribute('style', /border:\s*1px solid/);
	});

	test('closes when clicking outside, and Clear removes the background color', async ({ page }) => {
		await openNewTemplate(page);

		await page.locator('.canvas-block').first().click();
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		await page.getByLabel('Background').fill('#00ff00');

		// `exact` because §2's formatting toolbar has a "Clear formatting"
		// button that this would otherwise also match — same substring-
		// collision fix already applied to 'Settings' above.
		await page.getByRole('button', { name: 'Clear', exact: true }).click();
		await expect(page.locator('.canvas-block-content').first()).not.toHaveAttribute('style', /background-color/);

		await page.locator('.canvas-page').click({ position: { x: 5, y: 5 } });
		await expect(page.locator('.block-settings-popover')).toHaveCount(0);
	});
});

// §4.3's placement — pinning a block to an exact spot on the page, and now the
// only way to put one somewhere precise. The per-side padding/margin controls
// that used to sit beside it on the toolbar were removed once this proved to be
// the better answer (Grayson, 2026-08-27): four spacing numbers were always an
// indirect way of saying "put it here". Stored spacing still renders, so
// `blockStyle.ts` and its unit tests stay.
test.describe('Pinning a block to the page', () => {
	test('pins where the block already is, moves by drag and by typed coordinates, and persists', async ({ page }) => {
		await openNewTemplate(page);

		const block = page.locator('.canvas-block').first();
		await block.click();
		// Inert until something is pinned: an X that moves nothing would be a
		// control that lies about what it does.
		await expect(page.getByLabel('Position X')).toBeDisabled();

		await page.getByRole('button', { name: 'Pin block to the page' }).click();
		const placed = page.locator('.canvas-placed');
		await expect(placed).toHaveCount(1);
		await expect(page.getByLabel('Position X')).toBeEnabled();

		// Pinning captures the block's current rect rather than dropping it at 0,0 —
		// a pin that teleports the block is one you have to undo before using.
		const pinnedX = Number(await page.getByLabel('Position X').inputValue());
		const pinnedY = Number(await page.getByLabel('Position Y').inputValue());
		expect(pinnedX).toBeGreaterThan(0);
		expect(pinnedY).toBeGreaterThan(0);

		// Typed coordinates, which is the precision half of the feature.
		await page.getByLabel('Position X').fill('120');
		await page.getByLabel('Position Y').fill('320');
		await page.getByLabel('Position W').fill('400');
		// Horizontal is emitted as a percentage of the page width so the block holds
		// its spot on a page that shrinks; 120/816 and 400/816.
		await expect(placed).toHaveCSS('left', /^(120px|14\.70)/);
		await expect(placed).toHaveCSS('top', '320px');

		// Dragging the move handle, which is the fast half. Snapped to an 8px grid,
		// so 80px of pointer movement is 80px of block movement.
		const handle = page.getByRole('button', { name: 'Move block on the page' });
		const box = (await handle.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 8 });
		await page.mouse.up();
		await expect(page.getByLabel('Position Y')).toHaveValue('400');

		// One undo step for the whole gesture, not one per pointer move.
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByLabel('Position Y')).toHaveValue('320');

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.canvas-placed')).toHaveCSS('top', '320px');

		// Unpinning puts it back in the flow, at its original place in the page.
		await page.locator('.canvas-block').first().click();
		await page.getByRole('button', { name: 'Pin block to the page' }).click();
		await expect(page.locator('.canvas-placed')).toHaveCount(0);
		await expect(page.locator('.canvas-page-blocks .canvas-block')).toHaveCount(1);
	});

	test('a pinned block leaves the flow, so the blocks after it move up', async ({ page }) => {
		await openNewTemplate(page);

		// Two blocks: pinning the first must not leave a gap where it used to be.
		const first = page.locator('.canvas-block').first();
		await first.click();
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Page break' }).click();

		const pageBreak = page.locator('.block-page-break');
		const before = (await pageBreak.boundingBox())!.y;

		await page.locator('.canvas-page-blocks .canvas-block').first().click();
		await page.getByRole('button', { name: 'Pin block to the page' }).click();
		await page.getByLabel('Position Y').fill('600');

		// The page break rose to the top of the column — the pinned block occupies
		// no space there any more. Without this, pagination would still be measuring
		// a block that isn't in the flow.
		expect((await pageBreak.boundingBox())!.y).toBeLessThan(before);
	});
});

test.describe('Block lock', () => {
	test('a locked block cannot be dragged, deleted, or edited, and unlocking restores all three', async ({ page }) => {
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Before lock');

		await page.getByRole('button', { name: 'Lock', exact: true }).click();

		// Locked: no drag handle, no Delete button, and typing doesn't change content.
		await expect(page.getByRole('button', { name: 'Drag to reorder' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
		await expect(editor).toHaveAttribute('contenteditable', 'false');
		await editor.click({ force: true });
		await page.keyboard.type(' more text');
		await expect(editor).toContainText('Before lock');
		await expect(editor).not.toContainText('more text');

		await page.getByRole('button', { name: 'Unlock' }).click();

		await expect(page.getByRole('button', { name: 'Drag to reorder' })).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);
		await expect(editor).toHaveAttribute('contenteditable', 'true');
		await editor.click();
		await page.keyboard.type(' after unlock');
		await expect(editor).toContainText('after unlock');
	});
});

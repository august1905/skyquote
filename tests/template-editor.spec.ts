import { test, expect } from '@playwright/test';

// Real backend, no mocking — same convention as the rest of this suite.
// Each run creates a real Template row + Stratus object via "+ New template".
test.describe('Template editor canvas', () => {
	test('type across blocks, add/drag/undo/redo/duplicate/delete all work end to end', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);
		await expect(page.getByRole('heading', { name: 'Untitled template' })).toBeVisible();

		const editors = page.locator('.canvas-block .ProseMirror');
		await expect(editors).toHaveCount(1);

		await editors.nth(0).click();
		await page.keyboard.type('First block');
		await expect(editors.nth(0)).toContainText('First block');

		// This app's undo is the command stack, not the browser's native
		// contenteditable undo — StarterKit's `undoRedo: false` (see
		// TextBlockView.tsx) is supposed to make Ctrl+Z inside a focused block
		// a no-op rather than reverting text some way that bypasses our state.
		await page.keyboard.press('ControlOrMeta+z');
		await expect(editors.nth(0)).toContainText('First block');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();
		await expect(editors).toHaveCount(2);
		await editors.nth(1).click();
		await page.keyboard.type('Second block');
		await expect(editors.nth(1)).toContainText('Second block');

		// Drag block 2 above block 1 via its handle (only visible once selected).
		await page.locator('.canvas-block').nth(1).click();
		const handle = page.getByRole('button', { name: 'Drag to reorder' });
		const handleBox = await handle.boundingBox();
		const targetBox = await page.locator('.canvas-block').nth(0).boundingBox();
		if (!handleBox || !targetBox) throw new Error('expected both blocks to have a bounding box');

		await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(100);
		await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 - 15, { steps: 10 });
		await page.waitForTimeout(100);
		await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 5, { steps: 20 });
		await page.waitForTimeout(100);
		await page.mouse.up();
		// dnd-kit's own post-drop cleanup (clearing its internal drag/transform
		// state) needs a beat to settle before interacting with anything
		// outside the dragged block — clicking "Undo" immediately after
		// mouse.up() intermittently landed on a button mid-re-render and its
		// onClick never fired, even though Playwright's own actionability
		// checks (visible/enabled/stable) reported success.
		await page.waitForTimeout(150);

		await expect(editors.nth(0)).toContainText('Second block');
		await expect(editors.nth(1)).toContainText('First block');

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(editors.nth(0)).toContainText('First block');
		await expect(editors.nth(1)).toContainText('Second block');

		await page.getByRole('button', { name: 'Redo' }).click();
		await expect(editors.nth(0)).toContainText('Second block');
		await expect(editors.nth(1)).toContainText('First block');

		// Selection survived the reorder/undo/redo round trip (it's keyed by
		// block id, not array index) — block 2's toolbar is still the one
		// showing, now at index 0.
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await expect(editors).toHaveCount(3);
		await expect(editors).toContainText(['Second block', 'Second block', 'First block']);

		// Deletes the still-selected original (index 0) — the clone survives.
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(editors).toHaveCount(2);
		await expect(editors).toContainText(['Second block', 'First block']);
	});
});

import { test, expect } from '@playwright/test';
import { openNewTemplate, unpinSelectedBlock } from './templateFixture';

// Real backend, no mocking — same convention as the rest of this suite.
// Each run creates a real Template row + Stratus object via "+ New template".
test.describe('Template editor canvas', () => {
	test('type across blocks, add/drag/undo/redo/duplicate/delete all work end to end @core', async ({ page }) => {
		await openNewTemplate(page);
		// The header shows the template's own name. That it *defaults* to "Untitled
		// template" is a property of creating one, and is asserted where creation
		// is tested — templates-list.spec.ts's "+ New template" test.
		await expect(page.getByRole('heading', { name: 'zz-fixture' })).toBeVisible();

		const editors = page.locator('.canvas-block .ProseMirror');
		await expect(editors).toHaveCount(1);

		await editors.nth(0).click();
		await page.keyboard.type('First block');
		await expect(editors.nth(0)).toContainText('First block');

		// This app's undo is the command stack, not the browser's native
		// contenteditable undo — StarterKit's `undoRedo: false` (see
		// TextBlockView.tsx) means ProseMirror has no history of its own.
		//
		// Updated when §9.3's keyboard layer landed: Ctrl+Z inside a focused
		// block used to be a deliberate no-op (there was nothing bound to it,
		// and the assertion here existed to prove native contenteditable undo
		// wasn't reverting text behind the command stack's back). It now
		// performs a real command-stack undo, which is what §9.3's table
		// actually asks for. The guarantee the original assertion cared about
		// still holds and is still checked, just differently: a whole burst of
		// typing reverts as ONE coalesced entry, which is only possible via
		// the command stack — native undo would peel it back character group
		// by character group.
		await page.keyboard.press('ControlOrMeta+z');
		await expect(editors.nth(0)).not.toContainText('First block');
		await page.keyboard.press('ControlOrMeta+Shift+z');
		await expect(editors.nth(0)).toContainText('First block');

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
		await expect(editors).toHaveCount(2);
		// New blocks arrive pinned (movable) by default; this test is about *flow*
		// behaviour — reorder by drag — so put the new block back in the flow.
		await unpinSelectedBlock(page);
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

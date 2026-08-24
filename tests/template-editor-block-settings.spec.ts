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

// §4.3's padding and margin, which moved out of the Settings popover above and
// onto the toolbar — per side, and reachable without opening anything.
test.describe('Block spacing on the toolbar', () => {
	test('sets padding and margin per side for the selected block, and persists through a reload', async ({ page }) => {
		await openNewTemplate(page);

		const content = page.locator('.canvas-block-content').first();
		// Nothing selected yet: the controls are present but inert, per §2's
		// "disable rather than hide" — the bar must not reflow as selection changes.
		await expect(page.getByLabel('Padding top')).toBeDisabled();

		await page.locator('.canvas-block').first().click();
		await expect(page.getByLabel('Padding top')).toBeEnabled();

		await page.getByLabel('Padding top').fill('10');
		await page.getByLabel('Padding right').fill('20');
		await page.getByLabel('Padding bottom').fill('30');
		await page.getByLabel('Padding left').fill('40');
		// Four different values, so this can only pass with genuinely per-side
		// padding — the old control wrote one number to all four.
		await expect(content).toHaveCSS('padding', '10px 20px 30px 40px');

		// Horizontal margin used to be dropped entirely (the editor applied
		// top/bottom only), so "nudge this block right" was inexpressible.
		await page.getByLabel('Margin left').fill('24');
		await page.getByLabel('Margin top').fill('8');
		await expect(content).toHaveCSS('margin-left', '24px');
		await expect(content).toHaveCSS('margin-top', '8px');

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.canvas-block-content').first()).toHaveCSS('padding', '10px 20px 30px 40px');
		await expect(page.locator('.canvas-block-content').first()).toHaveCSS('margin-left', '24px');
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

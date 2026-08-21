import { test, expect } from '@playwright/test';

// Real backend, no mocking, same convention as the rest of this suite. §4.3's
// Settings and Lock toolbar controls — cross-cutting (every block type gets
// them), so this lives in its own file rather than template-editor-blocks.spec.ts's
// per-block-type describes.
test.describe('Block settings popover', () => {
	test('edits width, alignment, padding, margin, background, and border, and it persists through a reload', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.locator('.canvas-block').first().click();
		await page.getByRole('button', { name: 'Settings', exact: true }).click();

		const content = page.locator('.canvas-block-content').first();

		await page.getByLabel('Width').fill('50');
		await expect(content).toHaveAttribute('style', /width:\s*50%/);

		await page.getByLabel('Alignment').selectOption('center');
		await expect(content).toHaveAttribute('style', /margin-left:\s*auto/);
		await expect(content).toHaveAttribute('style', /margin-right:\s*auto/);

		await page.getByLabel('Padding').fill('20');
		// The browser collapses an equal-on-all-sides longhand value down to
		// the shorthand form when serializing the style attribute.
		await expect(content).toHaveAttribute('style', /padding:\s*20px;/);

		await page.getByLabel('Margin').fill('15');
		// Collapsed the same way — margin-top/bottom: 15px plus the
		// margin-left/right: auto from centering above serialize together as
		// the 2-value shorthand "15px auto" (vertical, then horizontal).
		await expect(content).toHaveAttribute('style', /margin:\s*15px auto;/);

		await page.getByLabel('Background').fill('#ff0000');
		await expect(content).toHaveAttribute('style', /background-color:\s*(#ff0000|rgb\(255,\s*0,\s*0\))/);

		await page.getByLabel('Border', { exact: true }).check();
		await expect(content).toHaveAttribute('style', /border:\s*1px solid/);

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();

		const contentAfterReload = page.locator('.canvas-block-content').first();
		await expect(contentAfterReload).toHaveAttribute('style', /width:\s*50%/);
		await expect(contentAfterReload).toHaveAttribute('style', /border:\s*1px solid/);
	});

	test('closes when clicking outside, and Clear removes the background color', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

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

test.describe('Block lock', () => {
	test('a locked block cannot be dragged, deleted, or edited, and unlocking restores all three', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

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

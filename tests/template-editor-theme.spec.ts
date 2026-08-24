import { test, expect } from '@playwright/test';
import { openNewTemplate } from './templateFixture';

// Real backend, no mocking, same convention as the rest of this suite. §3's
// Theme panel — the last phase-2 item.
test.describe('Theme panel', () => {
	test('edits fonts, colors, and spacing, applies them live, and persists through a reload', async ({ page }) => {
		await openNewTemplate(page);

		await expect(page.locator('.theme-panel')).toHaveCount(0);
		await page.getByRole('button', { name: 'Theme' }).click();
		await expect(page.locator('.theme-panel')).toBeVisible();

		await page.getByLabel('Heading font').fill('Impact, sans-serif');
		await page.getByLabel('Body font').fill('Courier New, monospace');
		await page.getByLabel('Heading color').fill('#ff0000');
		await page.getByLabel('Text color').fill('#0000ff');
		await page.getByLabel('Page background').fill('#eeeeee');
		await page.getByLabel('Block spacing (px)').fill('40');

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await expect(editor).toHaveCSS('font-family', /Courier New/);
		await expect(editor).toHaveCSS('color', 'rgb(0, 0, 255)');
		await expect(page.locator('.canvas-page').first()).toHaveCSS('background-color', 'rgb(238, 238, 238)');

		// A heading actually needs to exist to check the heading font/color —
		// type one via the paragraph-style shortcut Tiptap's StarterKit gives
		// every block: markdown-style "# " at the start of a line becomes an H1.
		await editor.click();
		await page.keyboard.type('# A heading');
		const heading = editor.locator('h1');
		await expect(heading).toHaveCSS('font-family', /Impact/);
		await expect(heading).toHaveCSS('color', 'rgb(255, 0, 0)');

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();

		await expect(page.locator('.canvas-page').first()).toHaveCSS('background-color', 'rgb(238, 238, 238)');
		await page.getByRole('button', { name: 'Theme' }).click();
		await expect(page.getByLabel('Block spacing (px)')).toHaveValue('40');
	});

});

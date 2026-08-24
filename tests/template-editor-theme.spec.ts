import { test, expect } from '@playwright/test';
import { expectBackgroundImageLoads, openNewTemplate, saveNow } from './templateFixture';
import { cleanupFixtureImages, uniqueImageUpload } from './imageLibrary';

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

		await saveNow(page);
		await page.reload();

		await expect(page.locator('.canvas-page').first()).toHaveCSS('background-color', 'rgb(238, 238, 238)');
		await page.getByRole('button', { name: 'Theme' }).click();
		await expect(page.getByLabel('Block spacing (px)')).toHaveValue('40');
	});

	test('a default page background image applies to every page, and a page can still override it', async ({ page, request }) => {
		const themeImage = uniqueImageUpload('theme-bg');
		const pageImage = uniqueImageUpload('page-override');
		try {
			await openNewTemplate(page);

			// A second page, so "applies to every page" means something.
			await page.getByRole('button', { name: 'Add page at the end' }).click();
			await page.getByRole('menuitem', { name: /Blank page/ }).click();
			await expect(page.locator('.canvas-page')).toHaveCount(2);

			await page.getByRole('button', { name: 'Theme' }).click();
			await page.locator('.theme-panel').getByRole('button', { name: 'Choose image' }).click();
			const picker = page.getByRole('dialog', { name: 'Choose an image' });
			await picker.getByLabel('Upload images').setInputFiles(themeImage);
			await picker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });

			// Both pages pick it up — it's the template's default, not one page's — and
			// it genuinely loads rather than merely being declared (see the helper).
			await expectBackgroundImageLoads(page, page.locator('.canvas-page').nth(0));
			await expect(page.locator('.canvas-page').nth(1)).toHaveAttribute('style', /background-image: url/);
			const themeUrl = await page.locator('.canvas-page').nth(0).getAttribute('style');

			await page.getByRole('button', { name: 'Close theme panel' }).click();

			// Page 2 sets its own, which must win over the default.
			await page.locator('.canvas-page-group').nth(1).getByRole('button', { name: 'Page options' }).click();
			await page.locator('.page-menu-popover').getByRole('button', { name: 'Set background image' }).click();
			const pagePicker = page.getByRole('dialog', { name: 'Choose an image' });
			await pagePicker.getByLabel('Upload images').setInputFiles(pageImage);
			await pagePicker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });

			// Page 1 still shows the theme's; page 2 shows its own.
			await expect(page.locator('.canvas-page').nth(0)).toHaveAttribute('style', String(themeUrl));
			const overriddenStyle = await page.locator('.canvas-page').nth(1).getAttribute('style');
			expect(overriddenStyle).toMatch(/background-image: url/);
			expect(overriddenStyle).not.toBe(themeUrl);

			await saveNow(page);
			await page.reload();
			await expect(page.locator('.canvas-page').nth(0)).toHaveAttribute('style', /background-image: url/);
			await expectBackgroundImageLoads(page, page.locator('.canvas-page').nth(1));
		} finally {
			await cleanupFixtureImages(request, [themeImage, pageImage]);
		}
	});
});

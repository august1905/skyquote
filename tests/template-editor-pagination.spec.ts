import { test, expect } from '@playwright/test';

// §10's real pagination, v1-scoped to whole-block granularity (see
// distributePages.ts's own comment) — real backend, no mocking, same
// convention as the rest of this suite.

const LONG_PARAGRAPH =
	'This is a deliberately long paragraph of filler text, written to reliably wrap across several lines at the default page content width so this one text block occupies real, substantial vertical space on the canvas without depending on any exact pixel measurement.';

async function insertTextBlock(page: import('@playwright/test').Page, text: string) {
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Text' }).click();
	const editors = page.locator('.canvas-block .ProseMirror');
	const newEditor = editors.last();
	await newEditor.click();
	await page.keyboard.type(text);
}

async function insertPageBreak(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Page break' }).click();
}

/** §3 ①'s ⋮ overflow owns Settings and Export PDF, matching the spec's own placement — so reaching them goes through the menu. */
async function fromTemplateMenu(page: import('@playwright/test').Page, item: string) {
	await page.getByRole('button', { name: 'More template actions' }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

test.describe('Real pagination (§10)', () => {
	test('content overflowing the default page content height spills onto a second physical page, and it persists through a reload', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		// The template starts with one blank text block already — fill it, then
		// add several more long ones. Comfortably more than enough to exceed a
		// default Letter-portrait page's ~864px content height regardless of
		// exact font metrics in whatever browser this runs in.
		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type(LONG_PARAGRAPH);
		for (let i = 0; i < 7; i++) {
			await insertTextBlock(page, `${LONG_PARAGRAPH} (block ${i + 2})`);
		}

		await expect(page.locator('.canvas-page')).toHaveCount(2, { timeout: 10000 });
		// Every block that was typed is still there, in order, just spread
		// across two physical page frames instead of one growing indefinitely —
		// nothing was dropped by the distribution pass.
		await expect(page.locator('.canvas-block .ProseMirror')).toHaveCount(8);
		await expect(page.locator('.canvas-block .ProseMirror').nth(0)).toContainText(LONG_PARAGRAPH);
		await expect(page.locator('.canvas-block .ProseMirror').nth(7)).toContainText('(block 8)');

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 8000 });
		await page.reload();

		await expect(page.locator('.canvas-page')).toHaveCount(2, { timeout: 10000 });
		await expect(page.locator('.canvas-block .ProseMirror')).toHaveCount(8);
		await expect(page.locator('.canvas-block .ProseMirror').nth(7)).toContainText('(block 8)');
	});

	test('a page break block forces everything after it onto a new physical page, deterministically', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type('Before the break');
		await insertPageBreak(page);
		await insertTextBlock(page, 'After the break');

		await expect(page.locator('.canvas-page')).toHaveCount(2);
		const firstPage = page.locator('.canvas-page').nth(0);
		const secondPage = page.locator('.canvas-page').nth(1);
		await expect(firstPage.locator('.ProseMirror')).toHaveText('Before the break');
		await expect(firstPage.locator('.block-page-break')).toBeVisible();
		await expect(secondPage.locator('.ProseMirror')).toHaveText('After the break');

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();

		await expect(page.locator('.canvas-page')).toHaveCount(2);
		await expect(page.locator('.canvas-page').nth(0).locator('.ProseMirror')).toHaveText('Before the break');
		await expect(page.locator('.canvas-page').nth(1).locator('.ProseMirror')).toHaveText('After the break');
	});

	test('page settings: page size/orientation change the physical page dimensions, and page numbers can be toggled on', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		const canvasPage = page.locator('.canvas-page').first();
		const letterPortraitBox = await canvasPage.boundingBox();
		if (!letterPortraitBox) throw new Error('expected the page frame to have a bounding box');
		expect(Math.round(letterPortraitBox.width)).toBe(816);
		expect(Math.round(letterPortraitBox.height)).toBe(1056);

		await fromTemplateMenu(page, 'Settings');
		await page.getByLabel('Page size').selectOption('A4');
		const a4Box = await canvasPage.boundingBox();
		if (!a4Box) throw new Error('expected a bounding box after switching to A4');
		expect(Math.round(a4Box.width)).toBe(794);
		expect(Math.round(a4Box.height)).toBe(1123);

		await page.getByLabel('Orientation').selectOption('landscape');
		const landscapeBox = await canvasPage.boundingBox();
		if (!landscapeBox) throw new Error('expected a bounding box after switching to landscape');
		expect(Math.round(landscapeBox.width)).toBe(1123);
		expect(Math.round(landscapeBox.height)).toBe(794);

		await expect(page.locator('.canvas-page-number')).toHaveCount(0);
		await page.getByLabel('Page numbers').check();
		await expect(page.locator('.canvas-page-number').first()).toHaveText('Page 1');

		await page.getByRole('button', { name: 'Close page settings' }).click();
		await expect(page.locator('.page-settings-panel')).toHaveCount(0);

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();

		const reloadedBox = await page.locator('.canvas-page').first().boundingBox();
		if (!reloadedBox) throw new Error('expected a bounding box after reload');
		expect(Math.round(reloadedBox.width)).toBe(1123);
		expect(Math.round(reloadedBox.height)).toBe(794);
		await expect(page.locator('.canvas-page-number').first()).toHaveText('Page 1');
	});

	test('page numbers stay cumulatively correct across multiple physical pages', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type('Page one content');
		await insertPageBreak(page);
		await insertTextBlock(page, 'Page two content');
		await insertPageBreak(page);
		await insertTextBlock(page, 'Page three content');

		await fromTemplateMenu(page, 'Settings');
		await page.getByLabel('Page numbers').check();
		await page.getByRole('button', { name: 'Close page settings' }).click();

		await expect(page.locator('.canvas-page')).toHaveCount(3);
		await expect(page.locator('.canvas-page-number').nth(0)).toHaveText('Page 1');
		await expect(page.locator('.canvas-page-number').nth(1)).toHaveText('Page 2');
		await expect(page.locator('.canvas-page-number').nth(2)).toHaveText('Page 3');
	});
});

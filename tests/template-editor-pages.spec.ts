import { test, expect, type Page } from '@playwright/test';
import { expectBackgroundImageLoads, openNewTemplate, saveNow } from './templateFixture';
import { cleanupFixtureImages, uniqueImageUpload } from './imageLibrary';

// §3 ⑤'s per-page chrome (name, insert-after, `…` menu) and §3 ②'s page
// navigator drawer. Real backend, no mocking — same convention as the rest of
// this suite; each run creates a real Template row + Stratus object.

async function newTemplate(page: Page) {
	await openNewTemplate(page);
}

/** Every authored page's wrapper — one per `Page`, regardless of how many physical pages it spills onto. */
function pageGroups(page: Page) {
	return page.locator('.canvas-page-group');
}

/**
 * Opens a page's `…` menu and returns the popover, scoped.
 *
 * Scoping matters rather than being tidiness: the floating *block* toolbar has
 * its own "Duplicate" and "Delete", so an unscoped `getByRole('button', {name:
 * 'Duplicate'})` is ambiguous the moment a block is also selected.
 */
/**
 * The page `+` opens a blank-or-image menu now rather than inserting outright,
 * so every "just give me a page" caller picks Blank explicitly.
 */
async function insertBlankPageAfter(page: Page, groupIndex: number) {
	await pageGroups(page).nth(groupIndex).getByRole('button', { name: 'Insert page after' }).click();
	await page.getByRole('menuitem', { name: /Blank page/ }).click();
}

async function openPageMenu(page: Page, groupIndex: number) {
	await pageGroups(page).nth(groupIndex).getByRole('button', { name: 'Page options' }).click();
	const menu = pageGroups(page).nth(groupIndex).locator('.page-menu-popover');
	await menu.waitFor();
	return menu;
}

test.describe('Page management (§3 ⑤)', () => {
	test('insert-after adds a page in the right position, and the name is inline-editable and persists', async ({ page }) => {
		await newTemplate(page);
		await expect(pageGroups(page)).toHaveCount(1);

		const firstName = pageGroups(page).nth(0).getByLabel('Page name');
		await firstName.fill('Cover');

		// Insert after page 1 — the new page lands second, not appended blindly
		// at the end (which would look identical with only one page, hence the
		// third page added below to actually discriminate).
		await insertBlankPageAfter(page, 0);
		await expect(pageGroups(page)).toHaveCount(2);
		await pageGroups(page).nth(1).getByLabel('Page name').fill('Terms');

		await insertBlankPageAfter(page, 0);
		await expect(pageGroups(page)).toHaveCount(3);
		// Inserted directly after "Cover", pushing "Terms" to last.
		await expect(pageGroups(page).nth(0).getByLabel('Page name')).toHaveValue('Cover');
		await expect(pageGroups(page).nth(2).getByLabel('Page name')).toHaveValue('Terms');

		await saveNow(page);
		await page.reload();
		await expect(pageGroups(page)).toHaveCount(3);
		await expect(pageGroups(page).nth(0).getByLabel('Page name')).toHaveValue('Cover');
		await expect(pageGroups(page).nth(2).getByLabel('Page name')).toHaveValue('Terms');
	});

	test('duplicate copies the page and its content, and the copies edit independently', async ({ page }) => {
		await newTemplate(page);
		await pageGroups(page).nth(0).getByLabel('Page name').fill('Source');
		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Original content');

		const menu = await openPageMenu(page, 0);
		await menu.getByRole('button', { name: 'Duplicate' }).click();

		await expect(pageGroups(page)).toHaveCount(2);
		await expect(pageGroups(page).nth(1).getByLabel('Page name')).toHaveValue('Source (copy)');
		await expect(pageGroups(page).nth(1).locator('.ProseMirror').first()).toContainText('Original content');

		// The real invariant behind duplicatePage's block re-id: editing the copy
		// must not touch the source. If ids were shared, locateBlock would
		// resolve both to whichever it found first.
		const copyEditor = pageGroups(page).nth(1).locator('.ProseMirror').first();
		await copyEditor.click();
		await page.keyboard.press('End');
		await page.keyboard.type(' — edited in copy');
		await expect(copyEditor).toContainText('Original content — edited in copy');
		await expect(pageGroups(page).nth(0).locator('.ProseMirror').first()).toHaveText('Original content');
	});

	test('move up/down reorders pages, and delete is blocked while only one page remains', async ({ page }) => {
		await newTemplate(page);

		// Delete is unavailable on a lone page — a template must always have one.
		const loneMenu = await openPageMenu(page, 0);
		await expect(loneMenu.getByRole('button', { name: 'Delete page' })).toBeDisabled();
		await page.keyboard.press('Escape');

		await pageGroups(page).nth(0).getByLabel('Page name').fill('First');
		await insertBlankPageAfter(page, 0);
		await pageGroups(page).nth(1).getByLabel('Page name').fill('Second');

		// Move up on the first page and move down on the last are both no-ops
		// with nowhere to go, so they're disabled rather than silently doing
		// nothing.
		const firstMenu = await openPageMenu(page, 0);
		await expect(firstMenu.getByRole('button', { name: 'Move up' })).toBeDisabled();
		await firstMenu.getByRole('button', { name: 'Move down' }).click();
		await expect(pageGroups(page).nth(0).getByLabel('Page name')).toHaveValue('Second');
		await expect(pageGroups(page).nth(1).getByLabel('Page name')).toHaveValue('First');

		// Now that there are two pages, delete works — and is undoable.
		const deleteMenu = await openPageMenu(page, 0);
		await deleteMenu.getByRole('button', { name: 'Delete page' }).click();
		await expect(pageGroups(page)).toHaveCount(1);
		await expect(pageGroups(page).nth(0).getByLabel('Page name')).toHaveValue('First');

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(pageGroups(page)).toHaveCount(2);
		await expect(pageGroups(page).nth(0).getByLabel('Page name')).toHaveValue('Second');
	});

	test('setting a page background overrides the theme for that page only, and clearing restores inheritance', async ({ page }) => {
		await newTemplate(page);
		await insertBlankPageAfter(page, 0);
		await expect(pageGroups(page)).toHaveCount(2);

		// Page.background has existed in the domain model since phase 1 with
		// nothing reading it; this is the first thing that renders it.
		const bgMenu = await openPageMenu(page, 0);
		await bgMenu.getByLabel('This page background').fill('#ff0000');
		await page.keyboard.press('Escape');

		const firstFrame = pageGroups(page).nth(0).locator('.canvas-page');
		const secondFrame = pageGroups(page).nth(1).locator('.canvas-page');
		await expect(firstFrame).toHaveCSS('background-color', 'rgb(255, 0, 0)');
		// Per-page, not template-wide: the untouched page still inherits.
		await expect(secondFrame).toHaveCSS('background-color', 'rgb(255, 255, 255)');

		await saveNow(page);
		await page.reload();
		await expect(pageGroups(page).nth(0).locator('.canvas-page')).toHaveCSS('background-color', 'rgb(255, 0, 0)');

		// Clearing means "follow the theme again", which is a different state
		// from painting it white — verified by changing the theme afterwards and
		// watching this page follow it.
		const clearMenu = await openPageMenu(page, 0);
		await clearMenu.getByRole('button', { name: 'Clear background' }).click();
		await expect(pageGroups(page).nth(0).locator('.canvas-page')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

		await page.getByRole('button', { name: 'Theme' }).click();
		await page.getByLabel('Page background').fill('#00ff00');
		await page.getByRole('button', { name: 'Close theme panel' }).click();
		await expect(pageGroups(page).nth(0).locator('.canvas-page')).toHaveCSS('background-color', 'rgb(0, 255, 0)');
	});
});

test.describe('Page navigator (§3 ②)', () => {
	test('the toolbar toggle opens a drawer listing every page with a live count badge, and reorders from there', async ({ page }) => {
		await newTemplate(page);

		// `exact` because the drawer's own "Close pages panel" would otherwise
		// substring-match this too.
		const pagesToggle = page.getByRole('button', { name: 'Pages', exact: true });
		await expect(pagesToggle).toContainText('1');
		// Closed by default — it narrows the canvas, so it shouldn't open unasked.
		await expect(page.locator('.page-navigator')).toHaveCount(0);

		await pagesToggle.click();
		const drawer = page.locator('.page-navigator');
		await expect(drawer).toBeVisible();
		await expect(drawer.locator('.page-navigator-item')).toHaveCount(1);

		// "+ Page" in the toolbar is §2's "+ Document", resolved by the spec
		// itself as an add-page alias.
		await page.getByRole('button', { name: '+ Page' }).click();
		await expect(pagesToggle).toContainText('2');
		await expect(drawer.locator('.page-navigator-item')).toHaveCount(2);

		await pageGroups(page).nth(0).getByLabel('Page name').fill('Alpha');
		await pageGroups(page).nth(1).getByLabel('Page name').fill('Beta');
		await expect(drawer.locator('.page-navigator-name').nth(0)).toHaveText('Alpha');
		await expect(drawer.locator('.page-navigator-name').nth(1)).toHaveText('Beta');

		// Block count is the drawer's honest stand-in for a real thumbnail
		// (see PageNavigator's own comment on why there isn't one yet).
		await expect(drawer.locator('.page-navigator-meta').nth(0)).toHaveText('1 block');

		await drawer.getByRole('button', { name: 'Move Alpha down' }).click();
		await expect(drawer.locator('.page-navigator-name').nth(0)).toHaveText('Beta');
		await expect(pageGroups(page).nth(0).getByLabel('Page name')).toHaveValue('Beta');

		await drawer.getByRole('button', { name: 'Close pages panel' }).click();
		await expect(page.locator('.page-navigator')).toHaveCount(0);
	});
});

// Adding pages, and the per-page background image — §3 ⑤'s page chrome rather
// than the navigator drawer above.
test.describe('Adding pages and page backgrounds', () => {
	test('a page can be added at the bottom, not only between and above', async ({ page }) => {
		// The only page control used to be a `+` above each page that inserted
		// *after* it, so appending meant reaching for the control above the last
		// page and reasoning about where its page would land.
		await newTemplate(page);
		await expect(pageGroups(page)).toHaveCount(1);

		await pageGroups(page).nth(0).getByLabel('Page name').fill('First');
		await page.getByRole('button', { name: 'Add page at the end' }).click();
		await page.getByRole('menuitem', { name: /Blank page/ }).click();

		await expect(pageGroups(page)).toHaveCount(2);
		// Appended, not prepended — the new page is below the one that was there.
		await expect(pageGroups(page).nth(0).getByLabel('Page name')).toHaveValue('First');
		await expect(pageGroups(page).nth(1).getByLabel('Page name')).toHaveValue('Untitled page');
	});

	test('a page background image can be set from the ⋯ menu, survives a reload, and is removable without losing the colour', async ({ page, request }) => {
		const upload = uniqueImageUpload('page-bg');
		try {
			await newTemplate(page);

			// A colour first, so removing the image later can be shown not to take
			// the colour with it — the two are independent.
			const menu = await openPageMenu(page, 0);
			await menu.getByLabel('This page background').fill('#123456');
			await menu.getByRole('button', { name: 'Set background image' }).click();

			const picker = page.getByRole('dialog', { name: 'Choose an image' });
			await expect(picker).toBeVisible();
			await picker.getByLabel('Upload images').setInputFiles(upload);
			await picker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });

			const canvasPage = page.locator('.canvas-page').first();
			await expect(canvasPage).toHaveAttribute('style', /background-size: cover/);
			// Loads, not merely present — see the helper. Asserting presence alone is
			// what let this feature ship painting a URL the frontend origin 404s.
			await expectBackgroundImageLoads(page, canvasPage);

			await saveNow(page);
			await page.reload();
			await expectBackgroundImageLoads(page, page.locator('.canvas-page').first());

			// Removing the image leaves the colour behind.
			const menuAfter = await openPageMenu(page, 0);
			await menuAfter.getByRole('button', { name: 'Remove background image' }).click();
			await expect(page.locator('.canvas-page').first()).not.toHaveAttribute('style', /background-image/);
			await expect(page.locator('.canvas-page').first()).toHaveAttribute('style', /--page-background: ?#123456/);
		} finally {
			await cleanupFixtureImages(request, [upload]);
		}
	});

	test('the + menu creates a page already backed by a library image', async ({ page, request }) => {
		const upload = uniqueImageUpload('page-bg-new');
		try {
			await newTemplate(page);

			await page.getByRole('button', { name: 'Add page at the end' }).click();
			await page.getByRole('menuitem', { name: /Image background/ }).click();

			const picker = page.getByRole('dialog', { name: 'Choose an image' });
			await picker.getByLabel('Upload images').setInputFiles(upload);
			await picker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });

			await expect(pageGroups(page)).toHaveCount(2);
			// The new page carries the background; the original is untouched.
			await expectBackgroundImageLoads(page, page.locator('.canvas-page').nth(1));
			await expect(page.locator('.canvas-page').nth(0)).not.toHaveAttribute('style', /background-image/);
		} finally {
			await cleanupFixtureImages(request, [upload]);
		}
	});
});

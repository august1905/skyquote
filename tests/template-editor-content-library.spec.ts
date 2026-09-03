import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// §8's Content Library. Real backend, real Data Store, real Stratus objects —
// no mocking, same convention as the rest of this suite.
//
// Every test runs inside `withCleanLibrary`, which sweeps *every* `zz-lib-`
// fixture row both before and after. That matters more here than for most specs:
// unlike a Template (which each test creates fresh and never lists), library
// items are workspace-scoped and *shared*, so one leftover row shows up in the
// next run's panel and breaks its assertions. Cleaning up front — not just in a
// `finally` — is what makes each test independent of how the previous one
// exited, since a test that times out never gets to run its `finally` at all.
// See FIXTURE_PREFIX for why the sweep is prefix-wide rather than per-test.

const BACKEND = `http://localhost:${process.env.CATALYST_SERVE_PORT || '3000'}/server/skyquote_function`;

interface LibraryItem {
	id: string;
	name: string;
	kind: string;
	usageCount: number;
}

/**
 * Every fixture row this spec creates is named `zz-lib-…`, and cleanup sweeps
 * **all** of them rather than only the calling test's own prefix.
 *
 * That distinction is the point, and scoping it per-prefix was a real bug: when
 * a run is killed mid-test (a crashed browser, a dropped connection), the
 * abandoned row belongs to *some other* test's prefix, so the next run's
 * per-prefix sweep walks straight past it. It then collides with any assertion
 * that looks across items rather than at one tile — the tag filter, in practice,
 * which found two `legal` items where it expected one. Sweeping the shared
 * prefix makes a run independent of how *any* previous run exited, not just of
 * how the previous test did.
 */
const FIXTURE_PREFIX = 'zz-lib-';

/**
 * Deletes every fixture library item, so a failed run can't poison the next one.
 *
 * Swallows its own errors on purpose. It runs from a `finally`, and when a
 * test times out Playwright has already torn down the request context — so a
 * throw here would replace the *real* assertion failure with a useless
 * "context has been closed", which is exactly what happened the first time
 * this spec ran. Cleanup must never be the reason a diagnosis is unavailable.
 */
async function cleanupLibrary(request: APIRequestContext) {
	try {
		const response = await request.get(`${BACKEND}/content-library-items`);
		if (!response.ok()) return;
		const { contentLibraryItems } = (await response.json()) as { contentLibraryItems: LibraryItem[] };
		for (const item of contentLibraryItems) {
			if (item.name.startsWith(FIXTURE_PREFIX)) await request.delete(`${BACKEND}/content-library-items/${item.id}`);
		}
	} catch {
		// See above — never mask the test's own failure.
	}
}

/**
 * Clears leftovers *before* the test as well as after. A test that times out
 * can't run its own `finally` (Playwright has already closed the request
 * context), so a leaked row would otherwise break every subsequent run — which
 * is exactly how this spec first failed.
 */
async function withCleanLibrary(request: APIRequestContext, body: () => Promise<void>) {
	await cleanupLibrary(request);
	try {
		await body();
	} finally {
		await cleanupLibrary(request);
	}
}

async function newTemplate(page: Page) {
	await openNewTemplate(page);
}

/** The tile for one item, addressed by its own accessible name rather than a substring text match — two items whose names share a prefix would otherwise both match. */
function tile(scope: ReturnType<Page['locator']>, name: string) {
	return scope.getByRole('button', { name: `Insert ${name}`, exact: true });
}

/**
 * Opens the selected block's `⋯` overflow and clicks its save action. §8 puts
 * save-to-library in the toolbar's *overflow*, not on the toolbar itself — see
 * SortableBlock's note on why that placement matters for the row's width.
 */
async function saveSelectedBlocksToLibrary(page: Page, label = 'Save to library') {
	await page.getByRole('button', { name: 'More block actions' }).click();
	await page.getByRole('button', { name: label }).click();
}

async function openLibraryPanel(page: Page) {
	await page.getByRole('button', { name: 'Content Library' }).first().click();
	const panel = page.locator('.content-library-panel');
	await expect(panel).toBeVisible();
	return panel;
}

test.describe('Content Library (§8)', () => {
	test('saves a block, then inserts it into a different template with fresh ids and a contentLibraryRef', async ({ page, request }) => {
		const name = 'zz-lib-block';
		await withCleanLibrary(request, async () => {
			// --- Save, from template A ---
			await newTemplate(page);
			const editor = page.locator('.canvas-block .ProseMirror').first();
			await editor.click();
			await page.keyboard.type('Reusable boilerplate');

			await page.locator('.canvas-block').first().click();
			await saveSelectedBlocksToLibrary(page);
			const dialog = page.getByRole('dialog', { name: 'Save to Content Library' });
			await expect(dialog).toBeVisible();
			await dialog.getByLabel('Name').fill(name);
			await dialog.getByLabel('Tags').fill('legal, boilerplate');
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expect(dialog).toHaveCount(0);

			// It appears in the panel immediately, with no refetch — the save
			// response is the authoritative row.
			const panel = await openLibraryPanel(page);
			await expect(tile(panel, name)).toBeVisible();
			await expect(panel.locator('.content-library-tag').filter({ hasText: 'legal' })).toBeVisible();

			// --- Insert, into a brand-new template B ---
			await newTemplate(page);
			const panelB = await openLibraryPanel(page);
			const blocksBefore = await page.locator('.canvas-block').count();

			await tile(panelB, name).click();
			await expect(page.locator('.canvas-block')).toHaveCount(blocksBefore + 1);
			await expect(page.locator('.canvas-block .ProseMirror').filter({ hasText: 'Reusable boilerplate' })).toBeVisible();

			// §8's usage count is recorded, which is also what drives Featured.
			await expect(panelB.locator('.content-library-tile-meta').filter({ hasText: 'used 1×' })).toBeVisible();

			// Persists as real template content, not just a transient render.
			await saveNow(page);
			await page.reload();
			await expect(page.locator('.canvas-block .ProseMirror').filter({ hasText: 'Reusable boilerplate' })).toBeVisible();
		});
	});

	test('saves a multi-selection as one item and inserts all of its blocks as a single undoable step', async ({ page, request }) => {
		const name = 'zz-lib-multi';
		await withCleanLibrary(request, async () => {
			await newTemplate(page);
			const editors = page.locator('.canvas-block .ProseMirror');
			await editors.nth(0).click();
			await page.keyboard.type('First saved');
			await page.getByRole('button', { name: '+ Add block' }).click();
			await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
			await editors.nth(1).click();
			await page.keyboard.type('Second saved');

			// §8 lists multi-selection as its own save entry point; here it's the
			// same control acting on the whole selection.
			await page.locator('.canvas-block').nth(0).click();
			await page.locator('.canvas-block').nth(1).click({ modifiers: ['Shift'] });
			await saveSelectedBlocksToLibrary(page, 'Save 2 to library');
			const dialog = page.getByRole('dialog', { name: 'Save to Content Library' });
			await dialog.getByLabel('Name').fill(name);
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expect(dialog).toHaveCount(0);

			await newTemplate(page);
			const panel = await openLibraryPanel(page);
			const blocksBefore = await page.locator('.canvas-block').count();

			await tile(panel, name).click();
			await expect(page.locator('.canvas-block')).toHaveCount(blocksBefore + 2);
			await expect(page.locator('.ProseMirror').filter({ hasText: 'First saved' })).toBeVisible();
			await expect(page.locator('.ProseMirror').filter({ hasText: 'Second saved' })).toBeVisible();

			// The point of insertBlocks: two blocks, ONE undo entry.
			await page.getByRole('button', { name: 'Undo' }).click();
			await expect(page.locator('.canvas-block')).toHaveCount(blocksBefore);
		});
	});

	test('saves a whole page and inserts it as a new page, restoring its name and background', async ({ page, request }) => {
		const name = 'zz-lib-page';
		await withCleanLibrary(request, async () => {
			await newTemplate(page);
			await page.locator('.canvas-page-group').nth(0).getByLabel('Page name').fill('Cover');
			const editor = page.locator('.canvas-block .ProseMirror').first();
			await editor.click();
			await page.keyboard.type('Cover page content');

			// Give it a background, to prove page-level presentation round-trips
			// and not just the blocks.
			await page.locator('.canvas-page-group').nth(0).getByRole('button', { name: 'Page options' }).click();
			const menu = page.locator('.page-menu-popover');
			await menu.getByLabel('This page background').fill('#ff0000');
			await menu.getByRole('button', { name: 'Save page to library' }).click();
			const dialog = page.getByRole('dialog', { name: 'Save to Content Library' });
			// Defaults to the page's own name, which is the useful starting point.
			await expect(dialog.getByLabel('Name')).toHaveValue('Cover');
			await dialog.getByLabel('Name').fill(name);
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expect(dialog).toHaveCount(0);

			await newTemplate(page);
			const panel = await openLibraryPanel(page);
			await expect(panel.locator('.content-library-tile-meta').filter({ hasText: 'Page' })).toBeVisible();

			await expect(page.locator('.canvas-page-group')).toHaveCount(1);
			await tile(panel, name).click();
			// A page item becomes a NEW page rather than merging into the current one.
			await expect(page.locator('.canvas-page-group')).toHaveCount(2);
			await expect(page.locator('.canvas-page-group').nth(1).getByLabel('Page name')).toHaveValue('Cover');
			await expect(page.locator('.canvas-page-group').nth(1).locator('.canvas-page')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
			await expect(page.locator('.ProseMirror').filter({ hasText: 'Cover page content' })).toBeVisible();
		});
	});

	test('search matches name and tags, Featured lists only reused items, and delete removes an item', async ({ page, request }) => {
		const prefix = 'zz-lib-filter';
		await withCleanLibrary(request, async () => {
			// Two items created directly through the API — this test is about the
			// panel's filtering, and driving the save dialog twice would only add
			// unrelated surface area to it.
			const block = { id: 'b1', type: 'text', locked: false, style: {}, doc: { type: 'doc', content: [] } };
			for (const [suffix, tags] of [
				['-alpha', ['legal']],
				['-beta', ['intro']],
			] as const) {
				const created = await request.post(`${BACKEND}/content-library-items`, {
					data: { name: `${prefix}${suffix}`, kind: 'block', tags, payload: { blocks: [block] } },
				});
				expect(created.ok()).toBe(true);
			}

			await newTemplate(page);
			const panel = await openLibraryPanel(page);
			await expect(tile(panel, `${prefix}-alpha`)).toBeVisible();
			await expect(tile(panel, `${prefix}-beta`)).toBeVisible();

			// Name search.
			await panel.getByLabel('Search content library').fill(`${prefix}-alpha`);
			await expect(tile(panel, `${prefix}-alpha`)).toBeVisible();
			await expect(tile(panel, `${prefix}-beta`)).toHaveCount(0);

			// Tag search — §8 asks for tags to be searchable alongside the name.
			await panel.getByLabel('Search content library').fill('intro');
			await expect(tile(panel, `${prefix}-beta`)).toBeVisible();
			await expect(tile(panel, `${prefix}-alpha`)).toHaveCount(0);
			await panel.getByLabel('Search content library').fill('');

			// Featured is "most reused" (see contentLibraryFilters.ts) — nothing
			// has been used yet, so it starts empty rather than mirroring Recent.
			await panel.getByRole('tab', { name: 'Featured' }).click();
			await expect(panel.getByText('Nothing has been reused yet.')).toBeVisible();

			await panel.getByRole('tab', { name: 'Recent' }).click();
			await tile(panel, `${prefix}-beta`).click();
			await panel.getByRole('tab', { name: 'Featured' }).click();
			await expect(tile(panel, `${prefix}-beta`)).toBeVisible();
			await expect(tile(panel, `${prefix}-alpha`)).toHaveCount(0);

			// The full-screen browser shows the same content — §8's persistent
			// "Open Content Library" button.
			await panel.getByRole('tab', { name: 'Recent' }).click();
			await panel.getByRole('button', { name: 'Open Content Library' }).click();
			const browser = page.getByRole('dialog', { name: 'Content Library browser' });
			await expect(browser).toBeVisible();
			await expect(tile(browser, `${prefix}-alpha`)).toBeVisible();
			await browser.getByRole('button', { name: 'Close content library browser' }).click();
			await expect(browser).toHaveCount(0);

			// Delete removes it from the panel and from the table.
			page.once('dialog', (confirmDialog) => void confirmDialog.accept());
			await panel.getByRole('button', { name: `Delete ${prefix}-alpha from the library` }).click();
			await expect(tile(panel, `${prefix}-alpha`)).toHaveCount(0);

			const listed = await request.get(`${BACKEND}/content-library-items`);
			const { contentLibraryItems } = (await listed.json()) as { contentLibraryItems: LibraryItem[] };
			expect(contentLibraryItems.some((item) => item.name === `${prefix}-alpha`)).toBe(false);
		});
	});

	test('an inserted field is re-idded, renamed, and remapped onto a role that exists in the target template', async ({ page, request }) => {
		const name = 'zz-lib-field';
		await withCleanLibrary(request, async () => {
			// --- Template A: a role and a field belonging to it ---
			await newTemplate(page);
			await page.getByRole('button', { name: 'Recipients / Roles' }).click();
			await page.getByRole('button', { name: '+ Add role' }).click();
			await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Signer A');
			await page.getByRole('button', { name: 'Close roles panel' }).click();

			await page.getByRole('button', { name: '+ Add block' }).click();
			// New fields default to the seeded 'Contact (Signer)' — pick the added
			// role explicitly so the saved field really belongs to 'Signer A'.
			await page.getByLabel('Fields for').selectOption({ label: 'Signer A' });
			await page.getByRole('menuitem', { name: 'Text field' }).click();
			const fieldBlock = page.locator('.canvas-block').filter({ has: page.locator('.field-block') });
			await fieldBlock.first().click();
			await saveSelectedBlocksToLibrary(page);
			const dialog = page.getByRole('dialog', { name: 'Save to Content Library' });
			await dialog.getByLabel('Name').fill(name);
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expect(dialog).toHaveCount(0);

			// --- Template B: a DIFFERENT role, so the saved roleId can't resolve ---
			await newTemplate(page);
			await page.getByRole('button', { name: 'Recipients / Roles' }).click();
			await page.getByRole('button', { name: '+ Add role' }).click();
			await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Signer B');
			await page.getByRole('button', { name: 'Close roles panel' }).click();

			// Place a field here first, so the inserted one has a name to collide
			// with — §6.1 rule 2 requires field names stay unique.
			await page.getByRole('button', { name: '+ Add block' }).click();
			await page.getByRole('menuitem', { name: 'Text field' }).click();

			const panel = await openLibraryPanel(page);
			await tile(panel, name).click();

			// Two field blocks now, with DIFFERENT names — the inserted one was
			// renamed rather than duplicating the existing merge key.
			const fieldNames = page.locator('.doc-view-field-name, .field-block-name');
			await expect(fieldNames).toHaveCount(2);
			const names = await fieldNames.allInnerTexts();
			expect(new Set(names.map((t) => t.trim())).size).toBe(2);

			// And the dangling role was remapped onto a real one, so the
			// validation surface reports no missing-role error.
			await expect(page.locator('.validation-indicator-button')).toHaveCount(0);
		});
	});
});

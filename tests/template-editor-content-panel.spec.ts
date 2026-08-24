import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { cleanupFixtureImages, uniqueImageUpload } from './imageLibrary';
import { saveNow } from './templateFixture';

// §3 ④'s Content panel — the block/field palette in the right rail — and §4.1's
// two insertion paths through it: click a tile (path 2) and drag a tile onto the
// canvas (path 1).
//
// Real backend, no mocking, same convention as the rest of this suite.
//
// Every template here is created through the API with a `zz-content-` name and
// deleted afterwards, rather than clicking "+ New template" and leaving an
// "Untitled template" behind. Most of the editor specs predate a delete route
// and still leak one row per test; this is the pattern to copy.

const BACKEND = `http://localhost:${process.env.CATALYST_SERVE_PORT || '3000'}/server/skyquote_function`;
const FIXTURE_PREFIX = 'zz-content-';

interface TemplateRow {
	id: string;
	name: string;
}

/**
 * Sweeps every fixture template, not just this test's own. A run killed
 * mid-test never reaches its own cleanup, and the row it abandoned belongs to
 * some other test's name — so a per-name sweep would walk straight past it.
 *
 * Swallows its own errors: it runs from a `finally`, and when a test times out
 * Playwright has already torn down the request context, so a throw here would
 * replace the real assertion failure with "context has been closed".
 */
async function cleanupFixtureTemplates(request: APIRequestContext) {
	try {
		const response = await request.get(`${BACKEND}/templates`);
		if (!response.ok()) return;
		const { templates } = (await response.json()) as { templates: TemplateRow[] };
		for (const template of templates) {
			if (template.name.includes(FIXTURE_PREFIX)) await request.delete(`${BACKEND}/templates/${template.id}`);
		}
	} catch {
		// Never mask the test's own failure.
	}
}

async function openFixtureTemplate(page: Page, request: APIRequestContext, label: string) {
	const response = await request.post(`${BACKEND}/templates`, { data: { name: `${FIXTURE_PREFIX}${label}` } });
	expect(response.ok()).toBeTruthy();
	const { meta } = (await response.json()) as { meta: { id: string } };
	await page.goto(`/templates/${meta.id}/edit`);
	// A blank template is one page holding one empty text block.
	await expect(page.locator('.canvas-page')).toBeVisible();
	await expect(page.locator('.canvas-block')).toHaveCount(1);
	// Every rail panel starts closed, this one included — see editorStore's note
	// on why open-by-default was tried and backed out.
	await page.getByRole('button', { name: 'Content', exact: true }).click();
	await expect(panel(page)).toBeVisible();
}

function panel(page: Page) {
	return page.locator('.content-panel');
}

/** A palette tile by its exact label — "Text" would otherwise also match "Text field". */
function tile(page: Page, label: string) {
	return panel(page).getByRole('button', { name: label, exact: true });
}

/**
 * dnd-kit's PointerSensor only starts a drag after 8px of movement, and needs a
 * frame or two between steps to read the new position — hence the deliberate
 * pauses. Same shape as the catalog spec's drag, which drags into a block rather
 * than into a gap.
 */
async function dragTileTo(page: Page, source: Locator, target: { x: number; y: number }) {
	const box = await source.boundingBox();
	if (!box) throw new Error('expected the palette tile to have a bounding box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(100);
	// A first small move to cross the activation threshold, so the drag is live
	// before the long travel to the target.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 15, { steps: 5 });
	await page.waitForTimeout(100);
	await page.mouse.move(target.x, target.y, { steps: 20 });
	await page.waitForTimeout(150);
	await page.mouse.up();
	await page.waitForTimeout(150);
}

/** A point inside `locator`, `fraction` of the way down it — 0.2 is the top fifth, which is what "insert before" means. */
async function pointInside(locator: Locator, fraction: number) {
	const box = await locator.boundingBox();
	if (!box) throw new Error('expected the drop target to have a bounding box');
	return { x: box.x + box.width / 2, y: box.y + box.height * fraction };
}

async function addRole(page: Page, name: string) {
	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill(name);
	await page.getByRole('button', { name: 'Close roles panel' }).click();
}

test.describe('Content panel', () => {
	test.afterAll(async ({ request }) => {
		await cleanupFixtureTemplates(request);
	});

	test('offers every insertable block, and closes and reopens from the rail', async ({ page, request }) => {
		await cleanupFixtureTemplates(request);
		await openFixtureTemplate(page, request, 'open');

		for (const label of [
			'Text',
			'Image',
			'Video',
			'Table (2×2)',
			'Pricing table',
			'Quote builder',
			'Table of contents',
			'Page break',
			'Smart content',
			'Columns (2)',
		]) {
			await expect(tile(page, label)).toBeVisible();
		}
		// Text is first: the panel is in the reference product's tile order, not
		// the order the insertable-kinds list happens to be in.
		await expect(panel(page).locator('.palette-tile').first()).toHaveText(/Text/);

		await page.getByRole('button', { name: 'Close content panel' }).click();
		await expect(panel(page)).toHaveCount(0);
		await page.getByRole('button', { name: 'Content', exact: true }).click();
		await expect(panel(page)).toBeVisible();
	});

	test('clicking a tile inserts after the selected block, and persists', async ({ page, request }) => {
		await openFixtureTemplate(page, request, 'click');

		// Nothing selected: appends to the end of the page.
		await tile(page, 'Page break').click();
		await expect(page.locator('.block-page-break')).toHaveCount(1);
		let blocks = page.locator('.canvas-page-blocks > .canvas-block');
		await expect(blocks).toHaveCount(2);
		await expect(blocks.nth(1).locator('.block-page-break')).toHaveCount(1);

		// With the *first* block selected, the next tile lands between the two —
		// §4.1 path 2's "insert after the currently selected block".
		await page.locator('.canvas-block').first().click();
		await tile(page, 'Table of contents').click();
		blocks = page.locator('.canvas-page-blocks > .canvas-block');
		await expect(blocks).toHaveCount(3);
		await expect(blocks.nth(1).locator('.block-toc')).toHaveCount(1);

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.canvas-page-blocks > .canvas-block').nth(1).locator('.block-toc')).toHaveCount(1);
	});

	test('dragging a tile above an existing block inserts it there, not at the end @core', async ({ page, request }) => {
		await openFixtureTemplate(page, request, 'drag');

		const existingBlock = page.locator('.canvas-block').first();
		// The top fifth of the existing block: above its midpoint, so §4.1's
		// insertion indicator — and the drop — resolve to the gap *before* it.
		await dragTileTo(page, tile(page, 'Page break'), await pointInside(existingBlock, 0.2));

		const blocks = page.locator('.canvas-page-blocks > .canvas-block');
		await expect(blocks).toHaveCount(2);
		await expect(blocks.nth(0).locator('.block-page-break')).toHaveCount(1);
		await expect(blocks.nth(1).locator('.ProseMirror')).toHaveCount(1);

		// Dropped blocks are selected on arrival, so the toolbar is the
		// confirmation that the drop landed on the block it says it did.
		await expect(blocks.nth(0)).toHaveClass(/canvas-block-selected/);

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.canvas-page-blocks > .canvas-block').nth(0).locator('.block-page-break')).toHaveCount(1);
	});

	test('dragging a tile below an existing block inserts it after', async ({ page, request }) => {
		await openFixtureTemplate(page, request, 'drag-after');

		const existingBlock = page.locator('.canvas-block').first();
		await dragTileTo(page, tile(page, 'Page break'), await pointInside(existingBlock, 0.85));

		const blocks = page.locator('.canvas-page-blocks > .canvas-block');
		await expect(blocks).toHaveCount(2);
		await expect(blocks.nth(1).locator('.block-page-break')).toHaveCount(1);
	});

	test('a tile can be dropped into an empty column', async ({ page, request }) => {
		await openFixtureTemplate(page, request, 'column');

		// A Columns block seeds each column with a blank text block, so empty the
		// left one first — an empty container is the case with no block to
		// resolve a gap against, which is what `BlockContainerDropRegion` exists for.
		await tile(page, 'Columns (2)').click();
		const leftColumn = page.locator('.block-column').nth(0);
		await expect(leftColumn.locator('.canvas-block')).toHaveCount(1);
		await leftColumn.locator('.canvas-block').click();
		await page.locator('.canvas-block-toolbar').getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(leftColumn.locator('.canvas-block')).toHaveCount(0);

		await dragTileTo(page, tile(page, 'Page break'), await pointInside(leftColumn, 0.4));

		await expect(leftColumn.locator('.block-page-break')).toHaveCount(1);
		await expect(page.locator('.block-column').nth(1).locator('.block-page-break')).toHaveCount(0);
	});

	test('field tiles wait for a role, then carry it onto the block they create', async ({ page, request }) => {
		await openFixtureTemplate(page, request, 'fields');

		// §6.1 rule 1: a field can't exist without a role, so there's nothing
		// honest to offer until one does.
		await expect(page.getByText('every field has to belong to someone')).toBeVisible();
		await expect(tile(page, 'Signature')).toHaveCount(0);

		// Adding a role goes via the Recipients panel, which replaces this one —
		// one panel open at a time, per §3.
		await addRole(page, 'Client');
		await page.getByRole('button', { name: 'Content', exact: true }).click();
		await expect(panel(page).getByLabel('Role that new fields belong to')).toHaveValue(/.+/);

		await tile(page, 'Signature').click();
		const fieldBlock = page.locator('.field-block').first();
		await expect(fieldBlock).toBeVisible();
		await expect(fieldBlock.locator('.field-block-name')).toHaveText('Signature 1');
		await expect(fieldBlock.locator('.field-block-type')).toHaveText('Signature');
	});

	test('the Image tile opens the library instead of a file prompt, and inserts what was picked where it was dropped', async ({ page, request }) => {
		const upload = uniqueImageUpload('content-panel');
		try {
			await openFixtureTemplate(page, request, 'image');

			// Clicking it opens the library picker — the tile itself never prompts
			// for a file. (Uploading is still available *inside* the picker.)
			await tile(page, 'Image').click();
			const picker = page.getByRole('dialog', { name: 'Choose an image' });
			await expect(picker).toBeVisible();
			await picker.getByLabel('Upload images').setInputFiles(upload);
			// The picker highlights the image it just uploaded — the only way to
			// identify *this* test's image in a library the whole suite shares.
			await picker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });
			await expect(picker).toHaveCount(0);

			await expect(page.locator('.block-image')).toHaveCount(1);
			// Placed at the end of the page (nothing was selected), after the
			// template's own blank text block.
			await expect(page.locator('.canvas-page-blocks > .canvas-block').nth(1).locator('.block-image')).toHaveCount(1);
		} finally {
			await cleanupFixtureImages(request);
		}
	});

	test('a dropped Image lands where it was dropped, not at the end', async ({ page, request }) => {
		// The claim worth testing: Image can't produce a block on the spot, so the
		// drop parks its *destination* and the picker finishes it. If that target
		// were dropped on the floor the image would appear at the end of the page
		// and the drag would have been pointless.
		const upload = uniqueImageUpload('content-drop');
		try {
			await openFixtureTemplate(page, request, 'image-drop');

			const existingBlock = page.locator('.canvas-block').first();
			await dragTileTo(page, tile(page, 'Image'), await pointInside(existingBlock, 0.2));

			const picker = page.getByRole('dialog', { name: 'Choose an image' });
			await expect(picker).toBeVisible();
			await picker.getByLabel('Upload images').setInputFiles(upload);
			await picker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });

			const blocks = page.locator('.canvas-page-blocks > .canvas-block');
			await expect(blocks).toHaveCount(2);
			await expect(blocks.nth(0).locator('.block-image')).toHaveCount(1);
		} finally {
			await cleanupFixtureImages(request);
		}
	});

	test('the Video tile asks for a URL and inserts the resolved embed', async ({ page, request }) => {
		await openFixtureTemplate(page, request, 'video');

		await tile(page, 'Video').click();
		// Same shape as Image: a placement waiting on input, finished in the panel.
		await panel(page).getByLabel('Video URL').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
		await panel(page).getByRole('button', { name: 'Add video' }).click();

		await expect(page.locator('.block-video-thumbnail img')).toHaveAttribute(
			'src',
			'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg'
		);
		// The form clears itself once the block exists, so the panel isn't left
		// looking like it's still waiting.
		await expect(panel(page).getByLabel('Video URL')).toHaveCount(0);
	});
});

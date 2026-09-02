import { test, expect } from '@playwright/test';
import { insertImageFromLibrary } from './imageLibrary';
import { openNewTemplate, saveNow } from './templateFixture';

// Real backend, no mocking. Home for phase 2's per-block-type coverage as
// the block catalog (§15 phase 2) grows — one describe per block type.
test.describe('Page break block', () => {
	test('inserts, selects, duplicates, deletes, and persists through the generic block commands', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Page break' }).click();

		const pageBreaks = page.locator('.block-page-break');
		await expect(pageBreaks).toHaveCount(1);
		await expect(pageBreaks.first()).toHaveText('Page break');

		// It's a real block, not a stub — the generic block commands (built
		// for any Block, never page-break-specific) should just work.
		const pageBreakBlockWrapper = page.locator('.canvas-block').filter({ has: page.locator('.block-page-break') });
		await pageBreakBlockWrapper.click();
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await expect(pageBreaks).toHaveCount(2);

		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(pageBreaks).toHaveCount(1);

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.block-page-break')).toHaveCount(1);
	});
});

test.describe('Spacer block', () => {
	test('inserts from the Content panel as empty space, resizes by number and by drag, and survives a reload', async ({ page }) => {
		await openNewTemplate(page);

		// Inserted from the right-hand palette rather than "+ Add block": that's
		// where it was asked for, and palette membership is otherwise only covered
		// by the unit test that asserts the two lists cover each other.
		await page.getByRole('button', { name: 'Content', exact: true }).click();
		await page.locator('.content-panel').getByRole('button', { name: 'Spacer', exact: true }).click();

		const spacer = page.locator('.block-spacer');
		await expect(spacer).toHaveCount(1);
		// One comfortable blank line to begin with — a size that doesn't have to be
		// undone before it's useful.
		await expect(spacer).toHaveCSS('height', '24px');

		// Typing an exact height, for when the gap has to match something.
		await page.locator('.canvas-block').filter({ has: page.locator('.block-spacer') }).click();
		await page.getByLabel('Spacer height').fill('120');
		await expect(spacer).toHaveCSS('height', '120px');

		// Dragging the bottom edge, for when it's a judgement about how the page
		// looks. The whole gesture is one undo step, not one per pixel — which is
		// what the single Undo below restoring 120 (rather than 179) proves.
		const handle = page.getByRole('button', { name: 'Resize spacer' });
		const box = (await handle.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 6 });
		await page.mouse.up();
		await expect(spacer).toHaveCSS('height', '180px');

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(spacer).toHaveCSS('height', '120px');

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.block-spacer')).toHaveCSS('height', '120px');
	});
});

test.describe('Columns block', () => {
	test('nested blocks are independently editable/selectable/reorderable per column, and it all persists', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Columns (2)' }).click();

		const columns = page.locator('.block-column');
		await expect(columns).toHaveCount(2);

		// Each column starts with one blank text block, seeded by createColumnsBlock.
		await expect(columns.nth(0).locator('.ProseMirror')).toHaveCount(1);
		await expect(columns.nth(1).locator('.ProseMirror')).toHaveCount(1);

		await columns.nth(0).locator('.ProseMirror').click();
		await page.keyboard.type('Left column');
		await columns.nth(1).locator('.ProseMirror').click();
		await page.keyboard.type('Right column');
		await expect(columns.nth(0).locator('.ProseMirror')).toContainText('Left column');
		await expect(columns.nth(1).locator('.ProseMirror')).toContainText('Right column');

		// Insert a second, different block type into column 0 only — via that
		// column's own "+ Add block" menu, not the page-level one.
		await columns.nth(0).getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Page break' }).click();
		await expect(columns.nth(0).locator('.block-page-break')).toHaveCount(1);
		await expect(columns.nth(1).locator('.block-page-break')).toHaveCount(0);

		// The generic block commands (select/duplicate/delete) work on a block
		// nested in a column exactly as they do on a top-level block.
		const pageBreakInColumn0 = columns.nth(0).locator('.canvas-block').filter({ has: page.locator('.block-page-break') });
		await pageBreakInColumn0.click();
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await expect(columns.nth(0).locator('.block-page-break')).toHaveCount(2);
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(columns.nth(0).locator('.block-page-break')).toHaveCount(1);

		await saveNow(page);
		await page.reload();

		const columnsAfterReload = page.locator('.block-column');
		await expect(columnsAfterReload).toHaveCount(2);
		await expect(columnsAfterReload.nth(0).locator('.ProseMirror')).toContainText('Left column');
		await expect(columnsAfterReload.nth(1).locator('.ProseMirror')).toContainText('Right column');
		await expect(columnsAfterReload.nth(0).locator('.block-page-break')).toHaveCount(1);
		await expect(columnsAfterReload.nth(1).locator('.block-page-break')).toHaveCount(0);
	});

	test('reorders blocks within a single column via drag, without touching the other column', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Columns (2)' }).click();

		const columns = page.locator('.block-column');
		await columns.nth(0).locator('.ProseMirror').click();
		await page.keyboard.type('First');

		// Add a second text block to column 0 so there's something to reorder.
		await columns.nth(0).getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text' }).click();
		const column0Editors = columns.nth(0).locator('.ProseMirror');
		await expect(column0Editors).toHaveCount(2);
		await column0Editors.nth(1).click();
		await page.keyboard.type('Second');

		await columns.nth(0).locator('.canvas-block').nth(1).click();
		const handle = page.getByRole('button', { name: 'Drag to reorder' });
		const handleBox = await handle.boundingBox();
		const draggedBox = await columns.nth(0).locator('.canvas-block').nth(1).boundingBox();
		const targetBox = await columns.nth(0).locator('.canvas-block').nth(0).boundingBox();
		if (!handleBox || !draggedBox || !targetBox) throw new Error('expected both blocks to have a bounding box');

		// Drag straight up by the distance between the two blocks' midpoints,
		// keeping X fixed. Both halves are load-bearing and were learned the hard
		// way when the Montserrat font swap made this fail:
		// - The vertical distance is computed from the rects, not hardcoded — the
		//   drop index comes from where the *dragged block's* translated rect ends
		//   up, so "15px up then 5px into the target" quietly stopped reaching far
		//   enough when chrome metrics shifted.
		// - X stays put because the handle floats in the block toolbar, which
		//   overflows *left* of a narrow column (`.canvas-block-toolbar`'s own
		//   comment) — so ending on the target's center-X drags the block's rect
		//   sideways by (block center − handle center) ≈ 150px, far enough into
		//   the *neighbouring column* that rectIntersection resolves `over` to
		//   that column's block and the cross-column drop is (correctly) refused.
		const midpointGap = draggedBox.y + draggedBox.height / 2 - (targetBox.y + targetBox.height / 2);
		const startX = handleBox.x + handleBox.width / 2;
		const startY = handleBox.y + handleBox.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.waitForTimeout(100);
		await page.mouse.move(startX, startY - 15, { steps: 10 });
		await page.waitForTimeout(100);
		await page.mouse.move(startX, startY - midpointGap - 8, { steps: 20 });
		await page.waitForTimeout(100);
		await page.mouse.up();
		await page.waitForTimeout(150);

		await expect(column0Editors.nth(0)).toContainText('Second');
		await expect(column0Editors.nth(1)).toContainText('First');
		// Column 1's own untouched blank text block is unaffected.
		await expect(columns.nth(1).locator('.ProseMirror')).toHaveCount(1);
	});
});

test.describe('Table block', () => {
	test('cells are independently editable, row/column add-remove work, header-row toggles, and it all persists', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Table (2×2)' }).click();

		const cells = page.locator('.block-table-cell');
		await expect(cells).toHaveCount(4);
		await expect(page.locator('.block-table-header-row')).toHaveCount(1);

		// Cell content is independent per cell.
		await cells.nth(0).click();
		await page.keyboard.type('A1');
		await cells.nth(3).click();
		await page.keyboard.type('D2');
		await expect(cells.nth(0)).toContainText('A1');
		await expect(cells.nth(3)).toContainText('D2');
		await expect(cells.nth(1)).toHaveText('');

		// Clicking into a cell also selected the table block itself (the click
		// bubbles up to its SortableBlock) — its row/column controls now show.
		await page.getByRole('button', { name: '+ Row' }).click();
		await expect(page.locator('.block-table tbody tr')).toHaveCount(3);
		await expect(cells).toHaveCount(6);

		await page.getByRole('button', { name: '+ Column' }).click();
		await expect(cells).toHaveCount(9);

		await page.getByRole('button', { name: '− Column' }).click();
		await expect(cells).toHaveCount(6);
		await page.getByRole('button', { name: '− Row' }).click();
		await expect(cells).toHaveCount(4);

		// addRow/addColumn/removeRow/removeColumn above only ever acted on the
		// LAST row/column, so cell (0,0)'s content was never touched.
		await expect(cells.nth(0)).toContainText('A1');

		await page.getByLabel('Header row').uncheck();
		await expect(page.locator('.block-table-header-row')).toHaveCount(0);

		await saveNow(page);
		await page.reload();

		await expect(page.locator('.block-table-cell')).toHaveCount(4);
		await expect(page.locator('.block-table-cell').first()).toContainText('A1');
		await expect(page.locator('.block-table-header-row')).toHaveCount(0);
	});

});

test.describe('Image block', () => {
	test('is chosen from the image library, then resizes, toggles circle shape, edits alt text, and persists', async ({ page }) => {
		await openNewTemplate(page);

		// "Image" opens the library picker rather than a file prompt (2026-08-22) —
		// this uploads through the picker and then picks what it uploaded.
		await insertImageFromLibrary(page);

		const image = page.locator('.block-image');
		await expect(image).toBeVisible();

		// Selecting it (clicking its content, same as any other block) reveals
		// the resize handle / alt-text / shape controls.
		await page.locator('.block-image-wrapper').click();
		const altInput = page.getByPlaceholder('Alt text (required)');
		await altInput.fill('A test logo');
		await expect(altInput).toHaveValue('A test logo');

		await page.getByLabel('Circle').check();
		await expect(image).toHaveClass(/block-image-circle/);

		const handle = page.getByRole('button', { name: 'Resize image' });
		const before = await image.boundingBox();
		if (!before) throw new Error('expected the image to have a bounding box');
		await handle.hover();
		await page.mouse.down();
		await page.mouse.move(before.x + before.width + 60, before.y + before.height, { steps: 10 });
		await page.mouse.up();

		const after = await image.boundingBox();
		if (!after) throw new Error('expected the image to have a bounding box after resizing');
		expect(after.width).toBeGreaterThan(before.width);

		await saveNow(page);
		await page.reload();

		const imageAfterReload = page.locator('.block-image');
		await expect(imageAfterReload).toHaveCount(1);
		await expect(imageAfterReload).toHaveClass(/block-image-circle/);
		await expect(imageAfterReload).toHaveAttribute('alt', 'A test logo');
	});

	test('rejects a file whose bytes are not actually a recognized image, regardless of its declared type', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Image' }).click();
		const picker = page.getByRole('dialog', { name: 'Choose an image' });

		// Declared `image/png` with a plausible name, so the client-side check in
		// `imageLibrary.ts` waves it through — this is specifically the *server*
		// sniffing real bytes (routes/assets.js), which is the layer that matters.
		await picker.getByLabel('Upload images').setInputFiles({
			name: 'not-an-image.png',
			mimeType: 'image/png',
			buffer: Buffer.from('this is not actually a png'),
		});

		// The server's own message, in the per-file upload row.
		await expect(picker.locator('.image-upload-failed')).toContainText(/not a recognized/i);
		// Nothing lands in the library, and nothing is inserted.
		await expect(picker.locator('.image-tile-highlight')).toHaveCount(0);
		await picker.getByRole('button', { name: 'Close image picker' }).click();
		await expect(page.locator('.block-image')).toHaveCount(0);
	});
});

// Real oEmbed calls to youtube.com/vimeo.com — no mocking, matching this
// suite's convention, but a real dependency on those services and this
// environment's outbound network access being available. The two videos
// below were picked for permanence: the first YouTube video ever uploaded,
// and Blender's Creative-Commons-licensed Big Buck Bunny on Vimeo.
test.describe('Video block', () => {
	test('resolves a pasted YouTube URL via oEmbed, click-to-plays, toggles autoplay, and persists', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByPlaceholder('Paste a YouTube or Vimeo URL').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
		// Scoped to the add-block menu: §3 ④'s Content panel has a "Video" tile of
		// its own, so the bare name is ambiguous now.
		await page.locator('.canvas-add-block-options').getByRole('button', { name: 'Video', exact: true }).click();

		const thumbnail = page.locator('.block-video-thumbnail img');
		await expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg');

		// Clicking the thumbnail both selects the block (its controls appear,
		// same "content click also selects" convention as every other block
		// type) and starts playback — a single action, matching how clicking a
		// text block both selects it and places a cursor.
		await page.locator('.block-video-thumbnail').click();
		await expect(page.locator('.block-video-embed')).toHaveAttribute('src', 'https://www.youtube.com/embed/jNQXAC9IVRw');

		// The controls (including Autoplay) stay visible under the now-playing
		// embed as long as the block is selected — toggling it updates the
		// already-live iframe's src in place.
		await page.getByLabel('Autoplay').check();
		await expect(page.locator('.block-video-embed')).toHaveAttribute('src', 'https://www.youtube.com/embed/jNQXAC9IVRw?autoplay=1');

		await saveNow(page);
		await page.reload();

		// Reloading resets the click-to-play state (never persisted) back to
		// the static thumbnail.
		await expect(page.locator('.block-video-thumbnail img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg');
	});

});

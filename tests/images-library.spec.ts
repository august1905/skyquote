import { test, expect, type Page } from '@playwright/test';
import { BACKEND, IMAGE_FIXTURE_PREFIX, cleanupFixtureImages, uniqueImageUpload } from './imageLibrary';
import { openNewTemplate, saveNow } from './templateFixture';

// The Images library (sidebar → Images) and the picker the editor's Image block
// opens. Real backend, real uploads to Stratus, no mocking.
//
// Every assertion is scoped by a **unique uploaded filename** rather than by
// position in the grid. This backend is shared and the rest of the suite uploads
// `test-image.png` on every image test, so "the first tile" means nothing here —
// see `uniqueImageUpload`.

/**
 * Every fixture image the current test uploaded, so `afterEach` can delete
 * exactly those.
 *
 * Deleting by name rather than sweeping the whole `zz-img-` prefix is what keeps
 * this spec from reaching into the other worker: with `workers: 2` another spec's
 * test is usually mid-flight here, and a blanket sweep took its images out from
 * under it — see `cleanupFixtureImages`.
 */
const uploadedThisTest: string[] = [];

/** Uploads through the page's drop zone and returns the name it was given. */
async function uploadOnPage(page: Page, label: string): Promise<string> {
	const file = trackUpload(uniqueImageUpload(label));
	await page.getByLabel('Upload images').setInputFiles(file);
	return file.name;
}

function trackUpload<T extends { name: string }>(file: T): T {
	uploadedThisTest.push(file.name);
	return file;
}

function tile(page: Page, filename: string) {
	return page.locator('.image-tile').filter({ has: page.getByTitle(filename, { exact: true }) });
}

test.describe('Images library', () => {
	// Untargeted on the way in — that sweep only removes fixture images old enough
	// that no running test could still hold one, which is what makes a run
	// independent of how the last one ended. On the way out it deletes exactly what
	// this test uploaded.
	//
	// **Per test, and it has to stay that way — tried moving it to `beforeAll` on
	// 2026-09-01 and it broke.** Two properties of this file combine to require it,
	// and neither is obvious: the rename test renames its upload to the *fixed* name
	// `zz-img-renamed.png`, which `afterEach` never removes because that hook deletes
	// only the names recorded at upload time; and the untargeted sweep is
	// age-guarded, so a copy left by a run minutes earlier is too young for it to
	// take. Sweeping once per file therefore left the previous run's
	// `zz-img-renamed.png` in place and the rename assertion matched two tiles
	// ("strict mode violation … resolved to 2 elements"). Per-test sweeps kept
	// running until that leftover aged out.
	//
	// Contrast `templates-list.spec.ts`, where the same change *is* safe: its
	// `afterEach` is a blanket prefix sweep with no age guard, so it genuinely leaves
	// nothing behind. The saving here was 0.6s, which buys nothing worth this.
	test.beforeEach(async ({ request }) => {
		await cleanupFixtureImages(request);
	});

	test.afterEach(async ({ request }) => {
		await cleanupFixtureImages(request, uploadedThisTest.splice(0));
	});

	test('is reachable from the sidebar, and an uploaded image appears with its real dimensions @core', async ({ page }) => {
		await page.goto('/home');
		await page.getByRole('link', { name: 'Images' }).click();
		await page.waitForURL(/\/images$/);

		const filename = await uploadOnPage(page, 'upload');

		// Confirmed per file rather than only by the grid quietly growing.
		await expect(page.locator('.image-uploads')).toContainText('1 uploaded');

		const uploaded = tile(page, filename);
		await expect(uploaded).toBeVisible();
		// The backend reads dimensions from the actual bytes before inserting the
		// row; a blank cell here would mean that silently didn't happen.
		await expect(uploaded).toContainText('1×1');

		// It's a real asset served by the backend, not a local object URL.
		await expect(uploaded.locator('img')).toHaveAttribute('src', /\/assets\/\d+\/file$/);

		// And it survives a reload, so it's in the library rather than in this page's state.
		await page.reload();
		await expect(tile(page, filename)).toBeVisible();
	});

	test('rejects a non-image before uploading it, naming the file', async ({ page }) => {
		await page.goto('/images');
		// Client-side check, so an obviously-wrong file fails instantly instead of
		// after a multi-megabyte round trip. The server still sniffs real bytes.
		await page
			.getByLabel('Upload images')
			.setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not an image') });

		await expect(page.locator('.image-uploads')).toContainText("contract.pdf isn't a PNG, JPEG, GIF or WEBP");
		// Scoped to *this* file, not the whole grid: the library is shared and a
		// parallel worker may well be uploading its own image right now. The note at
		// the top of this file says exactly that, and asserting an empty grid here
		// broke it.
		await expect(tile(page, 'contract.pdf')).toHaveCount(0);
	});

	test('search filters by filename, and says so when nothing matches', async ({ page }) => {
		await page.goto('/images');
		const filename = await uploadOnPage(page, 'searchable');
		await expect(tile(page, filename)).toBeVisible();

		await page.getByLabel('Search images').fill(filename);
		await expect(page.locator('.image-tile')).toHaveCount(1);

		await page.getByLabel('Search images').fill('zz-img-definitely-not-here');
		await expect(page.getByText('Nothing matches')).toBeVisible();
		await expect(page.locator('.image-tile')).toHaveCount(0);
	});

	test('renames in place and persists, and Escape abandons the rename', async ({ page }) => {
		await page.goto('/images');
		const filename = await uploadOnPage(page, 'rename');
		await expect(tile(page, filename)).toBeVisible();

		// Escape first: the input commits on blur, so cancelling has to beat the
		// blur it causes, or "never mind" would save a half-typed name.
		await tile(page, filename).getByRole('button', { name: `Rename ${filename}` }).click();
		await page.getByLabel(`Rename ${filename}`).fill('zz-img-typed-by-mistake.png');
		await page.getByLabel(`Rename ${filename}`).press('Escape');
		await expect(tile(page, filename)).toBeVisible();

		/**
		 * Unique, and registered for cleanup — both halves matter.
		 *
		 * This was the fixed name `zz-img-renamed.png`, which **`afterEach` could never
		 * delete**: that hook removes the names recorded at *upload* time, and by then
		 * this asset is called something else. So every run leaked one, and the test
		 * only passed because the untargeted sweep collected the previous run's copy
		 * once it aged past `POSSIBLY_IN_USE_MS` (5 minutes). Run the suite twice
		 * inside that window — which is normal while working on it — and the rename
		 * assertion matched two tiles and failed on a strict-mode violation.
		 */
		const renamed = `${IMAGE_FIXTURE_PREFIX}renamed-${Date.now()}.png`;
		uploadedThisTest.push(renamed);
		await tile(page, filename).getByRole('button', { name: `Rename ${filename}` }).click();
		await page.getByLabel(`Rename ${filename}`).fill(renamed);
		await page.getByLabel(`Rename ${filename}`).press('Enter');
		await expect(tile(page, renamed)).toBeVisible();

		await page.reload();
		await expect(tile(page, renamed)).toBeVisible();
	});

	test('Delete confirms, warns that usage cannot be checked, and then really deletes', async ({ page, request }) => {
		await page.goto('/images');
		const filename = await uploadOnPage(page, 'delete');
		const target = tile(page, filename);
		await expect(target).toBeVisible();
		const src = await target.locator('img').getAttribute('src');

		await target.getByRole('button', { name: `Delete ${filename}` }).click();
		// The warning is the honest part: an ImageBlock holds an assetId inside a
		// template's Stratus body and there's no reverse index to consult.
		await expect(page.getByText(/Any template already using it will show a broken image/)).toBeVisible();
		await target.getByRole('button', { name: 'Keep it' }).click();
		await expect(target).toBeVisible();

		await target.getByRole('button', { name: `Delete ${filename}` }).click();
		await target.getByRole('button', { name: 'Yes, delete' }).click();
		await expect(tile(page, filename)).toHaveCount(0);

		// The stored object went too, not just the row.
		const fileResponse = await request.get(`${BACKEND}${src!.replace(/^.*\/server\/skyquote_function/, '')}`);
		expect(fileResponse.status()).toBe(404);
	});
});

test.describe('Image block picker (§4.1)', () => {
	// Untargeted on the way in — that sweep only removes fixture images old enough
	// that no running test could still hold one, which is what makes a run
	// independent of how the last one ended. On the way out it deletes exactly what
	// this test uploaded.
	//
	// **Per test, and it has to stay that way — tried moving it to `beforeAll` on
	// 2026-09-01 and it broke.** Two properties of this file combine to require it,
	// and neither is obvious: the rename test renames its upload to the *fixed* name
	// `zz-img-renamed.png`, which `afterEach` never removes because that hook deletes
	// only the names recorded at upload time; and the untargeted sweep is
	// age-guarded, so a copy left by a run minutes earlier is too young for it to
	// take. Sweeping once per file therefore left the previous run's
	// `zz-img-renamed.png` in place and the rename assertion matched two tiles
	// ("strict mode violation … resolved to 2 elements"). Per-test sweeps kept
	// running until that leftover aged out.
	//
	// Contrast `templates-list.spec.ts`, where the same change *is* safe: its
	// `afterEach` is a blanket prefix sweep with no age guard, so it genuinely leaves
	// nothing behind. The saving here was 0.6s, which buys nothing worth this.
	test.beforeEach(async ({ request }) => {
		await cleanupFixtureImages(request);
	});

	test.afterEach(async ({ request }) => {
		await cleanupFixtureImages(request, uploadedThisTest.splice(0));
	});

	test('"Image" opens the library instead of a file prompt, and a library image can be reused across templates', async ({ page }) => {
		// Put one image in the library up front, from the Images page.
		await page.goto('/images');
		const filename = await uploadOnPage(page, 'reused');
		await expect(tile(page, filename)).toBeVisible();

		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Image' }).click();

		// This is the change: a picker, not an upload prompt.
		const picker = page.getByRole('dialog', { name: 'Choose an image' });
		await expect(picker).toBeVisible();
		await expect(page.locator('input[type="file"][aria-label="Upload images"]')).toHaveCount(1);

		// Search inside the picker, then insert — no second upload of an image the
		// library already has, which was the whole problem with the old flow.
		await picker.getByLabel('Search images').fill(filename);
		await expect(picker.locator('.image-tile')).toHaveCount(1);
		await picker.locator('.image-tile-select').click();

		await expect(picker).toHaveCount(0);
		// `.block-image` is the <img> itself, not a wrapper around one.
		const image = page.locator('.block-image');
		await expect(image).toBeVisible();
		await expect(image).toHaveAttribute('src', /\/assets\/\d+\/file$/);

		// Persisted, and the library still holds exactly one copy — inserting reuses
		// the asset rather than uploading a duplicate.
		await saveNow(page);
		await page.goto('/images');
		await page.getByLabel('Search images').fill(filename);
		await expect(page.locator('.image-tile')).toHaveCount(1);
	});

	test('Escape closes the picker without inserting anything', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Image' }).click();
		await expect(page.getByRole('dialog', { name: 'Choose an image' })).toBeVisible();

		// §13: Escape is the way out of any transient surface.
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Choose an image' })).toHaveCount(0);
		await expect(page.locator('.block-image')).toHaveCount(0);
	});

	test('an image uploaded from inside the picker is highlighted, and inserting it is still a deliberate click', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Image' }).click();
		const picker = page.getByRole('dialog', { name: 'Choose an image' });

		const file = trackUpload(uniqueImageUpload('from-picker'));
		await picker.getByLabel('Upload images').setInputFiles(file);

		// Highlighted so it's findable in a library of a hundred — but *not*
		// auto-inserted: a multi-file drop has no obvious winner, so the pick stays
		// an explicit click.
		const highlighted = picker.locator('.image-tile-highlight');
		await expect(highlighted).toBeVisible();
		await expect(highlighted).toContainText(file.name);
		await expect(page.locator('.block-image')).toHaveCount(0);

		await highlighted.locator('.image-tile-select').click();
		await expect(page.locator('.block-image')).toBeVisible();
	});
});

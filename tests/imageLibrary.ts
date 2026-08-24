import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEST_IMAGE_PATH = path.join(__dirname, 'fixtures', 'test-image.png');
export const BACKEND = `http://localhost:${process.env.CATALYST_SERVE_PORT || '3000'}/server/skyquote_function`;

/**
 * Every image this suite uploads under its own name carries this prefix, and the
 * Images spec sweeps it before and after each test — same reasoning as the other
 * fixture-sweeping specs: a run that times out never reaches its cleanup, so
 * cleaning up front is what makes a run independent of how the last one ended.
 */
export const IMAGE_FIXTURE_PREFIX = 'zz-img-';

/**
 * A unique filename for an upload, so a test can find *its* image in a library
 * that also holds every other spec's `test-image.png`.
 *
 * Uses `setInputFiles`'s buffer form rather than writing a temp file: the bytes
 * are the same fixture, only the name differs, and inventing a name is exactly
 * what that overload is for.
 */
export function uniqueImageUpload(label: string): { name: string; mimeType: string; buffer: Buffer } {
	return {
		name: `${IMAGE_FIXTURE_PREFIX}${label}-${Date.now()}.png`,
		mimeType: 'image/png',
		buffer: fs.readFileSync(TEST_IMAGE_PATH),
	};
}

/**
 * Inserts an image block the way a user now does: "+ Add block" → Image opens the
 * library picker, and a tile is chosen from it.
 *
 * Uploads through the picker's own drop zone and then clicks the freshly-uploaded
 * tile, which the picker highlights. That's deliberately not "pick the first
 * tile": this backend is shared, the library accumulates, and the highlight is the
 * only thing that identifies *this* test's image.
 */
export async function insertImageFromLibrary(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer } = TEST_IMAGE_PATH) {
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Image' }).click();

	const picker = page.getByRole('dialog', { name: 'Choose an image' });
	await expect(picker).toBeVisible();
	await picker.getByLabel('Upload images').setInputFiles(file);

	// Highlighted the moment its upload finishes; clicking it inserts and closes.
	await picker.locator('.image-tile-highlight .image-tile-select').click();
	await expect(picker).toHaveCount(0);
}

interface AssetRow {
	id: string;
	filename: string;
	createdAt: string;
}

/**
 * How recently a fixture image must have been uploaded for the untargeted sweep
 * to leave it alone.
 *
 * The suite runs two workers, so another spec's test is very likely in flight
 * while this one cleans up. Every test finishes with its own images inside a
 * minute; anything older than this belongs to a run that already ended, which is
 * exactly what the untargeted sweep is for.
 */
const POSSIBLY_IN_USE_MS = 5 * 60 * 1000;

/**
 * Deletes `zz-img-` fixture images. Swallows its own errors — cleanup must never
 * replace a test's real failure with "context has been closed".
 *
 * **Pass the uploads the test made.** Then only those are deleted, and the call
 * cannot touch another worker's images. Without them this falls back to sweeping
 * fixture images old enough that no running test could still hold one.
 *
 * It used to delete *every* `zz-img-` image unconditionally, which meant one
 * spec's cleanup could delete the image another spec's test was in the middle of
 * using. That was invisible for as long as no test ever fetched an image it had
 * placed — the CSS `url(...)` stays in the style attribute whether or not the
 * asset behind it still exists — and it surfaced the moment
 * `expectBackgroundImageLoads` started fetching: a page background 404ing after
 * a reload, passing whenever the spec ran alone.
 */
export async function cleanupFixtureImages(request: APIRequestContext, uploads?: Array<{ name: string } | string>) {
	const ownNames = uploads && new Set(uploads.map((upload) => (typeof upload === 'string' ? upload : upload.name)));
	try {
		const response = await request.get(`${BACKEND}/assets?kind=image`);
		if (!response.ok()) return;
		const { assets } = (await response.json()) as { assets: AssetRow[] };
		for (const asset of assets) {
			if (!asset.filename.includes(IMAGE_FIXTURE_PREFIX)) continue;
			const safeToDelete = ownNames ? ownNames.has(asset.filename) : Date.now() - Date.parse(asset.createdAt) > POSSIBLY_IN_USE_MS;
			if (safeToDelete) await request.delete(`${BACKEND}/assets/${asset.id}`);
		}
	} catch {
		// See above.
	}
}

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
}

/** Deletes every `zz-img-` fixture image. Swallows its own errors — cleanup must never replace a test's real failure with "context has been closed". */
export async function cleanupFixtureImages(request: APIRequestContext) {
	try {
		const response = await request.get(`${BACKEND}/assets?kind=image`);
		if (!response.ok()) return;
		const { assets } = (await response.json()) as { assets: AssetRow[] };
		for (const asset of assets) {
			if (asset.filename.includes(IMAGE_FIXTURE_PREFIX)) await request.delete(`${BACKEND}/assets/${asset.id}`);
		}
	} catch {
		// See above.
	}
}

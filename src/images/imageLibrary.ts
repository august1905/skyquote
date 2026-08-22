import type { UploadedAsset } from '../api/assets';

/**
 * The image library's pure rules — what counts as an acceptable image, and how a
 * search box filters the grid. No React, no fetching, so the awkward cases (a
 * file the browser reports no MIME type for, a name that differs only by case)
 * are testable without a browser.
 */

/**
 * The four formats `POST /assets` accepts. Kept in step with `sniffImageFormat`
 * in `routes/assets.js` deliberately, and checked client-side **as well as**
 * server-side: the server is the authority (it sniffs actual bytes, never the
 * declared type), but a 5MB upload that comes back rejected is a slow way to
 * learn something we could say instantly.
 */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** For a file input's `accept` attribute. */
export const IMAGE_FILE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(',');

/** Matches `MAX_IMAGE_BYTES` in `routes/assets.js`. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
};

/**
 * Why this file can't be uploaded, or `null` if it can.
 *
 * Falls back to the extension when the browser reports no `type` at all, which
 * genuinely happens — a drag from some file managers, and some Linux/Windows
 * setups with no MIME database for `.webp`. Rejecting those would refuse a
 * perfectly good PNG over a missing OS registry entry, and the server sniffs the
 * real bytes anyway.
 */
export function imageFileRejectionReason(file: { name: string; type: string; size: number }): string | null {
	const declared = file.type.toLowerCase();
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	const effective = declared || EXTENSION_TYPES[extension] || '';

	if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(effective)) {
		return `${file.name} isn't a PNG, JPEG, GIF or WEBP`;
	}
	if (file.size === 0) {
		return `${file.name} is empty`;
	}
	if (file.size > MAX_IMAGE_BYTES) {
		return `${file.name} is over the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB limit`;
	}
	return null;
}

/** Case-insensitive substring match on the filename. A blank query matches everything, so callers needn't special-case it. */
export function filterImages(assets: UploadedAsset[], query: string): UploadedAsset[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return assets;
	return assets.filter((asset) => asset.filename.toLocaleLowerCase().includes(needle));
}

/**
 * Page content is 816px wide minus 48px padding each side (canvas.css), so an
 * image inserted at its full natural size could badly overflow it. Scales **down
 * only** — a 40px logo shouldn't be blown up to 320.
 */
export const MAX_INSERTED_IMAGE_WIDTH = 320;

export function scaleToFit(width: number, height: number, maxWidth = MAX_INSERTED_IMAGE_WIDTH): { width: number; height: number } {
	if (width <= maxWidth) return { width, height };
	const scale = maxWidth / width;
	return { width: maxWidth, height: Math.round(height * scale) };
}

/**
 * Adds a just-uploaded asset to the front of the list, **idempotently**.
 *
 * The dedupe is load-bearing, not defensive. The library refetches on mount, and
 * React's StrictMode runs that effect twice, so two list requests are in flight
 * at once in development. If one of them resolves *after* the upload's POST has
 * landed server-side, its response already contains the new asset — and a blind
 * prepend on top of that list shows the same image twice. Caught by the e2e as a
 * strict-mode violation: two tiles, one server row.
 */
export function prependAsset(assets: UploadedAsset[], asset: UploadedAsset): UploadedAsset[] {
	return assets.some((existing) => existing.id === asset.id) ? assets : [asset, ...assets];
}

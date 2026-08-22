import { describe, expect, it } from 'vitest';
import { formatFileSize, type UploadedAsset } from '../api/assets';
import { MAX_IMAGE_BYTES, filterImages, imageFileRejectionReason, prependAsset, scaleToFit } from './imageLibrary';

function asset(id: string, filename: string): UploadedAsset {
	return {
		id,
		filename,
		contentType: 'image/png',
		sizeBytes: 1024,
		width: 100,
		height: 50,
		createdAt: '2026-08-22T00:00:00Z',
		createdBy: '1',
	};
}

describe('imageFileRejectionReason', () => {
	it('accepts each of the four formats the backend sniffs for', () => {
		for (const [name, type] of [
			['logo.png', 'image/png'],
			['photo.jpg', 'image/jpeg'],
			['loop.gif', 'image/gif'],
			['hero.webp', 'image/webp'],
		]) {
			expect(imageFileRejectionReason({ name: name!, type: type!, size: 1000 })).toBeNull();
		}
	});

	it('falls back to the extension when the browser reports no type at all', () => {
		// Real case, not defensive: a drag from some file managers, and some OS
		// setups with no MIME entry for .webp. Refusing a good PNG over a missing
		// registry entry would be worse, and the server sniffs the real bytes.
		expect(imageFileRejectionReason({ name: 'logo.PNG', type: '', size: 1000 })).toBeNull();
	});

	it('rejects a non-image by name in its message, so a multi-file drop says which one', () => {
		expect(imageFileRejectionReason({ name: 'contract.pdf', type: 'application/pdf', size: 1000 })).toBe(
			"contract.pdf isn't a PNG, JPEG, GIF or WEBP",
		);
	});

	it('rejects an empty file', () => {
		expect(imageFileRejectionReason({ name: 'blank.png', type: 'image/png', size: 0 })).toBe('blank.png is empty');
	});

	it('rejects one over the size limit, quoting the limit', () => {
		expect(imageFileRejectionReason({ name: 'huge.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe(
			'huge.png is over the 5MB limit',
		);
	});

	it('accepts a file exactly at the limit', () => {
		expect(imageFileRejectionReason({ name: 'edge.png', type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
	});
});

describe('filterImages', () => {
	const assets = [asset('1', 'Skyline-logo.png'), asset('2', 'roof-photo.jpg'), asset('3', 'LOGO-alt.webp')];

	it('ignores case and surrounding whitespace', () => {
		expect(filterImages(assets, '  LOGO ').map((a) => a.id)).toEqual(['1', '3']);
	});

	it('returns everything for a blank query', () => {
		expect(filterImages(assets, '   ')).toHaveLength(3);
	});

	it('returns nothing when nothing matches, rather than falling back to everything', () => {
		expect(filterImages(assets, 'gutter')).toEqual([]);
	});
});

describe('scaleToFit', () => {
	it('scales an oversized image down and keeps its aspect ratio', () => {
		expect(scaleToFit(1600, 800)).toEqual({ width: 320, height: 160 });
	});

	it('leaves a small image alone rather than blowing it up', () => {
		// A 40px logo stretched to 320 would look broken; only shrinking is safe.
		expect(scaleToFit(40, 40)).toEqual({ width: 40, height: 40 });
	});

	it('rounds the scaled height to a whole pixel', () => {
		expect(scaleToFit(1000, 333)).toEqual({ width: 320, height: 107 });
	});
});

describe('formatFileSize', () => {
	it('uses bytes below 1KB', () => {
		expect(formatFileSize(512)).toBe('512 B');
	});

	it('uses whole KB in the middle range', () => {
		expect(formatFileSize(2048)).toBe('2 KB');
	});

	it('uses one decimal of MB above a megabyte', () => {
		expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
	});
});

describe('prependAsset', () => {
	const existing = [asset('1', 'old.png')];

	it('puts a new upload at the front — the grid is newest-first', () => {
		expect(prependAsset(existing, asset('2', 'new.png')).map((a) => a.id)).toEqual(['2', '1']);
	});

	it('is a no-op when the asset is already there', () => {
		// The real race, not a hypothetical: the library refetches on mount and
		// StrictMode runs that effect twice, so a list response can land *after* the
		// upload's POST and already contain it. A blind prepend showed the same image
		// twice — one server row, two tiles.
		expect(prependAsset([asset('2', 'new.png'), ...existing], asset('2', 'new.png'))).toHaveLength(2);
	});

	it('returns the same array reference when nothing changes, so React can skip the re-render', () => {
		const list = [asset('2', 'new.png')];
		expect(prependAsset(list, asset('2', 'new.png'))).toBe(list);
	});
});

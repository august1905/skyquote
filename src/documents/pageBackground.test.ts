import { describe, expect, it } from 'vitest';
import { BACKEND_BASE_URL } from '../config';
import type { Page } from '../editor/types';
import { editorPageBackgroundStyle, readOnlyPageBackgroundStyle } from './pageBackground';

function page(background?: Page['background']): Page {
	return { id: 'page-1', name: 'Cover', order: 0, blocks: [], ...(background ? { background } : {}) };
}

/** Stands in for a recipient's token-gated URL builder — deliberately unlike the stored path. */
const resolve = (assetId: string) => `/public/documents/9/tok/assets/${assetId}/file`;

describe('editorPageBackgroundStyle', () => {
	// The bug this suite exists to prevent: the canvas painted the *stored* path
	// straight into `url(...)`. `/assets/:id/file` is relative to the backend, so
	// the browser fetched it from the frontend origin, got the dev server's SPA
	// fallback, and drew nothing — reported as "background image setting does not
	// work". Asserting the prefix rather than a literal is the point: the URL has
	// to be built from whatever `BACKEND_BASE_URL` is at render time.
	it('resolves the image against the backend base rather than the frontend origin', () => {
		const style = editorPageBackgroundStyle(page({ imageUrl: '/assets/77/file', assetId: '77' }));
		expect(style.backgroundImage).toBe(`url(${BACKEND_BASE_URL.replace(/\/+$/, '')}/assets/77/file)`);
	});

	it('resolves a background stored before assetId existed, from its URL alone', () => {
		const style = editorPageBackgroundStyle(page({ imageUrl: '/assets/77/file' }));
		expect(style.backgroundImage).toContain(BACKEND_BASE_URL.replace(/\/+$/, ''));
		expect(style.backgroundImage).toContain('/assets/77/file');
	});

	it('emits the colour as a custom property, so an unset page still inherits the theme', () => {
		// Not `backgroundColor`: canvas.css resolves `--page-background` →
		// `--theme-page-background` → white, which is what makes "cleared" different
		// from "explicitly white".
		const style = editorPageBackgroundStyle(page({ color: '#064d81' })) as Record<string, string>;
		expect(style['--page-background']).toBe('#064d81');
		expect(style.backgroundColor).toBeUndefined();
	});

	it('paints nothing for a page with no background and no theme default', () => {
		expect(editorPageBackgroundStyle(page())).toEqual({});
	});

	it("uses the theme's default image for a page that sets none, and lets a page override it", () => {
		const theme = { pageBackgroundImageUrl: '/assets/5/file', pageBackgroundAssetId: '5' };
		expect(editorPageBackgroundStyle(page(), theme).backgroundImage).toContain('/assets/5/file');
		expect(editorPageBackgroundStyle(page({ assetId: '77' }), theme).backgroundImage).toContain('/assets/77/file');
	});

	it('matches the read-only renderers: cover, centred, no repeat', () => {
		// A background that reframed itself between authoring and sending would be
		// worse than none.
		const style = editorPageBackgroundStyle(page({ assetId: '77' }));
		expect(style.backgroundSize).toBe('cover');
		expect(style.backgroundPosition).toBe('center');
		expect(style.backgroundRepeat).toBe('no-repeat');
	});
});

describe('readOnlyPageBackgroundStyle', () => {
	it('is empty when the page has no background, so nothing is painted over the theme', () => {
		expect(readOnlyPageBackgroundStyle(page(), resolve)).toEqual({});
	});

	it('rebuilds the image URL from assetId rather than trusting the stored path', () => {
		// The whole reason this function exists: the stored `/assets/:id/file` path
		// needs a session, and a recipient has none.
		const style = readOnlyPageBackgroundStyle(page({ imageUrl: '/assets/77/file', assetId: '77' }), resolve);
		expect(style.backgroundImage).toBe('url(/public/documents/9/tok/assets/77/file)');
	});

	it('matches the canvas: cover, centred, no repeat', () => {
		const style = readOnlyPageBackgroundStyle(page({ assetId: '77' }), resolve);
		expect(style.backgroundSize).toBe('cover');
		expect(style.backgroundPosition).toBe('center');
		expect(style.backgroundRepeat).toBe('no-repeat');
	});

	it('falls back to the stored URL for a background saved before assetId existed', () => {
		const style = readOnlyPageBackgroundStyle(page({ imageUrl: '/assets/77/file' }), resolve);
		expect(style.backgroundImage).toBe('url(/assets/77/file)');
	});

	it('carries a colour through on its own', () => {
		const style = readOnlyPageBackgroundStyle(page({ color: '#064d81' }), resolve);
		expect(style.backgroundColor).toBe('#064d81');
		expect(style.backgroundImage).toBeUndefined();
	});

	it('paints an image over a colour when both are set — they are independent', () => {
		const style = readOnlyPageBackgroundStyle(page({ color: '#064d81', assetId: '77' }), resolve);
		expect(style.backgroundColor).toBe('#064d81');
		expect(style.backgroundImage).toBe('url(/public/documents/9/tok/assets/77/file)');
	});
});

describe('readOnlyPageBackgroundStyle — the theme default', () => {
	const theme = { pageBackgroundImageUrl: '/assets/5/file', pageBackgroundAssetId: '5' };

	it("applies the theme's image to a page with no background of its own", () => {
		const style = readOnlyPageBackgroundStyle(page(), resolve, theme);
		expect(style.backgroundImage).toBe('url(/public/documents/9/tok/assets/5/file)');
	});

	it("lets a page's own image override the theme default", () => {
		// The precedence the whole feature rests on: a template-wide default that a
		// single page can still replace.
		const style = readOnlyPageBackgroundStyle(page({ assetId: '77' }), resolve, theme);
		expect(style.backgroundImage).toBe('url(/public/documents/9/tok/assets/77/file)');
	});

	it("applies the theme's image under a page's own colour", () => {
		const style = readOnlyPageBackgroundStyle(page({ color: '#064d81' }), resolve, theme);
		expect(style.backgroundColor).toBe('#064d81');
		expect(style.backgroundImage).toBe('url(/public/documents/9/tok/assets/5/file)');
	});

	it('stays empty when neither the page nor the theme has anything to paint', () => {
		expect(readOnlyPageBackgroundStyle(page(), resolve, {})).toEqual({});
	});
});

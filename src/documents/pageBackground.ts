import type { CSSProperties } from 'react';
import { assetFileRelativePath, resolveAssetUrl } from '../api/assets';
import type { Page, Theme } from '../editor/types';

/** A page's own image if it has one, otherwise the theme's default — the precedence the whole feature rests on. */
function backgroundImagePath(
	page: Page,
	theme?: Pick<Theme, 'pageBackgroundImageUrl' | 'pageBackgroundAssetId'>
): { assetId?: string; storedUrl?: string } | undefined {
	const background = page.background;
	if (background?.assetId) return { assetId: background.assetId };
	if (background?.imageUrl) return { storedUrl: background.imageUrl };
	if (theme?.pageBackgroundAssetId) return { assetId: theme.pageBackgroundAssetId };
	if (theme?.pageBackgroundImageUrl) return { storedUrl: theme.pageBackgroundImageUrl };
	return undefined;
}

/**
 * A page's background as inline styles for the **editor canvas**.
 *
 * The colour is emitted as a CSS custom property rather than a direct
 * `background` so canvas.css keeps one declaration with a two-level fallback
 * chain (`--page-background` → `--theme-page-background` → white). That's what
 * makes "no background set" mean *inherit the theme*, distinct from an explicit
 * white — a distinction the Clear background control depends on.
 *
 * The image goes through {@link resolveAssetUrl}, and that is the entire point
 * of this function existing rather than the two lines it replaced. What's stored
 * is `/assets/:id/file` — a path relative to the *backend*, kept host-free on
 * purpose so a saved template doesn't bake in whichever `BACKEND_BASE_URL` was
 * active when the image was picked. Dropped straight into `url(...)` it instead
 * resolves against the *frontend* origin, so the browser asks the Vite dev
 * server (or the deployed client host) for a file only the function serves, gets
 * an SPA fallback or a 404, and paints nothing. Every other image in the app —
 * `ImageBlockView`, the recipient's view, the PDF — resolves first; this one
 * shipped without doing so, and the background silently never appeared.
 */
export function editorPageBackgroundStyle(
	page: Page,
	theme?: Pick<Theme, 'pageBackgroundImageUrl' | 'pageBackgroundAssetId'>
): CSSProperties {
	// Built as a plain string record and returned as-is. `CSSProperties` can't be
	// *indexed* with a `--*` key (so assigning onto a CSSProperties-typed object
	// is a type error), but a `Record<string, string>` is assignable to it — which
	// is why this needs neither an index-signature workaround nor a cast.
	const style: Record<string, string> = {};
	if (page.background?.color) style['--page-background'] = page.background.color;

	const source = backgroundImagePath(page, theme);
	// Rebuilt from `assetId` where there is one: the id is the durable half of the
	// pair, and the stored URL is only a cache of what `assetFileRelativePath`
	// would produce from it anyway.
	const path = source?.assetId ? assetFileRelativePath(source.assetId) : source?.storedUrl;
	if (path) {
		style.backgroundImage = `url(${resolveAssetUrl(path)})`;
		style.backgroundSize = 'cover';
		style.backgroundPosition = 'center';
		style.backgroundRepeat = 'no-repeat';
	}
	return style;
}

/**
 * A page's background as inline styles, for the **read-only** renderers — the
 * recipient's document view and the PDF exporter.
 *
 * Separate from `PageFrame`'s own version for one reason: the URL. The editor
 * can use the stored `/assets/:id/file` path directly because it has a session;
 * a recipient does not, and the PDF renderer resolves assets its own way. So
 * this rebuilds the URL from `assetId` through the caller's `resolveImageSrc`,
 * the same indirection `ImageBlock` already uses.
 *
 * Falls back to the stored `imageUrl` when there's no `assetId` — backgrounds
 * written before `assetId` was part of the model. That fallback will only
 * actually load for a viewer with a session, which is the best that can be done
 * for data that never recorded which asset it pointed at.
 *
 * Until this existed, page backgrounds were an **editor-only** effect: an author
 * could set a branded cover image, see it on the canvas, and send a document
 * where it simply wasn't there.
 */
export function readOnlyPageBackgroundStyle(
	page: Page,
	resolveImageSrc: (assetId: string) => string,
	theme?: Pick<Theme, 'pageBackgroundImageUrl' | 'pageBackgroundAssetId'>
): CSSProperties {
	const style: Record<string, string> = {};
	if (page.background?.color) style.backgroundColor = page.background.color;

	// Same precedence as the canvas, from the same helper — a background that
	// resolved differently between authoring and sending would be worse than none.
	const source = backgroundImagePath(page, theme);
	const src = source?.assetId ? resolveImageSrc(source.assetId) : source?.storedUrl;
	if (src) {
		style.backgroundImage = `url(${src})`;
		// `cover` + centre, matching the canvas exactly — a background that reframes
		// itself between authoring and sending would be worse than none.
		style.backgroundSize = 'cover';
		style.backgroundPosition = 'center';
		style.backgroundRepeat = 'no-repeat';
	}
	return style;
}

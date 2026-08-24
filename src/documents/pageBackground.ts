import type { CSSProperties } from 'react';
import type { Page, Theme } from '../editor/types';

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
	const background = page.background;
	// The theme's default image still applies to a page with no background of its
	// own — which is the common case for a branded template.
	const themeAssetId = theme?.pageBackgroundAssetId;
	const themeUrl = theme?.pageBackgroundImageUrl;
	if (!background && !themeAssetId && !themeUrl) return {};

	const style: Record<string, string> = {};
	if (background?.color) style.backgroundColor = background.color;

	const pageSrc = background?.assetId ? resolveImageSrc(background.assetId) : background?.imageUrl;
	const themeSrc = themeAssetId ? resolveImageSrc(themeAssetId) : themeUrl;
	const src = pageSrc ?? themeSrc;
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

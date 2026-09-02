/**
 * Turns a rendered print tree into a standalone HTML document for SmartBrowz.
 *
 * "Standalone" is the whole job, and it's less obvious than it sounds: the
 * headless Chromium that renders this has **no session cookie, no recipient
 * token, and no access to this app's origin**. Anything it can't resolve
 * silently becomes a blank space in a client-facing PDF. So every stylesheet is
 * inlined, and every image is converted to a `data:` URI *before* the HTML
 * leaves the browser — where the session that can actually fetch it still
 * exists.
 */

/**
 * Parks a mounted print tree offscreen, for the two components that mount one
 * (`PdfExporter`, `SignatureSender`).
 *
 * **Applied to the wrapper element the ref points at — the same element handed to
 * `serializePrintTree`, which is what undoes it.** That pairing is the whole
 * point of this living here rather than in `print.css`: those rules are inlined
 * into the HTML sent to SmartBrowz, so an offscreen rule there travels into the
 * PDF. It did, for weeks — see the comment in `print.css`.
 *
 * The tree has to be in the real DOM (fonts resolved, layout settled, images
 * fetchable with the live session) to be measured and serialized, so it cannot
 * simply be `display: none` — that produces no layout and therefore no field
 * coordinates.
 */
export const OFFSCREEN_PRINT_TREE_STYLE = {
	position: 'absolute',
	left: '-20000px',
	top: 0,
} as const;

/**
 * Collects the app's own CSS out of the live document.
 *
 * Read from `document.styleSheets` rather than imported as text because Vite
 * has already bundled and transformed it — reading it back from the CSSOM is
 * the only way to get what the browser is actually applying, including
 * whatever the build did to it. Cross-origin sheets throw on `cssRules` access
 * and are skipped; this app serves its own CSS, so in practice nothing is lost,
 * and a missing stylesheet would show up immediately as an unstyled PDF rather
 * than as a subtle difference.
 */
export function collectDocumentCss(): string {
	const chunks: string[] = [];
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		for (const rule of Array.from(rules)) chunks.push(rule.cssText);
	}
	return chunks.join('\n');
}

/**
 * The `@font-face` rules the document needs, with the font files embedded.
 *
 * **Without this the PDF is set in the wrong typeface, and the signature lands in
 * the wrong place.** Montserrat is served from `fonts.googleapis.com`, so its
 * stylesheet is cross-origin: `collectDocumentCss` cannot read `cssRules` on it
 * and skips it, no `@font-face` reaches the standalone HTML, and SmartBrowz falls
 * back — measured, its output embedded `LiberationSans`.
 *
 * That is not only cosmetic. Fields are measured in *this* browser, with
 * Montserrat loaded, and the PDF is laid out by SmartBrowz without it. Montserrat
 * is the wider face, so text above a field wraps to more lines here than there.
 * Measured at real page geometry (816px wide, 96px margins, 16px/1.5): **24px of
 * drift per paragraph, cumulative — 48px after two.** A signature box is 48px
 * tall, so a couple of paragraphs above one is enough to put the signature
 * entirely outside the rectangle Zoho Sign was given.
 *
 * Only faces whose family is actually named in the print tree are kept, so the
 * app's own chrome fonts (Poppins, Mulish) don't ride along, and only the Latin
 * subsets — Google serves Cyrillic and Vietnamese ranges for the same family.
 *
 * Best-effort by design: a font that can't be fetched leaves its rule out and the
 * PDF renders in the fallback, which is the situation today. Failing the whole
 * send because a typeface didn't download would be worse than a substituted font.
 */
async function collectWebFontCss(usedIn: string): Promise<string> {
	// The sheets `collectDocumentCss` had to skip are exactly the ones worth
	// fetching by URL — a readable sheet is already inlined by that function.
	const unreadable = Array.from(document.styleSheets)
		.filter((sheet) => {
			try {
				void sheet.cssRules;
				return false;
			} catch {
				return true;
			}
		})
		.map((sheet) => sheet.href)
		.filter((href): href is string => Boolean(href));

	const blocks: string[] = [];
	const cache = new Map<string, string | null>();

	for (const href of unreadable) {
		let cssText: string;
		try {
			const response = await fetch(href, { credentials: 'omit' });
			if (!response.ok) continue;
			cssText = await response.text();
		} catch {
			continue;
		}

		for (const [block] of cssText.matchAll(/@font-face\s*\{[^}]*\}/g)) {
			const family = /font-family:\s*(['"]?)([^;'"]+)\1/.exec(block)?.[2]?.trim();
			if (!family || !usedIn.includes(family)) continue;
			// Google splits one family across unicode ranges. Basic Latin is the only
			// one this app's documents need; keeping the rest multiplies the payload.
			const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1];
			if (range && !/U\+0{0,3}0-0{0,2}FF/i.test(range.replace(/\s/g, ''))) continue;

			let rewritten = block;
			let embeddedAll = true;
			for (const url of cssUrls(block)) {
				if (url.startsWith('data:')) continue;
				if (!cache.has(url)) cache.set(url, await toDataUri(new URL(url, href).toString(), 'omit'));
				const dataUri = cache.get(url) ?? null;
				if (dataUri) rewritten = rewritten.split(url).join(dataUri);
				else embeddedAll = false;
			}
			// A rule still pointing at a URL is worse than no rule: the renderer would
			// try to fetch it, fail, and fall back anyway — having claimed the family.
			if (embeddedAll) blocks.push(rewritten);
		}
	}

	return blocks.join('\n');
}

/**
 * Fetches one asset and returns it as a `data:` URI.
 *
 * `credentials` is a parameter because it has to differ by origin, and getting it
 * wrong fails the fetch outright: this app's own asset routes need the session
 * cookie, while Google Fonts answers with `Access-Control-Allow-Origin: *`, and
 * a wildcard origin combined with credentialed mode is rejected by the browser.
 */
async function toDataUri(url: string, credentials: RequestCredentials = 'include'): Promise<string | null> {
	try {
		const response = await fetch(url, { credentials });
		if (!response.ok) return null;
		const blob = await response.blob();
		return await new Promise<string | null>((resolve) => {
			const reader = new FileReader();
			reader.onerror = () => resolve(null);
			reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

/**
 * Every `url(...)` target in a CSS value, with any quotes stripped.
 *
 * A value can hold more than one (layered backgrounds), so this returns a list.
 * Browsers normalise `el.style.backgroundImage` to `url("…")`, but the regex
 * accepts unquoted and single-quoted forms too rather than relying on that.
 */
function cssUrls(value: string): string[] {
	return Array.from(value.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g), (match) => match[2]).filter(
		(url): url is string => Boolean(url)
	);
}

/**
 * Rewrites every image in a *clone* of the print tree to a `data:` URI — both
 * `<img src>` and `background-image` in an inline `style` attribute.
 *
 * **The `background-image` half was missing, and page backgrounds never appeared
 * in any PDF because of it.** `readOnlyPageBackgroundStyle` emits a page's
 * background as an inline `background-image: url(/assets/:id/file)` on the sheet,
 * not as an `<img>`, so it was left pointing at a backend route that the headless
 * Chromium doing the rendering cannot authenticate to — no session cookie and no
 * recipient token. It fetched, got a 401 or an SPA fallback, and painted nothing.
 * Reported by Grayson alongside the offscreen bug: "not any of the background
 * images or text".
 *
 * Operates on a clone so the live tree is untouched — it may still be mounted,
 * and swapping its `src` values would make the app refetch every image for no
 * reason. An image that can't be fetched keeps its original reference rather than
 * being removed: a broken image in the PDF is a visible, diagnosable failure,
 * where a silently deleted one looks like the template never had it.
 */
export async function inlineImages(root: HTMLElement): Promise<{ inlined: number; failed: number }> {
	let inlined = 0;
	let failed = 0;
	// Deduplicated by URL: the same logo on twelve pages is one fetch and one
	// data URI, which matters because these end up in the request body. Shared
	// across both passes, since a background and an `<img>` can be the same asset.
	const cache = new Map<string, string | null>();
	async function dataUriFor(reference: string): Promise<string | null> {
		if (!cache.has(reference)) cache.set(reference, await toDataUri(new URL(reference, window.location.href).toString()));
		return cache.get(reference) ?? null;
	}

	for (const image of Array.from(root.querySelectorAll('img'))) {
		const src = image.getAttribute('src');
		if (!src || src.startsWith('data:')) continue;
		const dataUri = await dataUriFor(src);
		if (dataUri) {
			image.setAttribute('src', dataUri);
			inlined += 1;
		} else {
			failed += 1;
		}
	}

	// `root` itself is included: it carries an inline style of its own (the
	// offscreen positioning this serializer resets), and a caller could put a
	// background there too.
	const styled = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[style]'))];
	for (const element of styled) {
		const value = element.style.backgroundImage;
		if (!value || value === 'none') continue;
		let rewritten = value;
		for (const reference of cssUrls(value)) {
			if (reference.startsWith('data:')) continue;
			const dataUri = await dataUriFor(reference);
			if (dataUri) {
				rewritten = rewritten.split(reference).join(dataUri);
				inlined += 1;
			} else {
				failed += 1;
			}
		}
		if (rewritten !== value) element.style.backgroundImage = rewritten;
	}

	return { inlined, failed };
}

export interface SerializedPrintDocument {
	html: string;
	imagesInlined: number;
	imagesFailed: number;
}

/**
 * Builds the final HTML string.
 *
 * Deliberately omits every `<script>`: nothing in the print tree needs
 * behaviour, and the backend refuses HTML containing one anyway (see
 * `routes/pdf.js`) — a rendering service executing script from a request body
 * is a bigger surface than a PDF export needs.
 */
export async function serializePrintTree(root: HTMLElement, title: string): Promise<SerializedPrintDocument> {
	const clone = root.cloneNode(true) as HTMLElement;
	// Undoes `OFFSCREEN_PRINT_TREE_STYLE`: the live tree is parked offscreen, and
	// the copy must not be, or every sheet renders blank. This resets the element
	// it was handed — so whatever carries the offscreen positioning has to be that
	// same element, which is why the style is a constant shared with the two
	// callers instead of a CSS rule that could sit on a descendant.
	clone.style.position = 'static';
	clone.style.left = '0';
	clone.style.top = '0';

	const { inlined, failed } = await inlineImages(clone);

	const css = collectDocumentCss();
	const body = clone.outerHTML;
	// Filtered against the tree's own markup, not `css`: the print tree names the
	// families it actually uses in its inline custom properties, whereas the app
	// stylesheet also mentions the chrome fonts, which no document renders in.
	const fontCss = await collectWebFontCss(body);
	const html = [
		'<!doctype html>',
		'<html><head><meta charset="utf-8">',
		`<title>${escapeHtml(title)}</title>`,
		// Fonts first, so a later rule in the app's own CSS can still override
		// anything here, and so the faces are declared before they're referenced.
		`<style>${fontCss}</style>`,
		`<style>${css}</style>`,
		// `margin: 0` for the same reason as print.css's own rule: each sheet div
		// already carries the template's real margins, and a page-box margin on top
		// would inset them again and push every sheet onto two pages.
		//
		// **No `size` here, deliberately — SmartBrowz ignores it.** Measured against
		// the deployed service: `@page { size: A4 }`, `size: 210mm 297mm` and
		// `size: 794px 1123px` all produced a Letter MediaBox (612×792pt), with or
		// without `prefer_css_page_size`. The paper is controlled only by
		// SmartBrowz's own `pdf_options.format`, which is why the page size travels
		// to the backend as a parameter instead. Emitting a `size` that has no
		// effect would be a lie in the source about where the paper comes from.
		'<style>@page { margin: 0 } body { margin: 0 }</style>',
		'</head><body>',
		body,
		'</body></html>',
	].join('');

	return { html, imagesInlined: inlined, imagesFailed: failed };
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

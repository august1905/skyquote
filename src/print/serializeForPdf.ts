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

/** Fetches one asset with the caller's own credentials and returns it as a `data:` URI. */
async function toDataUri(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, { credentials: 'include' });
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
 * Rewrites every `<img>` in a *clone* of the print tree to a `data:` URI.
 *
 * Operates on a clone so the live tree is untouched — it may still be mounted,
 * and swapping its `src` values would make the app refetch every image for no
 * reason. An image that can't be fetched keeps its original `src` rather than
 * being removed: a broken image in the PDF is a visible, diagnosable failure,
 * where a silently deleted one looks like the template never had it.
 */
export async function inlineImages(root: HTMLElement): Promise<{ inlined: number; failed: number }> {
	const images = Array.from(root.querySelectorAll('img'));
	let inlined = 0;
	let failed = 0;
	// Deduplicated by URL: the same logo on twelve pages is one fetch and one
	// data URI, which matters because these end up in the request body.
	const cache = new Map<string, string | null>();
	for (const image of images) {
		const src = image.getAttribute('src');
		if (!src || src.startsWith('data:')) continue;
		if (!cache.has(src)) cache.set(src, await toDataUri(new URL(src, window.location.href).toString()));
		const dataUri = cache.get(src) ?? null;
		if (dataUri) {
			image.setAttribute('src', dataUri);
			inlined += 1;
		} else {
			failed += 1;
		}
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
	// The live tree is parked offscreen; the copy must not be, or every sheet
	// renders blank.
	clone.style.position = 'static';
	clone.style.left = '0';
	clone.style.top = '0';

	const { inlined, failed } = await inlineImages(clone);

	const css = collectDocumentCss();
	const html = [
		'<!doctype html>',
		'<html><head><meta charset="utf-8">',
		`<title>${escapeHtml(title)}</title>`,
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
		clone.outerHTML,
		'</body></html>',
	].join('');

	return { html, imagesInlined: inlined, imagesFailed: failed };
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

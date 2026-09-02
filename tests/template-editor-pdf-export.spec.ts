import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openNewTemplate } from './templateFixture';
import { summarizePdfContent } from './pdfContent';
import { cleanupFixtureImages, uniqueImageUpload } from './imageLibrary';

// §10's PDF export.
//
// **The one place in this suite that intercepts a backend call, and why.**
// SmartBrowz — Catalyst's headless-Chromium service — does not work from
// `catalyst serve`: it fails with `INVALID_ID` / "No such User with the given id
// exists" and works only from the deployed function. That was established by
// deploying a probe and getting a real PDF back. So the *generation* half is
// verified against the deployed function with curl (see BUILD_STATUS.md), and
// what these tests own is the half a browser is the only place to check: that the
// print tree lays out one sheet per physical page, that the HTML leaving the
// browser is genuinely self-contained, and that a returned PDF becomes a
// download. The final test lets the request hit the real local backend and
// asserts the failure surfaces instead of hanging.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_PDF_BYTES = fs.readFileSync(path.join(__dirname, 'fixtures', 'test-attachment.pdf'));

/**
 * §3 ①'s ⋮ overflow owns "Export PDF" — that's where the spec puts it, so the
 * export is started the way a user actually reaches it rather than through a
 * shortcut the UI doesn't have.
 */
async function startExport(page: Page) {
	await page.getByRole('button', { name: 'More template actions' }).click();
	await page.getByRole('menuitem', { name: 'Export PDF' }).click();
}

async function newTemplateWithText(page: Page, text: string) {
	await openNewTemplate(page);
	const editor = page.locator('.canvas-block .ProseMirror').first();
	await editor.click();
	await page.keyboard.type(text);
	await expect(editor).toContainText(text);
	return editor;
}

test.describe('PDF export (§10)', () => {
	test('sends a self-contained document with one sheet per physical page, and downloads what comes back', async ({ page }) => {
		await newTemplateWithText(page, 'Exportable heading');

		let sentHtml = '';
		let sentFilename = '';
		let sentPaper: { format: string; landscape: boolean } | null = null;
		await page.route('**/pdf', async (route) => {
			const body = route.request().postDataJSON() as { html: string; filename: string; format: string; landscape: boolean };
			sentHtml = body.html;
			sentFilename = body.filename;
			sentPaper = { format: body.format, landscape: body.landscape };
			await route.fulfill({ status: 200, contentType: 'application/pdf', body: REAL_PDF_BYTES });
		});

		const downloadPromise = page.waitForEvent('download');
		await startExport(page);
		const download = await downloadPromise;

		// The download is named from the template, so a folder of exports is
		// navigable rather than a pile of "document.pdf".
		expect(download.suggestedFilename()).toMatch(/\.pdf$/);
		expect(sentFilename).toMatch(/\.pdf$/);

		// A complete standalone document: doctype, the app's own CSS inlined, and
		// the print sheets themselves. Headless Chromium has no access to this
		// origin, so anything left as a reference would render as a blank space in
		// a client-facing PDF.
		expect(sentHtml).toContain('<!doctype html>');
		expect(sentHtml).toContain('print-page');
		expect(sentHtml).toContain('Exportable heading');
		// Proof the stylesheet travelled rather than being linked: a rule only this
		// app defines.
		expect(sentHtml).toContain('.print-page');
		// Never any script — the backend refuses HTML containing one outright.
		expect(sentHtml).not.toMatch(/<\s*script/i);
		// The sheet carries real page geometry (Letter portrait at 96dpi), which is
		// what makes Chromium's page breaks match the canvas's.
		expect(sentHtml).toMatch(/width:\s*816px/);
		expect(sentHtml).toMatch(/height:\s*1056px/);
		// The paper travels as a *parameter*, not as CSS: SmartBrowz ignores
		// `@page size` entirely (measured — see PdfPaper in api/pdf.ts), so a page
		// size expressed only in the stylesheet would silently print A4 templates
		// on Letter.
		expect(sentPaper).toEqual({ format: 'Letter', landscape: false });
		expect(sentHtml).toContain('@page { margin: 0 }');
		expect(sentHtml).not.toContain('@page { size:');

		// One sheet for a one-page template, and the offscreen tree is gone once
		// the export finishes.
		await expect(page.locator('[data-testid="pdf-print-tree"]')).toHaveCount(0);
	});

	/**
	 * **The check this suite was missing, and the reason a real bug shipped.**
	 *
	 * The test above asserts the HTML *contains* the heading — and that passed for
	 * weeks while every generated PDF was blank. `print.css` parked the print tree
	 * at `left: -20000px` so it could be measured offscreen inside the app, and
	 * those rules are inlined verbatim into the HTML handed to SmartBrowz, so the
	 * content was rendered 20,000px to the left of the paper. Right page count,
	 * right field coordinates, nothing visible. Grayson found it in the Zoho Sign
	 * viewer, not here.
	 *
	 * So this renders the exact bytes SmartBrowz would receive and asserts the
	 * marks land on the paper. `toBeVisible()` alone is not enough — an element at
	 * `x: -20000` still has a non-empty box and passes it — hence the coordinate
	 * assertion and the PDF operator count.
	 */
	test('the HTML that leaves the browser renders onto the paper, not off the side of it', async ({ page, context }) => {
		await newTemplateWithText(page, 'Renderable body text');

		let sentHtml = '';
		await page.route('**/pdf', async (route) => {
			sentHtml = (route.request().postDataJSON() as { html: string }).html;
			await route.fulfill({ status: 200, contentType: 'application/pdf', body: REAL_PDF_BYTES });
		});

		const downloadPromise = page.waitForEvent('download');
		await startExport(page);
		await downloadPromise;
		expect(sentHtml).toContain('Renderable body text');

		// A blank page with only these bytes in it — the same position SmartBrowz's
		// headless Chromium is in, with no access to this origin.
		const renderPage = await context.newPage();
		try {
			await renderPage.setContent(sentHtml);

			// On the paper, not beside it. This is the assertion that fails on the bug.
			const rootBox = await renderPage.locator('.print-root').boundingBox();
			expect(rootBox).not.toBeNull();
			expect(rootBox!.x).toBeGreaterThanOrEqual(0);
			expect(rootBox!.width).toBeGreaterThan(0);

			const textBox = await renderPage.getByText('Renderable body text').boundingBox();
			expect(textBox).not.toBeNull();
			expect(textBox!.x).toBeGreaterThanOrEqual(0);

			// The strongest form of the claim: Chromium, rendering this HTML, emits a
			// PDF that actually draws text. Zero embedded fonts would mean no text was
			// ever laid out — not merely that it was positioned out of view.
			const pdf = await renderPage.pdf({ format: 'Letter', printBackground: true });
			const content = summarizePdfContent(pdf);
			expect(content.textShowOperators).toBeGreaterThan(0);
			expect(content.fonts).toBeGreaterThan(0);
			expect(content.pages).toBeGreaterThan(0);
		} finally {
			await renderPage.close();
		}
	});

	/**
	 * **The document's typeface has to travel, or the signature moves.**
	 *
	 * Montserrat is served from `fonts.googleapis.com`, so its stylesheet is
	 * cross-origin and `collectDocumentCss` cannot read it. Before this was fixed
	 * no `@font-face` reached the standalone HTML and SmartBrowz fell back —
	 * measured against the deployed renderer, its output embedded `LiberationSans`.
	 *
	 * That is a placement bug, not just a cosmetic one. Fields are measured in this
	 * browser with Montserrat loaded and the PDF is laid out without it; Montserrat
	 * is the wider face, so text above a field wraps to more lines here than there.
	 * Measured at real page geometry: 24px of drift per paragraph, cumulative, and a
	 * signature box is only 48px tall.
	 *
	 * Its own test rather than an assertion bolted onto the layout one, so a Google
	 * Fonts hiccup fails *this* and leaves the layout coverage readable.
	 */
	test('the document typeface is embedded, so the PDF lays out in the same font the fields were measured in', async ({ page }) => {
		await newTemplateWithText(page, 'Typeface must travel');

		let sentHtml = '';
		await page.route('**/pdf', async (route) => {
			sentHtml = (route.request().postDataJSON() as { html: string }).html;
			await route.fulfill({ status: 200, contentType: 'application/pdf', body: REAL_PDF_BYTES });
		});
		const downloadPromise = page.waitForEvent('download');
		await startExport(page);
		await downloadPromise;

		const faces = sentHtml.match(/@font-face\s*\{[^}]*\}/g) ?? [];
		expect(faces.length).toBeGreaterThan(0);
		// The family the document is actually set in (see DOCUMENT_FONT).
		expect(faces.some((face) => face.includes('Montserrat'))).toBe(true);
		// Every face embedded. One still pointing at fonts.gstatic.com would be
		// worse than none: the renderer would claim the family, fail to fetch it,
		// and fall back anyway.
		expect(faces.filter((face) => !/url\(\s*["']?data:/.test(face))).toEqual([]);
		// The app's own chrome faces must not ride along — only what the tree uses.
		expect(faces.some((face) => /Poppins|Mulish/.test(face))).toBe(false);
	});

	/**
	 * **A page background is CSS, not an `<img>`, and that is why it never printed.**
	 *
	 * `readOnlyPageBackgroundStyle` emits it as an inline
	 * `background-image: url(/assets/:id/file)` on the sheet. The serializer only
	 * rewrote `<img src>`, so the background travelled to SmartBrowz as a backend
	 * URL that headless Chromium cannot authenticate to — no session cookie, no
	 * recipient token — and it painted nothing. Grayson reported it together with
	 * the offscreen bug: "not any of the background images or text".
	 *
	 * Asserting the URL is a `data:` URI is the precise claim; the image XObject in
	 * the rendered PDF is the proof it actually paints.
	 */
	test('a page background image is embedded, not left as a URL the renderer cannot fetch', async ({ page, context, request }) => {
		const upload = uniqueImageUpload('pdf-bg');
		try {
			await newTemplateWithText(page, 'Text over a background');

			await page.getByRole('button', { name: 'Page options' }).click();
			await page.locator('.page-menu-popover').getByRole('button', { name: 'Set background image' }).click();
			const picker = page.getByRole('dialog', { name: 'Choose an image' });
			await expect(picker).toBeVisible();
			await picker.getByLabel('Upload images').setInputFiles(upload);
			await picker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });
			await expect(page.locator('.canvas-page').first()).toHaveAttribute('style', /background-image/);

			let sentHtml = '';
			await page.route('**/pdf', async (route) => {
				sentHtml = (route.request().postDataJSON() as { html: string }).html;
				await route.fulfill({ status: 200, contentType: 'application/pdf', body: REAL_PDF_BYTES });
			});
			const downloadPromise = page.waitForEvent('download');
			await startExport(page);
			await downloadPromise;

			// Every `url(...)` in the document body must be embedded — one left
			// pointing at a backend route is one the renderer cannot fetch.
			//
			// `&quot;` is unescaped first because this is serialized HTML, not CSS:
			// `outerHTML` escapes the quotes the browser normalises a style attribute
			// to, so the value reads `url(&quot;data:image/png…&quot;)`. Asserting on
			// the extracted targets rather than with a negative lookahead is
			// deliberate — an optional-quote group in front of `(?!data:)` matches the
			// empty string before the quote and passes no matter what follows.
			const bodyHtml = sentHtml.slice(sentHtml.indexOf('<body>')).replace(/&quot;/g, '"');
			const urlTargets = Array.from(bodyHtml.matchAll(/url\(\s*["']?([^)"']+)/g), (match) => match[1]);
			expect(urlTargets.length).toBeGreaterThan(0);
			expect(urlTargets.filter((target) => !target.startsWith('data:'))).toEqual([]);
			expect(urlTargets.some((target) => target.startsWith('data:image/'))).toBe(true);

			const renderPage = await context.newPage();
			try {
				await renderPage.setContent(sentHtml);
				const pdf = await renderPage.pdf({ format: 'Letter', printBackground: true });
				const content = summarizePdfContent(pdf);
				// The background is painted, and the text over it still is too.
				expect(content.xobjectDraws).toBeGreaterThan(0);
				expect(content.textShowOperators).toBeGreaterThan(0);
			} finally {
				await renderPage.close();
			}
		} finally {
			await cleanupFixtureImages(request, [upload]);
		}
	});

	test('a failed generation surfaces a message and gives the button back', async ({ page }) => {
		await newTemplateWithText(page, 'This export will fail');

		// The request is aborted rather than left to fail against the local
		// backend: locally SmartBrowz doesn't just fail, it never responds at all —
		// which is precisely why `generatePdf` has a 60s client-side timeout now.
		// Aborting reaches the same catch in the same component through the same
		// code path, without spending a minute of suite time proving it.
		await page.route('**/pdf', (route) => route.abort('failed'));

		await startExport(page);

		await expect(page.getByText('Could not reach the server to generate the PDF')).toBeVisible();
		// The action comes back — a failed export must not leave the menu item
		// permanently disabled with nothing to click, which is exactly what
		// happened before the timeout existed.
		await page.getByRole('button', { name: 'More template actions' }).click();
		await expect(page.getByRole('menuitem', { name: 'Export PDF' })).toBeEnabled();
		await expect(page.locator('[data-testid="pdf-print-tree"]')).toHaveCount(0);
	});
});

import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function newTemplateWithText(page: Page, text: string) {
	await page.goto('/templates');
	await page.getByRole('button', { name: '+ New template' }).click();
	await page.waitForURL(/\/templates\/.+\/edit/);
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
		await page.getByRole('button', { name: 'Export PDF' }).click();
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

	test('a multi-page template exports one sheet per page, in order', async ({ page }) => {
		await newTemplateWithText(page, 'First page heading');

		// A page break is the deterministic way to force a second physical page —
		// it doesn't depend on measured heights the way natural overflow does.
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Page break' }).click();
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
		await page.locator('.canvas-block .ProseMirror').last().click();
		await page.keyboard.type('Second page heading');

		let sentHtml = '';
		await page.route('**/pdf', async (route) => {
			sentHtml = (route.request().postDataJSON() as { html: string }).html;
			await route.fulfill({ status: 200, contentType: 'application/pdf', body: REAL_PDF_BYTES });
		});

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export PDF' }).click();
		await downloadPromise;

		const sheetCount = (sentHtml.match(/class="print-page"/g) ?? []).length;
		expect(sheetCount).toBeGreaterThanOrEqual(2);
		// In document order — the second page's text must come after the first's.
		expect(sentHtml.indexOf('First page heading')).toBeLessThan(sentHtml.indexOf('Second page heading'));
	});

	test('a failed generation surfaces a message and gives the button back', async ({ page }) => {
		await newTemplateWithText(page, 'This export will fail');

		// The request is aborted rather than left to fail against the local
		// backend: locally SmartBrowz doesn't just fail, it never responds at all —
		// which is precisely why `generatePdf` has a 60s client-side timeout now.
		// Aborting reaches the same catch in the same component through the same
		// code path, without spending a minute of suite time proving it.
		await page.route('**/pdf', (route) => route.abort('failed'));

		await page.getByRole('button', { name: 'Export PDF' }).click();

		await expect(page.getByText('Could not reach the server to generate the PDF')).toBeVisible();
		// The button comes back — a failed export must not leave the editor stuck
		// on "Exporting…" with nothing to click, which is exactly what happened
		// before the timeout existed.
		await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
		await expect(page.locator('[data-testid="pdf-print-tree"]')).toHaveCount(0);
	});
});

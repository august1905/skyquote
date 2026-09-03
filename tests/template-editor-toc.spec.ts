import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow, unpinSelectedBlock } from './templateFixture';

// §4.5/§10: a non-editable list derived from headings, with page numbers
// resolved from real pagination. Real backend, no mocking, same convention
// as the rest of this suite.
//
// Every insert here unpins (new blocks arrive pinned by default): a TOC's page
// numbers come from pagination, which is a flow concept — a pinned heading has
// no page number to resolve.

async function insertTextBlock(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
	await unpinSelectedBlock(page);
	return page.locator('.canvas-block .ProseMirror').last();
}

async function insertPageBreak(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Page break' }).click();
}

async function insertToc(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Table of contents' }).click();
	await unpinSelectedBlock(page);
}

/**
 * Waits for the pagination pass to publish a page number for every entry.
 *
 * A TOC entry renders `–` until the canvas has measured the block it points at,
 * so asserting a number straight after a change races that measurement. It is
 * normally quick, which is why this went unnoticed — but on 2026-09-01 the
 * heading-depth step failed in a full run with `Received: "–"` after the default
 * 10s, having passed 5/5 in isolation at ~8s a run. Two workers plus a machine
 * that is swapping is enough to push an 8s test past a 10s assertion window.
 *
 * Waiting for the *absence of unmeasured entries* rather than lengthening each
 * page assertion says what the test is actually waiting for, and keeps the real
 * assertions on the default timeout so a genuinely wrong number still fails fast.
 */
async function expectPagesMeasured(toc: import('@playwright/test').Locator) {
	await expect(toc.locator('.toc-entry-page', { hasText: '–' })).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Table of contents (§4.5/§10)', () => {
	test('lists headings in order with correct page numbers, live-updates as headings are added, and respects the heading-depth filter', async ({ page }) => {
		await openNewTemplate(page);

		// TOC first, before any heading exists — "Live-updates as headings change" (§4.5).
		await insertToc(page);
		const toc = page.locator('.block-toc');
		await expect(toc).toBeVisible();
		await expect(toc.locator('.toc-empty')).toHaveText('No headings yet — headings you add will appear here.');

		await insertPageBreak(page);
		const h1Editor = await insertTextBlock(page);
		await h1Editor.click();
		await page.keyboard.type('# Introduction');

		await insertPageBreak(page);
		const h2Editor = await insertTextBlock(page);
		await h2Editor.click();
		await page.keyboard.type('## Pricing');

		await insertPageBreak(page);
		const h3Editor = await insertTextBlock(page);
		await h3Editor.click();
		await page.keyboard.type('### Fine print');

		// Default heading depth is 1–2 — the h3 doesn't show up yet.
		await expect(toc.locator('.toc-empty')).toHaveCount(0);
		const entries = toc.locator('.toc-entry');
		await expect(entries).toHaveCount(2);
		await expectPagesMeasured(toc);
		await expect(entries.nth(0).locator('.toc-entry-text')).toHaveText('Introduction');
		await expect(entries.nth(0).locator('.toc-entry-page')).toHaveText('2');
		await expect(entries.nth(1).locator('.toc-entry-text')).toHaveText('Pricing');
		await expect(entries.nth(1).locator('.toc-entry-page')).toHaveText('3');

		// Widening the depth to 1–3 brings in the h3, still correctly numbered.
		await toc.click();
		await page.getByLabel('Heading depth').selectOption('3');
		await expect(entries).toHaveCount(3);
		await expectPagesMeasured(toc);
		await expect(entries.nth(2).locator('.toc-entry-text')).toHaveText('Fine print');
		await expect(entries.nth(2).locator('.toc-entry-page')).toHaveText('4');

		await saveNow(page);
		await page.reload();

		const reloadedToc = page.locator('.block-toc');
		const reloadedEntries = reloadedToc.locator('.toc-entry');
		await expect(reloadedEntries).toHaveCount(3);
		await expectPagesMeasured(reloadedToc);
		await expect(reloadedEntries.nth(0).locator('.toc-entry-text')).toHaveText('Introduction');
		await expect(reloadedEntries.nth(0).locator('.toc-entry-page')).toHaveText('2');
		await expect(reloadedEntries.nth(2).locator('.toc-entry-text')).toHaveText('Fine print');
		await expect(reloadedEntries.nth(2).locator('.toc-entry-page')).toHaveText('4');
	});
});

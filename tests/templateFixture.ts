import { expect, type Page } from '@playwright/test';

export const BACKEND = `http://localhost:${process.env.CATALYST_SERVE_PORT || '3000'}/server/skyquote_function`;

/**
 * Creates a blank template and opens it in the editor.
 *
 * Replaces the pattern nearly every editor spec used to open with:
 *
 *   await page.goto('/templates');
 *   await page.getByRole('button', { name: '+ New template' }).click();
 *   await page.waitForURL(/\/templates\/.+\/edit/);
 *
 * which loaded the whole Templates list — a paged `GET /templates` plus its
 * owner-name lookup, plus `GET /folders` — purely to click a button on it. Across
 * ~150 tests that was several hundred requests a run against a billed Data Store,
 * and not one of those tests was testing the list page. `POST /templates` does
 * the same job in one request; `templates-list.spec.ts` still exercises the real
 * button, which is where that behaviour actually belongs.
 *
 * Uses `page.request`, not the `request` fixture, so it shares the browser
 * context's session cookie — and so call sites keep taking just `page`.
 *
 * Fixture rows are named `zz-fixture-…` and swept by `global-teardown.ts` (by
 * owner id, not by name — see that file).
 */
export async function openNewTemplate(page: Page, name = 'zz-fixture'): Promise<string> {
	const response = await page.request.post(`${BACKEND}/templates`, { data: { name } });
	expect(response.ok(), `POST /templates failed: ${response.status()}`).toBeTruthy();
	const { meta } = (await response.json()) as { meta: { id: string } };

	await page.goto(`/templates/${meta.id}/edit`);
	// Waits for the blank template's text editor, not just the page frame or the
	// URL.
	//
	// The frame renders before Tiptap mounts inside its block, and that gap is
	// real: the old open-via-the-list flow spent ~1s loading a page nobody was
	// testing, which incidentally gave Tiptap time to be ready before the first
	// click. Removing that page load removed the accidental wait with it, and the
	// toolbar spec started intermittently applying a mark to an editor that
	// wasn't listening yet. Waiting for the thing callers actually interact with
	// is the fix; a retry would have papered over a race this helper created.
	await expect(page.locator('.canvas-block .ProseMirror').first()).toBeVisible();
	return meta.id;
}

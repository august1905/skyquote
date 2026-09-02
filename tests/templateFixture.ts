import { expect, type Locator, type Page } from '@playwright/test';

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

/**
 * Forces a save and waits for it to land.
 *
 * The editor autosaves on a **30-second interval** (see `useAutosave.ts`), not
 * after every edit — so a test that merely waited for "All changes saved" would
 * sit there for half a minute, forty-odd times a run. `Cmd+S` is the same flush
 * every exit path uses, so this asserts the real save path rather than a
 * test-only shortcut; it just doesn't wait out the clock.
 *
 * Use this before a `page.reload()` that checks persistence.
 */
export async function saveNow(page: Page) {
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 15000 });
}

/**
 * Returns a just-inserted block to the flow.
 *
 * New top-level blocks arrive **pinned** (movable position) by design — Grayson,
 * 2026-09-02 — and they arrive selected, so the Pin toggle in the toolbar is
 * already pointing at them. Tests that exercise flow behaviour (reorder,
 * pagination spill) unpin first. Waiting for `aria-pressed="true"` before
 * clicking doubles as the assertion that the block really did arrive pinned —
 * the pin lands a frame after the insert, so clicking blind could race it.
 */
export async function unpinSelectedBlock(page: Page) {
	const pin = page.getByRole('button', { name: 'Pin block to the page' });
	await expect(pin).toHaveAttribute('aria-pressed', 'true');
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
}

/**
 * Asserts an element's `background-image` points at something the server
 * actually serves as an image — not merely that a `url(...)` is present.
 *
 * That distinction is the entire reason this exists. Page backgrounds shipped
 * broken: the canvas painted the stored `/assets/:id/file` path unresolved, so
 * the browser fetched it from the frontend origin instead of the backend and got
 * the dev server's SPA fallback — an HTML document, 200 OK, drawn as nothing.
 * Every assertion of the form `toHaveAttribute('style', /background-image: url/)`
 * stayed green while the feature did nothing at all, which is why the status code
 * alone isn't enough here either: the content type is what tells the two apart.
 *
 * `contextPage.request` shares that page's cookies, so passing the recipient's
 * page checks *their* token-gated URL rather than the author's session-gated one.
 */
export async function expectBackgroundImageLoads(contextPage: Page, locator: Locator) {
	// Computed, not the style attribute: the browser has already resolved the URL
	// against the document base, which is exactly the resolution being tested.
	const backgroundImage = await locator.evaluate((el) => getComputedStyle(el).backgroundImage);
	const url = /url\(["']?(.+?)["']?\)/.exec(backgroundImage)?.[1];
	expect(url, `expected a background-image url, got: ${backgroundImage}`).toBeTruthy();

	const response = await contextPage.request.get(url!);
	expect(response.status(), `background image did not load: ${url}`).toBe(200);
	expect(response.headers()['content-type'], `background image is not an image: ${url}`).toMatch(/^image\//);
}

/**
 * Clicks past the Create Document wizard's deal step without choosing one.
 *
 * Every spec that creates a document goes through here, which makes the suite a
 * standing proof of something that matters more than the happy path: **a Zoho
 * CRM that can't be reached must never stop a quote being written.** These runs
 * hit a local `catalyst serve` backend with no CRM connection behind it, so the
 * step genuinely fails to load its deals every time — and creating a document
 * still works. See `DealStep`.
 */
export async function skipWizardDealStep(wizard: Locator) {
	await wizard.getByRole('button', { name: 'Continue without a deal' }).click();
}

/**
 * A right-rail panel button, scoped to the rail.
 *
 * Scoped deliberately. `getByRole('button', { name })` matches accessible names
 * by **substring**, so an unscoped `{ name: 'Theme' }` also matched the
 * toolbar's `Reset font size to theme` the moment that control was added — five
 * specs failed at once on a locator that had been quietly fragile since it was
 * written. The rail is what these tests mean; saying so costs nothing and can't
 * be broken by a label added somewhere else.
 */
export function railButton(page: Page, label: string): Locator {
	return page.locator('.right-rail').getByRole('button', { name: label });
}

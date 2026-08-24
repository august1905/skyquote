import { test, expect, type Page } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// §13's data-integrity requirement: "Never lose user content — offline queue
// for pending saves, restore-from-local-draft on reconnect."
//
// Two different simulations, for two different claims:
//
// - **Genuinely offline** (`context.setOffline`) for the reconnect behaviour,
//   which is about `navigator.onLine` and the `online` event.
// - **A blocked PUT** (`page.route` aborting just the save) for the
//   draft-survival behaviour. Offline emulation is the wrong tool there: the
//   editor deliberately flushes on `pagehide` (§9.2), and that unload-time
//   save can still succeed as the offline emulation is torn down — which it
//   did, silently making an earlier version of this spec assert something
//   false. Aborting the request is deterministic: the save *cannot* succeed,
//   which is the only way to be sure the draft is what rescued the work.

/**
 * Fails every template *save*, leaving reads alone so the editor can still
 * load. Scoped to PUT because the same URL pattern serves the GET this page
 * needs to open at all.
 */
async function blockSaves(page: Page): Promise<void> {
	await page.route('**/templates/*', async (route) => {
		if (route.request().method() === 'PUT') return route.abort();
		return route.fallback();
	});
}

test.describe('Offline safety and local drafts (§13)', () => {
	test('an edit made offline is kept on the device and sent automatically on reconnect', async ({ page, context }) => {
		await openNewTemplate(page);
		const url = page.url();

		// Settle first, so the text typed below is unambiguously the only thing
		// still unsaved when the network goes away.
		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Saved while online');
		await saveNow(page);

		await context.setOffline(true);
		await editor.click();
		await page.keyboard.press('End');
		await page.keyboard.type(' — and this while offline');

		// Cmd+S provokes the save attempt rather than waiting out the 30s interval;
		// it's the same flush, so the offline branch under test is the real one.
		// Reported as offline, not as a failure: the work is safe on the device
		// and the situation resolves itself.
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.locator('.template-editor-autosave-status')).toHaveText('Offline — your changes are saved on this device', { timeout: 8000 });

		// Reconnecting alone should push it — no further typing, no reload.
		await context.setOffline(false);
		await page.evaluate(() => window.dispatchEvent(new Event('online')));
		await saveNow(page);

		// And it really reached the server: a fresh load shows it.
		await page.goto(url);
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('and this while offline');
		// Nothing left to recover, so no prompt.
		await expect(page.locator('.template-editor-draft-banner')).toHaveCount(0);
	});

	test('work lost to a closed tab is offered back on next open, and restoring it saves it', async ({ page }) => {
		await openNewTemplate(page);
		const url = page.url();

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Committed to the server');
		await saveNow(page);

		// Make saving impossible — including the unload-time flush, which is why
		// this aborts the request rather than going offline (see the file header).
		await blockSaves(page);
		await editor.click();
		await page.keyboard.press('End');
		await page.keyboard.type(' plus rescued text');
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.locator('.template-editor-autosave-status')).toHaveText('Save failed — will retry on your next edit', { timeout: 8000 });

		// The tab goes away with that work still unsent. `about:blank` needs no
		// network and fires `pagehide`, the path that writes the draft
		// synchronously before the page stops running.
		await page.goto('about:blank');
		await page.unroute('**/templates/*');
		await page.goto(url);

		// The draft is offered, never auto-applied — silently replacing what the
		// server returned would be its own kind of data loss.
		const banner = page.locator('.template-editor-draft-banner');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText('never sent to the server');
		// Until it's restored, the canvas shows the server's copy.
		await expect(page.locator('.canvas-block .ProseMirror').first()).not.toContainText('plus rescued text');

		await banner.getByRole('button', { name: 'Restore them' }).click();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('plus rescued text');
		await expect(banner).toHaveCount(0);

		// Restoring marks it dirty, so a save sends it — the recovered work ends up
		// on the server rather than only back on screen.
		await saveNow(page);
		await page.reload();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('plus rescued text');
		await expect(page.locator('.template-editor-draft-banner')).toHaveCount(0);
	});

	test('discarding a recovered draft leaves the server copy alone and does not offer it again', async ({ page }) => {
		await openNewTemplate(page);
		const url = page.url();

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Keep only this');
		await saveNow(page);

		await blockSaves(page);
		await editor.click();
		await page.keyboard.press('End');
		await page.keyboard.type(' UNWANTED');
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.locator('.template-editor-autosave-status')).toHaveText('Save failed — will retry on your next edit', { timeout: 8000 });

		await page.goto('about:blank');
		await page.unroute('**/templates/*');
		await page.goto(url);

		const banner = page.locator('.template-editor-draft-banner');
		await expect(banner).toBeVisible();
		await banner.getByRole('button', { name: 'Discard' }).click();
		await expect(banner).toHaveCount(0);

		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Keep only this');
		await expect(page.locator('.canvas-block .ProseMirror').first()).not.toContainText('UNWANTED');

		// Discarded for good — reopening doesn't resurrect it.
		await page.reload();
		await expect(page.locator('.template-editor-draft-banner')).toHaveCount(0);
		await expect(page.locator('.canvas-block .ProseMirror').first()).not.toContainText('UNWANTED');
	});
});

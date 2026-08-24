import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// Real backend, no mocking. Each test creates its own real Template row +
// Stratus object via "+ New template".
test.describe('Template autosave', () => {
	test('edits persist across a reload once autosave completes @core', async ({ page }) => {
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Persisted by autosave');

		// Flushed rather than waiting out the 30s interval — the claim under test
		// here is that a completed save survives a reload. That the interval fires
		// on its own is a separate test below, kept out of @core because it costs
		// half a minute of waiting by definition.
		await saveNow(page);

		await page.reload();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Persisted by autosave');
	});

	test('saves on its own after the 30s interval, and says so meanwhile', async ({ page }) => {
		// Longer than Playwright's 30s default, because this test waits out a 30s
		// interval by design — the one place in the suite that does.
		test.setTimeout(70_000);
		// The interval itself — the one test that deliberately waits it out, and
		// the reason it isn't in @core. Also guards the other direction: that an
		// edit does NOT go straight to the server, which is the whole point of the
		// change from a 1.5s debounce.
		await openNewTemplate(page);

		const status = page.locator('.template-editor-autosave-status');
		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type('Left alone to autosave');

		// Well past the old debounce, nowhere near the new interval: the work is
		// on the device, and the status line says so rather than claiming it's saved.
		await page.waitForTimeout(4000);
		await expect(status).toHaveText('Unsaved changes');

		// And then it saves itself, with nothing prompting it.
		await expect(status).toHaveText('All changes saved', { timeout: 35000 });

		await page.reload();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Left alone to autosave');
	});

	test('a stale save shows the conflict banner, and "Reload latest" recovers the server copy', async ({ page, context }) => {
		await openNewTemplate(page);
		const url = page.url();

		// Tab A's first save (version 1 → 2) — tab B deliberately doesn't
		// open until after this, so its own load starts from a version
		// consistent with the server. Opening both tabs from the same
		// pristine version would make tab B's own save the one that
		// conflicts, which is a real scenario but not the one this test
		// targets: tab A being stale relative to a change made *after* it
		// last saved.
		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type('From tab A');
		await saveNow(page);

		// Same logged-in user, a second tab open on the same template,
		// loading it fresh at version 2 — a real scenario (as real as this
		// app gets in phase 1, with no real-time collaboration), not a
		// contrived one.
		const page2 = await context.newPage();
		await page2.goto(url);
		// Tab B's copy already contains tab A's saved text (it loaded after
		// that save) — select-all and replace so tab B's save unambiguously
		// contains only its own content. This app does whole-document
		// last-save-wins, not a merge, so without this the result would
		// legitimately (and correctly) be both texts concatenated.
		await page2.locator('.canvas-block .ProseMirror').first().click();
		await page2.keyboard.press('ControlOrMeta+a');
		await page2.keyboard.type('From tab B');
		await saveNow(page2);

		// Tab A edits again, unaware its in-memory version (2) is now stale
		// (server is at 3, from tab B's save) — this save should 409.
		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type(' — more');
		// Provoked with Cmd+S rather than waiting out the interval — the same flush,
		// and it's the 409 response that's under test, not the timer.
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.locator('.template-editor-conflict-banner')).toBeVisible({ timeout: 10000 });

		await page.getByRole('button', { name: 'Reload latest' }).click();
		await expect(page.locator('.template-editor-conflict-banner')).toBeHidden();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('From tab B');
		await expect(page.locator('.canvas-block .ProseMirror').first()).not.toContainText('From tab A');

		await page2.close();
	});
});

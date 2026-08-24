import { test, expect } from '@playwright/test';
import { openNewTemplate } from './templateFixture';

// Real backend, no mocking. Each test creates its own real Template row +
// Stratus object via "+ New template".
test.describe('Template autosave', () => {
	test('edits persist across a reload once autosave completes @core', async ({ page }) => {
		await openNewTemplate(page);

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Persisted by autosave');

		// Waiting for the status label, not a fixed timeout, is the actual
		// claim under test: that the debounced save really completed.
		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });

		await page.reload();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Persisted by autosave');
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
		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });

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
		await expect(page2.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });

		// Tab A edits again, unaware its in-memory version (2) is now stale
		// (server is at 3, from tab B's save) — this save should 409.
		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type(' — more');
		await expect(page.locator('.template-editor-conflict-banner')).toBeVisible({ timeout: 5000 });

		await page.getByRole('button', { name: 'Reload latest' }).click();
		await expect(page.locator('.template-editor-conflict-banner')).toBeHidden();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('From tab B');
		await expect(page.locator('.canvas-block .ProseMirror').first()).not.toContainText('From tab A');

		await page2.close();
	});
});

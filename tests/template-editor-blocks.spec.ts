import { test, expect } from '@playwright/test';

// Real backend, no mocking. Home for phase 2's per-block-type coverage as
// the block catalog (§15 phase 2) grows — one describe per block type.
test.describe('Page break block', () => {
	test('inserts, selects, duplicates, deletes, and persists through the generic block commands', async ({ page }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Page break' }).click();

		const pageBreaks = page.locator('.block-page-break');
		await expect(pageBreaks).toHaveCount(1);
		await expect(pageBreaks.first()).toHaveText('Page break');

		// It's a real block, not a stub — the generic block commands (built
		// for any Block, never page-break-specific) should just work.
		const pageBreakBlockWrapper = page.locator('.canvas-block').filter({ has: page.locator('.block-page-break') });
		await pageBreakBlockWrapper.click();
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await expect(pageBreaks).toHaveCount(2);

		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(pageBreaks).toHaveCount(1);

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });
		await page.reload();
		await expect(page.locator('.block-page-break')).toHaveCount(1);
	});
});

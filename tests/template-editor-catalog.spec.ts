import { test, expect } from '@playwright/test';

// §7.7: browse the catalog, drag an item into a pricing table, and see a
// "price changed since insert" indicator once the catalog's price diverges
// from what was captured at drop time. Real backend, no mocking — the test
// fixture item is created/patched/deleted through the same POST/PATCH/DELETE
// /catalog-items routes CatalogPanel's data ultimately comes from, not
// seeded by hand in the console (see routes/catalogItems.js's own comment on
// why those routes exist at all).
const BACKEND = `http://localhost:${process.env.CATALYST_SERVE_PORT || '3000'}/server/skyquote_function`;

test.describe('Catalog integration', () => {
	test('browsing, searching, dragging into a pricing table, and the price-changed indicator all work end to end', async ({ page, request }) => {
		const created = await request.post(`${BACKEND}/catalog-items`, {
			data: { sku: 'PW-CATALOG-1', name: 'Playwright Catalog Item', description: 'e2e fixture', price: 15000, category: 'Testing' },
		});
		expect(created.ok()).toBe(true);
		const { catalogItem } = await created.json();

		try {
			await page.goto('/templates');
			await page.getByRole('button', { name: '+ New template' }).click();
			await page.waitForURL(/\/templates\/.+\/edit/);

			await page.getByRole('button', { name: '+ Add block' }).click();
			await page.getByRole('menuitem', { name: 'Pricing table' }).click();
			const block = page.locator('.block-pricing-table');
			await expect(block).toBeVisible();

			// Browse + search.
			await page.getByRole('button', { name: 'Catalog / Pricing' }).click();
			const panel = page.locator('.catalog-panel');
			const card = panel.getByRole('button', { name: `Drag ${catalogItem.name} into a pricing table` });
			await expect(card).toBeVisible();
			await expect(card).toContainText('$150.00');

			await panel.getByLabel('Search catalog').fill('nonexistent-item-xyz');
			await expect(panel.getByText('No matches.')).toBeVisible();
			await panel.getByLabel('Search catalog').fill('Playwright Catalog');
			await expect(card).toBeVisible();

			// Drag the card onto the pricing table.
			const cardBox = await card.boundingBox();
			const targetBox = await block.boundingBox();
			if (!cardBox || !targetBox) throw new Error('expected both the catalog card and the pricing table to have a bounding box');

			await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
			await page.mouse.down();
			await page.waitForTimeout(100);
			await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2 - 15, { steps: 10 });
			await page.waitForTimeout(100);
			await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
			await page.waitForTimeout(100);
			await page.mouse.up();
			await page.waitForTimeout(150);

			const rows = block.locator('.pricing-item-row');
			await expect(rows).toHaveCount(1);
			await expect(rows.nth(0).locator('.pricing-item-name')).toHaveValue('Playwright Catalog Item');
			await expect(rows.nth(0).locator('.pricing-item-line-total')).toHaveText('$150.00');
			// Price still matches the catalog — no indicator yet.
			await expect(rows.nth(0).locator('.pricing-item-price-changed')).toHaveCount(0);

			await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });

			// The catalog's price changes after the row was already inserted.
			const patched = await request.patch(`${BACKEND}/catalog-items/${catalogItem.id}`, { data: { price: 17500 } });
			expect(patched.ok()).toBe(true);

			await page.reload();
			const reloadedBlock = page.locator('.block-pricing-table');
			const reloadedRow = reloadedBlock.locator('.pricing-item-row').nth(0);
			await expect(reloadedRow.locator('.pricing-item-name')).toHaveValue('Playwright Catalog Item');
			// The row's own price is still frozen at insert time...
			await expect(reloadedRow.locator('.pricing-item-line-total')).toHaveText('$150.00');
			// ...but the indicator now flags that the catalog has since moved.
			const indicator = reloadedRow.locator('.pricing-item-price-changed');
			await expect(indicator).toBeVisible();
			await expect(indicator).toHaveAttribute('title', 'Catalog price is now $175.00 (was $150.00 when added)');
		} finally {
			await request.delete(`${BACKEND}/catalog-items/${catalogItem.id}`);
		}
	});
});

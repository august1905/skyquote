import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// §7's pricing/quote blocks, real backend, no mocking — same convention as
// the rest of this suite.
test.describe('Pricing table block', () => {
	test('items, sections, settings toggles, and the live footer total all work and persist', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Package selection' }).click();

		const block = page.locator('.block-pricing-table');
		await expect(block).toBeVisible();
		await block.click(); // selects the block — the "+ Item"/"+ Section" controls only show while selected, same convention Table's own controls follow
		await block.getByRole('button', { name: '+ Item' }).click();
		const rows = block.locator('.pricing-item-row');
		await expect(rows).toHaveCount(1);

		await rows.nth(0).locator('.pricing-item-name').fill('Weekly cleaning');
		await rows.nth(0).locator('.pricing-item-price').fill('100');
		await expect(rows.nth(0).locator('.pricing-item-line-total')).toHaveText('$100.00');

		// A second, optional item that's excluded by default doesn't count
		// toward the footer total, but still shows as its own (struck-through) row.
		await block.getByRole('button', { name: '+ Item' }).click();
		await expect(rows).toHaveCount(2);
		await rows.nth(1).locator('.pricing-item-name').fill('Add-on: windows');
		await rows.nth(1).locator('.pricing-item-price').fill('25');
		await rows.nth(1).getByLabel('Optional').check();
		await rows.nth(1).getByLabel('Included by default').uncheck();
		await expect(rows.nth(1)).toHaveClass(/pricing-item-row-excluded/);

		await expect(block.locator('.pricing-table-footer-total').last()).toContainText('$100.00');

		// A percentage discount on the first item lowers the total.
		await rows.nth(0).getByLabel('Discount', { exact: true }).selectOption('pct');
		await rows.nth(0).getByLabel('Discount value').fill('10');
		await expect(rows.nth(0).locator('.pricing-item-line-total')).toHaveText('$90.00');
		await expect(block.locator('.pricing-table-footer-total').last()).toContainText('$90.00');

		// Hiding the discount column removes it from every row, but the math
		// underneath (already applied) doesn't change.
		await block.getByLabel('Discount column').uncheck();
		await expect(rows.nth(0).getByLabel('Discount', { exact: true })).toHaveCount(0);
		await expect(rows.nth(0).locator('.pricing-item-line-total')).toHaveText('$90.00');

		// Sections group items without deleting anything when removed.
		await block.getByRole('button', { name: '+ Section' }).click();
		await expect(block.locator('.pricing-section-name').first()).toHaveValue('Section 1');
		await block.locator('.pricing-section-name').first().fill('Janitorial');
		await expect(block.locator('.pricing-section-name').first()).toHaveValue('Janitorial');

		await saveNow(page);
		await page.reload();

		const reloadedBlock = page.locator('.block-pricing-table');
		await expect(reloadedBlock.locator('.pricing-item-row')).toHaveCount(2);
		await expect(reloadedBlock.locator('.pricing-item-row').first().locator('.pricing-item-name')).toHaveValue('Weekly cleaning');
		await expect(reloadedBlock.locator('.pricing-table-footer-total').last()).toContainText('$90.00');
	});

});

test.describe('Quote builder block', () => {
	test('groups and options can be added/edited/removed, and the total reflects only selected/required options', async ({ page }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Quote builder' }).click();

		const block = page.locator('.block-quote-builder');
		await expect(block).toBeVisible();
		await block.click(); // selects the block — "+ Group" only shows while selected

		await block.getByRole('button', { name: '+ Group' }).click();
		await expect(block.locator('.quote-group')).toHaveCount(1);
		await block.locator('.quote-group-name').fill('Frequency');
		await block.locator('.quote-group').getByLabel('Required').check();

		await block.locator('.quote-group').getByRole('button', { name: '+ Option' }).click();
		const option = block.locator('.pricing-item-row').first();
		await option.locator('.pricing-item-name').fill('Weekly');
		await option.locator('.pricing-item-price').fill('80');
		await expect(block.locator('.pricing-table-footer-total')).toContainText('$80.00');

		// A second option in the same "pick one" group, marked optional and
		// unselected — excluded from the total until picked.
		await block.locator('.quote-group').getByRole('button', { name: '+ Option' }).click();
		const secondOption = block.locator('.pricing-item-row').nth(1);
		await secondOption.locator('.pricing-item-name').fill('Add-on: supplies');
		await secondOption.locator('.pricing-item-price').fill('15');
		await secondOption.getByLabel('Optional').check();
		await secondOption.getByLabel('Included by default').uncheck();
		await expect(block.locator('.pricing-table-footer-total')).toContainText('$80.00');

		await saveNow(page);
		await page.reload();

		const reloadedBlock = page.locator('.block-quote-builder');
		await expect(reloadedBlock.locator('.pricing-item-row')).toHaveCount(2);
		await expect(reloadedBlock.locator('.pricing-table-footer-total')).toContainText('$80.00');

		// Removing the group removes both of its options too.
		await reloadedBlock.locator('.pricing-item-row').first().click(); // select the block
		await reloadedBlock.getByRole('button', { name: 'Remove group' }).click();
		await expect(reloadedBlock.locator('.quote-group')).toHaveCount(0);
		await expect(reloadedBlock.locator('.pricing-table-footer-total')).toContainText('$0.00');
	});
});

test.describe('Header total (§7.4)', () => {
	test('is hidden with no pricing blocks, then sums every pricing/quote block in the template', async ({ page }) => {
		await openNewTemplate(page);

		await expect(page.locator('.template-editor-header-total')).toHaveCount(0);

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Package selection' }).click();
		const table = page.locator('.block-pricing-table');
		await table.click();
		await table.getByRole('button', { name: '+ Item' }).click();
		await table.locator('.pricing-item-row').first().locator('.pricing-item-price').fill('100');

		await expect(page.locator('.template-editor-header-total')).toHaveText('$100.00');

		// A second pricing block (§7.5: "multiple pricing tables... must sum correctly") adds to the same header total.
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Package selection' }).click();
		const secondTable = page.locator('.block-pricing-table').nth(1);
		await secondTable.click();
		await secondTable.getByRole('button', { name: '+ Item' }).click();
		await secondTable.locator('.pricing-item-row').first().locator('.pricing-item-price').fill('50');

		await expect(page.locator('.template-editor-header-total')).toHaveText('$150.00');

		await saveNow(page);
		await page.reload();
		await expect(page.locator('.template-editor-header-total')).toHaveText('$150.00');
	});
});

import { test, expect } from '@playwright/test';
import { expectBackgroundImageLoads, openNewTemplate, saveNow } from './templateFixture';
import { cleanupFixtureImages, uniqueImageUpload } from './imageLibrary';

// §11's Create Document wizard + the recipient's own public web-link view.
// Real backend, no mocking. The wizard runs as the logged-in admin; the
// recipient's link is then opened from a completely separate, session-less
// browser context to genuinely exercise "no login required" rather than
// relying on the admin's own cookie happening to be harmless there.

test("creating a document produces a per-recipient link that opens with no login, with that role's own field live and the pricing table's frozen total shown @core", async ({ page, context, request }) => {
	await openNewTemplate(page);

	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Client');
	await page.getByRole('button', { name: 'Close roles panel' }).click();

	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Text field' }).click();

	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Pricing table' }).click();
	const table = page.locator('.block-pricing-table');
	await table.click();
	await table.getByRole('button', { name: '+ Item' }).click();
	await table.locator('.pricing-item-row').first().locator('.pricing-item-name').fill('Weekly cleaning');
	await table.locator('.pricing-item-row').first().locator('.pricing-item-price').fill('120');

	// A page background, so the recipient assertion below can prove it survives
	// into their view. Until this was wired, a background was an editor-only
	// effect: an author could set a branded cover and send a document without it.
	const upload = uniqueImageUpload('doc-page-bg');
	await page.getByRole('button', { name: 'Page options' }).click();
	await page.locator('.page-menu-popover').getByRole('button', { name: 'Set background image' }).click();
	const bgPicker = page.getByRole('dialog', { name: 'Choose an image' });
	await bgPicker.getByLabel('Upload images').setInputFiles(upload);
	await bgPicker.locator('.image-tile-highlight .image-tile-select').click({ timeout: 20000 });
	await expectBackgroundImageLoads(page, page.locator('.canvas-page').first());

	await saveNow(page);

	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await expect(wizard.getByRole('heading', { name: 'Create document' })).toBeVisible();

	// Name step — leave the default title as-is.
	await wizard.getByRole('button', { name: 'Next' }).click();

	// Recipients step.
	await page.getByLabel('Client name').fill('Casey Client');
	await page.getByLabel('Client email').fill('casey@example.com');
	await wizard.getByRole('button', { name: 'Next' }).click();

	// Variables step — this template uses none.
	await expect(wizard.getByText("This template doesn't use any variables.")).toBeVisible();
	await wizard.getByRole('button', { name: 'Next' }).click();

	// Pricing step — leave the default qty/selection.
	await expect(wizard.getByText('Weekly cleaning')).toBeVisible();
	await wizard.getByRole('button', { name: 'Next' }).click();

	// Review step.
	await expect(wizard.getByText(/Total:.*\$120\.00/)).toBeVisible();
	await wizard.getByRole('button', { name: 'Create document' }).click();

	const linkInput = page.getByLabel('Casey Client link');
	await expect(linkInput).toBeVisible();
	const link = await linkInput.inputValue();
	expect(link).toMatch(/\/d\/\d+\/.+/);

	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.locator('.wizard-overlay')).toHaveCount(0);

	// Recipient: opens the link from a completely separate, session-less context.
	const recipientContext = await context.browser()!.newContext();
	const recipientPage = await recipientContext.newPage();
	await recipientPage.goto(link);

	await expect(recipientPage.locator('h1')).toBeVisible();
	await expect(recipientPage.getByText('Viewing as Casey Client (Client)')).toBeVisible();

	const fieldInput = recipientPage.locator('.doc-view-field-block input[type="text"]');
	await expect(fieldInput).toBeEnabled();
	await fieldInput.fill('Recipient typed this');
	await expect(fieldInput).toHaveValue('Recipient typed this');

	await expect(recipientPage.locator('.doc-view-pricing-row')).toContainText('Weekly cleaning');
	await expect(recipientPage.locator('.doc-view-pricing-footer-total')).toContainText('$120.00');

	// The page background reaches the recipient, through *their* token-gated URL —
	// the stored `/assets/:id/file` path needs a session they don't have.
	const recipientPageStyle = await recipientPage.locator('.doc-view-page').first().getAttribute('style');
	expect(recipientPageStyle).toMatch(/\/public\/documents\//);
	// Fetched from the recipient's own session-less context, so this proves the
	// token-gated URL genuinely serves them the image rather than just appearing.
	await expectBackgroundImageLoads(recipientPage, recipientPage.locator('.doc-view-page').first());

	// A wrong token on the same document id is rejected, not silently shown.
	const documentId = link.match(/\/d\/(\d+)\//)![1];
	await recipientPage.goto(`/d/${documentId}/not-a-real-token`);
	await expect(recipientPage.getByRole('alert')).toHaveText('This link is invalid or has expired.');

	await recipientContext.close();
	await cleanupFixtureImages(request, [upload]);
});

import { test, expect, type Page } from '@playwright/test';

// The Documents list and the internal document view — real backend, no mocking.
//
// Together they close a real gap: before the list there was no way to find a
// document again (or recover a recipient's link) once the Create Document
// wizard's success screen was closed, and before `/documents/:id` there was no
// way to *read* one — clicking a row opened a modal listing its status and total.

const CONTENT = 'Scope of work: quarterly window cleaning';

/** Creates a template with one line of real content, then a document from it. Returns the document title and the recipient's link. */
async function createDocument(page: Page): Promise<{ title: string; link: string }> {
	await page.goto('/templates');
	await page.getByRole('button', { name: '+ New template' }).click();
	await page.waitForURL(/\/templates\/.+\/edit/);

	// Real content, so the internal view has something to prove it rendered.
	await page.locator('.canvas-block .ProseMirror').first().click();
	await page.keyboard.type(CONTENT);
	await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 10000 });

	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Client');
	await page.getByRole('button', { name: 'Close roles panel' }).click();

	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await wizard.getByRole('button', { name: 'Next' }).click(); // name

	await page.getByLabel('Client name').fill('Casey Client');
	await page.getByLabel('Client email').fill('casey@example.com');
	await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
	await wizard.getByRole('button', { name: 'Next' }).click(); // variables
	await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
	await wizard.getByRole('button', { name: 'Create document' }).click(); // review -> create

	const heading = await page.locator('.wizard-success-heading').textContent();
	const title = heading!.match(/“(.+)”/)![1];
	const link = await page.getByLabel('Casey Client link').inputValue();
	await page.getByRole('button', { name: 'Done' }).click();
	return { title, link };
}

/** Newest first (ORDER BY CREATEDTIME DESC), so the document just created is the first row however much other data this shared backend holds. */
function firstRow(page: Page) {
	return page.locator('.documents-table tbody tr').first();
}

test('a created document shows up in the list and opens as the actual document, in the same tab', async ({ page }) => {
	const { title } = await createDocument(page);

	await page.goto('/documents');
	const row = firstRow(page);
	await expect(row).toContainText(title);
	await expect(row.locator('.documents-status-pill')).toHaveText('Sent');

	await row.getByRole('button', { name: title }).click();

	// Same tab, real route — not a modal over the list.
	await page.waitForURL(/\/documents\/\d+$/);
	await expect(page.locator('.wizard-overlay')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: title })).toBeVisible();

	// The point of the whole change: the document itself is on screen.
	await expect(page.locator('.doc-view-page')).toContainText(CONTENT);

	// Read-only. The recipient's own field would render live in *their* view; here
	// nothing is editable, because staff typing into a customer's signature box
	// would be forging it.
	await expect(page.locator('.doc-view-page [contenteditable="true"]')).toHaveCount(0);

	// And the metadata the old modal carried is still here, beside the document.
	await expect(page.getByText('Casey Client (Client) — Pending')).toBeVisible();
});

test('a lost recipient link can be regenerated from the document, and the old one dies', async ({ page, context }) => {
	const { link: originalLink } = await createDocument(page);

	await page.goto('/documents');
	await firstRow(page).getByRole('button', { name: 'Open' }).click();
	await page.waitForURL(/\/documents\/\d+$/);

	await page.getByRole('button', { name: 'Regenerate link' }).click();
	const newLinkInput = page.getByLabel('Casey Client link');
	await expect(newLinkInput).toBeVisible();
	const newLink = await newLinkInput.inputValue();
	expect(newLink).toMatch(/\/d\/\d+\/.+/);
	expect(newLink).not.toBe(originalLink);

	// A raw token is never stored, so "recover" always means *replace*.
	const recipientContext = await context.browser()!.newContext();
	const recipientPage = await recipientContext.newPage();
	await recipientPage.goto(originalLink);
	await expect(recipientPage.getByRole('alert')).toHaveText('This link is invalid or has expired.');

	await recipientPage.goto(newLink);
	await expect(recipientPage.getByText('Viewing as Casey Client (Client)')).toBeVisible();

	await recipientContext.close();
});

test('Delete really deletes the document, and its recipient link stops working', async ({ page, context }) => {
	const { title, link } = await createDocument(page);

	await page.goto('/documents');
	await firstRow(page).getByRole('button', { name: 'Open' }).click();
	await page.waitForURL(/\/documents\/\d+$/);
	const documentUrl = page.url();

	// Confirms first, and says what it costs — a deleted document's links can be
	// neither recovered nor reissued, because tokens are stored only as hashes.
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText(/Every recipient's link stops working, permanently/)).toBeVisible();
	await page.getByRole('button', { name: 'Keep it' }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();

	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Yes, delete' }).click();
	await page.waitForURL(/\/documents$/);

	// Gone from the list, gone on a direct visit (no archive to fall back to),
	// and gone for the recipient.
	await expect(page.locator('.documents-table tbody tr', { hasText: title })).toHaveCount(0);
	await page.goto(documentUrl);
	await expect(page.getByRole('alert')).toContainText("doesn't exist any more");

	const recipientContext = await context.browser()!.newContext();
	const recipientPage = await recipientContext.newPage();
	await recipientPage.goto(link);
	await expect(recipientPage.getByRole('alert')).toHaveText('This link is invalid or has expired.');
	await recipientContext.close();
});

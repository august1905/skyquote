import { test, expect, type Page } from '@playwright/test';
import { openNewTemplate, saveNow, skipWizardDealStep } from './templateFixture';

// The Documents list and the internal document view — real backend, no mocking.
//
// Together they close a real gap: before the list there was no way to find a
// document again (or recover a recipient's link) once the Create Document
// wizard's success screen was closed, and before `/documents/:id` there was no
// way to *read* one — clicking a row opened a modal listing its status and total.

const CONTENT = 'Scope of work: quarterly window cleaning';

/** Creates a template with one line of real content, then a document from it. Returns the document title and the contact recipient's link. */
async function createDocument(page: Page): Promise<{ title: string; link: string }> {
	await openNewTemplate(page);

	// Real content, so the internal view has something to prove it rendered.
	await page.locator('.canvas-block .ProseMirror').first().click();
	await page.keyboard.type(CONTENT);
	await saveNow(page);

	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await skipWizardDealStep(wizard);
	await wizard.getByRole('button', { name: 'Next' }).click(); // name

	await page.getByLabel('Contact (Signer) name').fill('Casey Client');
	await page.getByLabel('Contact (Signer) email').fill('casey@example.com');
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

	// The metadata the old modal carried lives in the side tab rail now.
	// Recipients opens by default: one row per role — Casey the contact, then
	// the Skyline signer (the logged-in user, whose name varies, so only
	// Casey's row is pinned down).
	const recipientsPanel = page.locator('.recipients-rail-panel');
	await expect(recipientsPanel.locator('.recipients-panel-row')).toHaveCount(2);
	const caseyRow = recipientsPanel.locator('.recipients-panel-row', { hasText: 'Casey Client' });
	await expect(caseyRow.getByText('casey@example.com')).toBeVisible();
	await expect(caseyRow.locator('.recipients-panel-status')).toHaveText('Pending');

	// The audit trail is the other tab: creating the document is its first entry,
	// stamped with who did it — the trail's whole reason to exist.
	await page.getByRole('tab', { name: 'Audit trail' }).click();
	const auditPanel = page.locator('.audit-rail-panel');
	await expect(auditPanel.getByText(/created this document/)).toBeVisible();
	await expect(auditPanel.getByRole('button', { name: 'Export as CSV' })).toBeEnabled();

	// And "22 hours ago"-style timestamps must not say the future: the created
	// event just happened, so it reads as just now — this is the regression
	// guard for the UTC-written / Chicago-read skew that shifted every event
	// 5–6 hours forward.
	await expect(auditPanel.locator('.audit-entry-time').last()).toHaveText('just now');
});

test('a lost recipient link can be regenerated from the document, and the old one dies', async ({ page, context }) => {
	const { link: originalLink } = await createDocument(page);

	await page.goto('/documents');
	await firstRow(page).getByRole('button', { name: 'Open' }).click();
	await page.waitForURL(/\/documents\/\d+$/);

	// Every recipient row has its own Regenerate link button now — Casey's, not
	// the Skyline signer's.
	const caseyRow = page.locator('.recipients-panel-row', { hasText: 'Casey Client' });
	await caseyRow.getByRole('button', { name: 'Regenerate link' }).click();
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
	await expect(recipientPage.getByText('Viewing as Casey Client (Contact (Signer))')).toBeVisible();

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

/**
 * The Documents screen's own `Create document`, which is now the primary way a
 * quote gets made: pick the template, pick the CRM deal, fill in the rest.
 *
 * Distinct from every other document-creating spec here, all of which start
 * inside a template's editor — where the template is already chosen and the
 * wizard never has to ask. This covers the two questions only this entry point
 * asks, and the fact that the second of them can always be declined.
 */
test('Create document on the Documents screen chooses a template, offers the CRM deal step, and creates the document', async ({ page }) => {
	// Unique, so the picker's search lands on this template and not one of the
	// `zz-fixture` rows another worker left behind.
	const name = `zz-fixture-crm-${Date.now()}`;
	await openNewTemplate(page, name);

	await page.locator('.canvas-block .ProseMirror').first().click();
	await page.keyboard.type(CONTENT);
	// Saved before leaving the editor: this flow reads the template back from
	// the server, so unsaved content would simply not be there.
	await saveNow(page);

	await page.goto('/documents');
	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');

	await wizard.getByLabel('Search templates').fill(name);
	await wizard.getByRole('button', { name }).click();

	// Deal step. Asserted as "it's here and it can be declined" rather than "the
	// CRM is down": whether deals actually load depends on a connection
	// configured in the Catalyst console, which is outside this repo and can
	// change without a deploy. A test that asserted the failure would start
	// failing the day the integration started working.
	await expect(wizard.getByLabel('Search deals')).toBeVisible();
	await skipWizardDealStep(wizard);

	await wizard.getByRole('button', { name: 'Next' }).click(); // name
	await page.getByLabel('Contact (Signer) name').fill('Casey Client');
	await page.getByLabel('Contact (Signer) email').fill('casey@example.com');
	await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
	await wizard.getByRole('button', { name: 'Next' }).click(); // variables
	await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
	await wizard.getByRole('button', { name: 'Create document' }).click();

	await expect(page.locator('.wizard-success-heading')).toContainText(name);
	await page.getByRole('button', { name: 'Done' }).click();

	// The list refreshed itself — no reload — because a document was actually created.
	await expect(firstRow(page)).toContainText(name);
});

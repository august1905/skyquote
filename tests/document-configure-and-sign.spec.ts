import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow, skipWizardDealStep } from './templateFixture';

/**
 * Section 1 → section 2: the customer chooses their line items, and the document
 * they then sign contains only what they chose.
 *
 * **What this suite can and cannot prove locally.** Section 1 is pure frontend
 * plus one small save route, so all of it is testable here. Section 2's *confirm*
 * needs SmartBrowz to render the PDF, and SmartBrowz does not work from
 * `catalyst serve` (see PROJECT_CONTEXT.md) — so the confirm button is exercised
 * only as far as its failure path, and the full generate → sign path is verified
 * against the deployed function. See BUILD_STATUS.md.
 *
 * The property that matters most, and the one this file exists to protect: **what
 * the customer saw priced is what reaches the agreement.** An unticked add-on must
 * leave the total in section 1 *and* be absent from section 2, because section 2 is
 * what gets rendered to PDF and signed.
 *
 * Not `@core` — it builds a template and a document, which is expensive.
 *
 * **Why the timeout is raised, measured rather than guessed.** Every test here runs
 * `authorQuoteTemplate` + `createDocumentFor` first: a pricing table with two items,
 * a quote-builder group, a role, a signature block, a save, then the five-step
 * create-document wizard — and only then does the recipient flow start, in a second
 * browser context. On 2026-09-01 the first test failed at the default 30s, and the
 * trace showed **section 1 did not open until 31.78s**: the setup alone had consumed
 * the whole budget, so the section-2 assertion got 0.65s of its 10s instead of
 * failing on its merits. Every section-1 assertion in between had passed.
 *
 * So this is a budget fix, not a retry papering over a flake: the work is genuinely
 * this slow, and it is worst for whichever test runs first while Vite is still
 * compiling and the other worker is competing. Same reasoning and same mechanism as
 * `template-autosave.spec.ts`'s `test.setTimeout(70_000)`.
 */
test.describe.configure({ timeout: 90_000 });

async function addRole(page: import('@playwright/test').Page, name: string) {
	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill(name);
	await page.getByRole('button', { name: 'Close roles panel' }).click();
}

/** A quote with a base service, an optional add-on the recipient may pick, and a signature line. */
async function authorQuoteTemplate(page: import('@playwright/test').Page) {
	await openNewTemplate(page);
	await addRole(page, 'Client');

	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Pricing table' }).click();
	const block = page.locator('.block-pricing-table');
	await block.click();

	await block.getByRole('button', { name: '+ Item' }).click();
	const rows = block.locator('.pricing-item-row');
	await rows.nth(0).locator('.pricing-item-name').fill('Weekly cleaning');
	await rows.nth(0).locator('.pricing-item-price').fill('100');

	await block.getByRole('button', { name: '+ Item' }).click();
	await rows.nth(1).locator('.pricing-item-name').fill('Add-on windows');
	await rows.nth(1).locator('.pricing-item-price').fill('25');
	await rows.nth(1).getByLabel('Optional').check();
	// Optional *and* excluded by default — an add-on the customer opts into, which
	// is the case worth testing: it starts out of the total and has to be able to
	// get in. `Optional` alone leaves it selected, so nothing would change.
	await rows.nth(1).getByLabel('Included by default').uncheck();

	// Without this the customer is shown the quote but cannot change it — the
	// author's switch, and the thing `selectableItemIds` keys off.
	await block.getByLabel('Recipient can pick optional items').check();

	// A signature line is what puts the document into the two-step flow at all;
	// `needsSignature` is deliberately narrower than "has any field".
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Signature' }).click();

	await saveNow(page);
}

async function createDocumentFor(page: import('@playwright/test').Page, name: string, email: string) {
	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await skipWizardDealStep(wizard);
	await wizard.getByRole('button', { name: 'Next' }).click(); // name
	await page.getByLabel('Client name').fill(name);
	await page.getByLabel('Client email').fill(email);
	await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
	await wizard.getByRole('button', { name: 'Next' }).click(); // variables
	await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
	await wizard.getByRole('button', { name: 'Create document' }).click();
	const link = await page.getByLabel(`${name} link`).inputValue();
	await page.getByRole('button', { name: 'Done' }).click();
	return link;
}

test('the customer picks line items in section 1, and only those reach the agreement in section 2', async ({ page, context }) => {
	await authorQuoteTemplate(page);
	const link = await createDocumentFor(page, 'Casey Client', 'casey@example.com');

	const customerContext = await context.browser()!.newContext();
	const customer = await customerContext.newPage();
	await customer.goto(link);

	// --- section 1 ---
	await expect(customer.locator('.doc-view-steps')).toBeVisible();
	const rows = customer.locator('.doc-view-pricing-row');
	// Both rows are on screen, including the add-on that is currently excluded —
	// hiding it would leave nothing to tick, which is the bug this arrangement
	// avoids. Everywhere else (internal reader, print tree) still shows only what's in.
	await expect(rows).toHaveCount(2);
	const addOn = rows.filter({ hasText: 'Add-on windows' });
	await expect(addOn).toHaveClass(/doc-view-pricing-row-excluded/);

	const choice = addOn.locator('.doc-view-pricing-choice');
	await expect(choice).not.toBeChecked();
	await expect(customer.getByText('$100.00').first()).toBeVisible();

	// Ticking it moves the total live, with no round trip.
	await choice.check();
	await expect(addOn).not.toHaveClass(/doc-view-pricing-row-excluded/);
	await expect(customer.locator('.doc-view-continue-summary')).toContainText('$125.00');

	// And unticking puts it back — the state is real, not one-way.
	await choice.uncheck();
	await expect(customer.locator('.doc-view-continue-summary')).toContainText('$100.00');

	// Take the add-on after all, then continue.
	await choice.check();
	await customer.getByRole('button', { name: 'Continue' }).click();

	// --- section 2 ---
	await expect(customer.getByText("This is what you'll sign")).toBeVisible();
	await expect(customer.locator('.doc-view-continue-summary')).toContainText('$125.00');
	// The chooser is gone: section 2 is the configured result, not a set of controls.
	await expect(customer.locator('.doc-view-pricing-choice')).toHaveCount(0);
	await expect(customer.locator('.doc-view-pricing-row')).toHaveCount(2);

	// Back to section 1, decline the add-on, and confirm section 2 drops the row
	// entirely rather than greying it — this is the assertion that maps directly to
	// "only the line items they selected should make it into the PDF".
	await customer.getByRole('button', { name: 'Back' }).click();
	await customer.locator('.doc-view-pricing-row').filter({ hasText: 'Add-on windows' }).locator('.doc-view-pricing-choice').uncheck();
	await customer.getByRole('button', { name: 'Continue' }).click();

	await expect(customer.locator('.doc-view-continue-summary')).toContainText('$100.00');
	await expect(customer.locator('.doc-view-pricing-row')).toHaveCount(1);
	await expect(customer.getByText('Add-on windows')).toHaveCount(0);

	await customerContext.close();
});

test('choices persist across a reload, because the agreement is built from the stored ones', async ({ page, context }) => {
	await authorQuoteTemplate(page);
	const link = await createDocumentFor(page, 'Casey Client', 'casey@example.com');

	const customerContext = await context.browser()!.newContext();
	const customer = await customerContext.newPage();
	await customer.goto(link);

	await customer.locator('.doc-view-pricing-row').filter({ hasText: 'Add-on windows' }).locator('.doc-view-pricing-choice').check();
	await customer.getByRole('button', { name: 'Continue' }).click();
	await expect(customer.getByText("This is what you'll sign")).toBeVisible();

	// Continue is what saves. The PDF is built server-side from the *stored*
	// selections, so a reload showing something different would mean the customer
	// could be shown one configuration and sign another.
	await customer.reload();
	const addOn = customer.locator('.doc-view-pricing-row').filter({ hasText: 'Add-on windows' });
	await expect(addOn.locator('.doc-view-pricing-choice')).toBeChecked();
	await expect(customer.locator('.doc-view-continue-summary')).toContainText('$125.00');

	await customerContext.close();
});

test('a signing document offers no Submit button, since submitting would look like signing', async ({ page, context }) => {
	// `submitDocumentFields` marks the recipient `completed`, and this page renders
	// `completed` on a signature document as "Signed" — so a Submit button here was
	// a way to appear signed without signing.
	await authorQuoteTemplate(page);
	const link = await createDocumentFor(page, 'Casey Client', 'casey@example.com');

	const customerContext = await context.browser()!.newContext();
	const customer = await customerContext.newPage();
	await customer.goto(link);

	await expect(customer.getByRole('button', { name: 'Continue' })).toBeVisible();
	await expect(customer.getByRole('button', { name: 'Submit' })).toHaveCount(0);
	// Declining stays available at every point — it always must.
	await expect(customer.getByRole('button', { name: 'Decline' })).toBeVisible();

	await customerContext.close();
});

test('confirming in section 2 fails honestly when the PDF cannot be rendered, and does not lock the document', async ({ page, context }) => {
	// Locally SmartBrowz never works, so this is the failure branch by construction.
	// What matters is that it says so and leaves the customer able to go back and
	// change their mind, rather than half-locking the quote.
	await authorQuoteTemplate(page);
	const link = await createDocumentFor(page, 'Casey Client', 'casey@example.com');

	const customerContext = await context.browser()!.newContext();
	const customer = await customerContext.newPage();
	await customer.goto(link);
	await customer.getByRole('button', { name: 'Continue' }).click();
	await customer.getByRole('button', { name: 'Confirm and sign' }).click();

	// Either outcome is accepted so the spec doesn't invert if it's ever run where
	// SmartBrowz works; what's asserted is that it reaches a terminal state.
	const settled = customer.locator('.doc-view-error, .signing-overlay, .doc-view-sign-bar-signed');
	await expect(settled.first()).toBeVisible({ timeout: 120_000 });

	if (await customer.locator('.doc-view-error').count()) {
		// Still section 2, still reversible.
		await expect(customer.getByRole('button', { name: 'Back' })).toBeEnabled();
		await expect(customer.getByRole('button', { name: 'Confirm and sign' })).toBeEnabled();
	}

	await customerContext.close();
});

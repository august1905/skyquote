import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow, skipWizardDealStep } from './templateFixture';

/**
 * **A signature box on a real document must never be a local toggle.**
 *
 * That is the whole point of this file, and it is a different concern from the
 * line-item flow in `document-configure-and-sign.spec.ts`: this one covers a
 * document with *nothing to choose*, which is the plainest possible case and the
 * one the original bug appeared in.
 *
 * A document nobody had sent used to render the template editor's "Preview as
 * role" toggle to the recipient — a box that flipped to "✓ Signature added" and
 * recorded nothing. It reads as a dead button, and if believed it means both sides
 * think a document is signed when it isn't.
 *
 * **Updated 2026-08-31 for the two-step flow.** This spec used to assert on the
 * create-document wizard's auto-send status, because signing was set up the moment
 * a document was created. It no longer is — the PDF has to be rendered from the
 * customer's choices, so the send moved to the end of section 1. The box-honesty
 * assertions below are unchanged in substance; only where they happen moved.
 *
 * Deliberately not `@core`: it builds a template and a document.
 */

async function addRole(page: import('@playwright/test').Page, name: string) {
	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill(name);
	await page.getByRole('button', { name: 'Close roles panel' }).click();
}

test('a signature field on a document that never reached Zoho Sign says so, and is not a fake toggle', async ({ page, context }) => {
	await openNewTemplate(page);
	await addRole(page, 'Client');

	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Signature' }).click();
	// Required, because a required signature field used to block Submit forever once
	// its local toggle stopped existing — see DocumentView's `isRequiredFieldMissing`.
	await page.locator('.field-block').first().click();
	await page.getByLabel('Required').check();
	await page.locator('.field-settings-popover').getByRole('button', { name: 'Done' }).click();

	await saveNow(page);

	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await skipWizardDealStep(wizard);
	await wizard.getByRole('button', { name: 'Next' }).click(); // name
	await page.getByLabel('Client name').fill('Casey Client');
	await page.getByLabel('Client email').fill('casey@example.com');
	await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
	await wizard.getByRole('button', { name: 'Next' }).click(); // variables
	await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
	await wizard.getByRole('button', { name: 'Create document' }).click();

	const link = await page.getByLabel('Casey Client link').inputValue();
	expect(link).toContain('/d/');
	await page.getByRole('button', { name: 'Done' }).click();

	const recipientContext = await context.browser()!.newContext();
	const recipientPage = await recipientContext.newPage();
	await recipientPage.goto(link);

	// Nothing has been sent to Zoho Sign — the send happens when the customer
	// confirms at section 2, not at creation — so the box must say exactly that.
	const signatureBox = recipientPage.locator('.doc-view-field-block .field-block-box');
	await expect(signatureBox).toBeVisible();
	await expect(signatureBox).toHaveText(/not ready for signing yet/i);

	// The assertion that guards the original bug: whatever this box says, it must
	// not be something the recipient can press and mistake for signing.
	await expect(recipientPage.locator('.doc-view-field-block button')).toHaveCount(0);
	await expect(recipientPage.getByText('Click to add signature')).toHaveCount(0);
	await expect(recipientPage.getByText('✓ Signature added')).toHaveCount(0);
	// No invitation to sign either, since there is nothing to sign yet.
	await expect(recipientPage.locator('.doc-view-sign-bar-signed')).toHaveCount(0);
	await expect(recipientPage.getByRole('button', { name: 'Sign this document' })).toHaveCount(0);

	// With nothing optional in the document there is nothing to choose, so section 1
	// is a read-through — but it still exists, and Continue is the way out of it.
	await expect(recipientPage.locator('.doc-view-steps')).toContainText('Review your quote');
	await expect(recipientPage.getByRole('button', { name: 'Continue' })).toBeEnabled();

	// A required signature field must not hold anything hostage: it is satisfied in
	// the signing panel and recorded by the webhook, never by this page's own form.
	await expect(recipientPage.getByText(/Fill in before submitting/)).toHaveCount(0);
	// And Submit is deliberately absent on a signing document — it marks the
	// recipient `completed`, which this page renders as "Signed".
	await expect(recipientPage.getByRole('button', { name: 'Submit' })).toHaveCount(0);

	await recipientContext.close();
});

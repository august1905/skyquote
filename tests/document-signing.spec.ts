import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow, skipWizardDealStep } from './templateFixture';

/**
 * Signature fields on a real document — the flow that had no e2e coverage at all
 * while the bug it exists to catch was live.
 *
 * **What this suite can and cannot prove locally.** Handing a document to Zoho
 * Sign needs SmartBrowz to render it first, and SmartBrowz does not work from
 * `catalyst serve` (see PROJECT_CONTEXT.md) — so against the local backend the
 * automatic send always fails. That makes this suite a test of the two things
 * that *must* hold when it does:
 *
 * 1. the document is still created, intact, links and all; and
 * 2. an unsigned signature box says so instead of offering a fake toggle.
 *
 * (2) is the whole reason this file exists. A document nobody had sent used to
 * render the template editor's "Preview as role" toggle to the recipient: a box
 * that flipped to "✓ Signature added" and recorded nothing. It reads as a broken
 * button, and if believed it means both sides think a document is signed when it
 * isn't.
 *
 * The *success* path — a live signature request, `awaitingSignature: true` and a
 * `sign.zoho.com` panel framed in the document — is verified against the deployed
 * function, which is the only place SmartBrowz runs. See BUILD_STATUS.md.
 *
 * Deliberately not `@core`: creating a template and a document, then loading a
 * recipient link, is one of the more expensive specs in the suite, and every call
 * is a real Data Store round trip.
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
	// Required, because a required signature field used to block Submit forever
	// once its local toggle stopped existing — see DocumentView's
	// `isRequiredFieldMissing`.
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
	await wizard.getByRole('button', { name: 'Create document' }).click(); // review -> create

	// The document exists and its links are usable *before* signing has settled —
	// that ordering is the point. Signing is allowed to fail; losing the quote
	// somebody just wrote is not.
	const link = await page.getByLabel('Casey Client link').inputValue();
	expect(link).toContain('/d/');

	// Locally this resolves to the failure branch (no SmartBrowz). Either terminal
	// outcome is accepted so the spec doesn't invert if it's ever run somewhere
	// SmartBrowz works; what's asserted is that it *reaches* one and names it.
	const settled = page.locator('.wizard-signing-sent, .wizard-signing-failed');
	await expect(settled).toBeVisible({ timeout: 120_000 });
	const failed = await page.locator('.wizard-signing-failed').count();
	if (failed) {
		// The retry has to be findable, or a document sits unsignable in silence.
		await expect(page.getByText(/Send for signature/)).toBeVisible();
	}

	await page.getByRole('button', { name: 'Done' }).click();

	const recipientContext = await context.browser()!.newContext();
	const recipientPage = await recipientContext.newPage();
	await recipientPage.goto(link);

	const signatureBox = recipientPage.locator('.doc-view-field-block .field-block-box');
	await expect(signatureBox).toBeVisible();

	if (failed) {
		await expect(signatureBox).toHaveText(/not ready for signing yet/i);
		// The assertion that guards the original bug: whatever this box says, it must
		// not be something the recipient can press and mistake for signing.
		await expect(recipientPage.locator('.doc-view-field-block button')).toHaveCount(0);
		await expect(recipientPage.getByText('Click to add signature')).toHaveCount(0);
		await expect(recipientPage.locator('.doc-view-sign-bar')).toHaveCount(0);
	} else {
		await expect(signatureBox).toHaveText(/click to add your signature/i);
		await expect(recipientPage.locator('.doc-view-sign-bar')).toBeVisible();
	}

	// A required signature field must not hold Submit hostage either way: it's
	// satisfied in the signing panel and recorded by the webhook, not by this form.
	await expect(recipientPage.getByRole('button', { name: 'Submit' })).toBeEnabled();
	await expect(recipientPage.getByText(/Fill in before submitting/)).toHaveCount(0);

	await recipientContext.close();
});

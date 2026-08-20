import { test, expect } from '@playwright/test';

// The recipient document view's submit/decline flow, on top of the Create
// Document wizard already covered in template-editor-create-document.spec.ts.
// Real backend, no mocking — each recipient opens their link from a
// completely separate, session-less browser context.

async function newTemplate(page: import('@playwright/test').Page) {
	await page.goto('/templates');
	await page.getByRole('button', { name: '+ New template' }).click();
	await page.waitForURL(/\/templates\/.+\/edit/);
}

async function addRole(page: import('@playwright/test').Page, name: string) {
	await page.getByRole('button', { name: 'Recipients / Roles' }).click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill(name);
	await page.getByRole('button', { name: 'Close roles panel' }).click();
}

test('a recipient must fill required fields before submitting, and the document completes once every recipient has', async ({ page, context }) => {
	await newTemplate(page);
	await addRole(page, 'Client');
	await addRole(page, 'Sales Rep');

	// Client's field is required.
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Text field' }).click();
	await page.locator('.field-block').first().click();
	await page.getByLabel('Required').check();
	await page.locator('.field-settings-popover').getByRole('button', { name: 'Done' }).click();

	// Sales Rep's field is not required.
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByLabel('Fields for').selectOption({ label: 'Sales Rep' });
	await page.getByRole('menuitem', { name: 'Checkbox' }).click();

	await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 5000 });

	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await wizard.getByRole('button', { name: 'Next' }).click(); // name

	await page.getByLabel('Client name').fill('Casey Client');
	await page.getByLabel('Client email').fill('casey@example.com');
	await page.getByLabel('Sales Rep name').fill('Sam Rep');
	await page.getByLabel('Sales Rep email').fill('sam@example.com');
	await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
	await wizard.getByRole('button', { name: 'Next' }).click(); // variables
	await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
	await wizard.getByRole('button', { name: 'Create document' }).click(); // review -> create

	const clientLink = await page.getByLabel('Casey Client link').inputValue();
	const repLink = await page.getByLabel('Sam Rep link').inputValue();
	await page.getByRole('button', { name: 'Done' }).click();

	// Client opens their link: Submit is disabled until the required field is filled.
	const clientContext = await context.browser()!.newContext();
	const clientPage = await clientContext.newPage();
	await clientPage.goto(clientLink);

	const submitButton = clientPage.getByRole('button', { name: 'Submit' });
	await expect(submitButton).toBeDisabled();
	await expect(clientPage.getByText(/Fill in before submitting/)).toBeVisible();

	const clientField = clientPage.locator('.doc-view-field-block input[type="text"]');
	await clientField.fill('Please clean on Tuesdays');
	await expect(submitButton).toBeEnabled();
	await submitButton.click();

	await expect(clientPage.getByText('Thanks — your responses have been submitted.')).toBeVisible();
	await expect(clientPage.getByText('· Submitted')).toBeVisible();
	await expect(clientField).toBeDisabled(); // frozen read-only after submit
	await expect(clientField).toHaveValue('Please clean on Tuesdays');

	// Reloading shows the same submitted state and value, persisted server-side.
	await clientPage.reload();
	await expect(clientPage.getByText('· Submitted')).toBeVisible();
	await expect(clientPage.locator('.doc-view-field-block input[type="text"]')).toHaveValue('Please clean on Tuesdays');

	// Sales Rep opens their link — no required field, Submit is enabled immediately.
	const repContext = await context.browser()!.newContext();
	const repPage = await repContext.newPage();
	await repPage.goto(repLink);
	await expect(repPage.getByRole('button', { name: 'Submit' })).toBeEnabled();
	await repPage.getByRole('button', { name: 'Submit' }).click();
	await expect(repPage.getByText('· Submitted')).toBeVisible();

	await clientContext.close();
	await repContext.close();
});

test('a recipient can decline a document with no fields of their own', async ({ page, context }) => {
	await newTemplate(page);
	await addRole(page, 'Client');

	await page.getByRole('button', { name: 'Create document' }).click();
	const wizard = page.locator('.wizard-card');
	await wizard.getByRole('button', { name: 'Next' }).click(); // name

	await page.getByLabel('Client name').fill('Casey Client');
	await page.getByLabel('Client email').fill('casey@example.com');
	await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
	await wizard.getByRole('button', { name: 'Next' }).click(); // variables
	await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
	await wizard.getByRole('button', { name: 'Create document' }).click(); // review -> create

	const link = await page.getByLabel('Casey Client link').inputValue();
	await page.getByRole('button', { name: 'Done' }).click();

	const recipientContext = await context.browser()!.newContext();
	const recipientPage = await recipientContext.newPage();
	await recipientPage.goto(link);

	await expect(recipientPage.getByRole('button', { name: 'Submit' })).toBeEnabled();
	recipientPage.once('dialog', (dialog) => void dialog.accept());
	await recipientPage.getByRole('button', { name: 'Decline' }).click();

	await expect(recipientPage.getByText('You declined this document.')).toBeVisible();
	await expect(recipientPage.getByText('· Declined')).toBeVisible();

	await recipientContext.close();
});

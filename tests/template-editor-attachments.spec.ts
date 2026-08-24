import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { openNewTemplate, saveNow } from './templateFixture';

// §3's Attachments panel: "files appended to generated documents." Real
// backend, real uploads — the file goes through POST /assets/files into Stratus
// and comes back out through the token-gated public asset route a recipient
// uses, so mocking either end would leave the only interesting part untested.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_FIXTURE = path.join(__dirname, 'fixtures', 'test-attachment.pdf');

async function newTemplate(page: Page) {
	await openNewTemplate(page);
}

async function openAttachments(page: Page) {
	await page.getByRole('button', { name: 'Attachments' }).click();
	await expect(page.locator('.attachments-panel')).toBeVisible();
}

test.describe('Attachments (§3)', () => {
	test('uploads a file, renames it, persists through a reload, and undo removes it', async ({ page }) => {
		await newTemplate(page);
		await openAttachments(page);
		await expect(page.locator('.attachments-panel')).toContainText('No attachments yet');

		await page.getByLabel('Add attachment').setInputFiles(PDF_FIXTURE);
		const item = page.locator('.attachments-item').first();
		await expect(item).toBeVisible();
		await expect(item.locator('.attachments-item-meta')).toContainText('test-attachment.pdf');
		// The fixture is a few hundred bytes, so it reports in B — the size is
		// shown at all, in a sensible unit, which is what matters here.
		await expect(item.locator('.attachments-item-meta')).toContainText(/\d+ B$/);

		// Attaching is a body command like any other, so it undoes. Checked
		// *before* the reload below on purpose: undo history deliberately doesn't
		// survive a reload (`loadTemplate` clears it), so asserting it afterwards
		// would be testing the wrong thing — and did, at first.
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.locator('.attachments-item')).toHaveCount(0);
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect(page.locator('.attachments-item')).toHaveCount(1);

		// §3's rename: a recipient should see "Certificate of insurance", not a
		// scanner's filename. The display name changes; the filename doesn't.
		await item.getByLabel('Name for test-attachment.pdf').fill('Certificate of insurance');
		await expect(item.locator('.attachments-item-meta')).toContainText('test-attachment.pdf');

		await saveNow(page);
		await page.reload();
		await openAttachments(page);
		await expect(page.locator('.attachments-item input')).toHaveValue('Certificate of insurance');
	});

	test('refuses a file whose bytes are not one of the accepted formats, and says why', async ({ page }) => {
		await newTemplate(page);
		await openAttachments(page);

		// A .pdf name over bytes that are not a PDF. The backend identifies files
		// from their signature, never the filename or Content-Type, so this is
		// rejected — and the panel shows the backend's own message rather than a
		// generic failure, because that message names the real constraint.
		await page.getByLabel('Add attachment').setInputFiles({
			name: 'not-really.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('MZ\x90\x00 this is not a pdf'),
		});

		await expect(page.locator('.attachments-panel-error')).toContainText('Only PDF, image');
		await expect(page.locator('.attachments-item')).toHaveCount(0);
	});

	test('an attached file reaches the recipient as a download on their document', async ({ page, context }) => {
		await newTemplate(page);

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await page.getByRole('button', { name: '+ Add role' }).click();
		await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Client');
		await page.getByRole('button', { name: 'Close roles panel' }).click();

		await openAttachments(page);
		await page.getByLabel('Add attachment').setInputFiles(PDF_FIXTURE);
		await page.locator('.attachments-item').first().getByLabel('Name for test-attachment.pdf').fill('Scope of work');
		await page.getByRole('button', { name: 'Close attachments panel' }).click();
		await saveNow(page);

		await page.getByRole('button', { name: 'Create document' }).click();
		const wizard = page.locator('.wizard-card');
		await wizard.getByRole('button', { name: 'Next' }).click(); // name
		await page.getByLabel('Client name').fill('Casey Client');
		await page.getByLabel('Client email').fill('casey@example.com');
		await wizard.getByRole('button', { name: 'Next' }).click(); // recipients
		await wizard.getByRole('button', { name: 'Next' }).click(); // variables
		await wizard.getByRole('button', { name: 'Next' }).click(); // pricing
		await wizard.getByRole('button', { name: 'Create document' }).click();

		const clientLink = await page.getByLabel('Casey Client link').inputValue();
		await page.getByRole('button', { name: 'Done' }).click();

		// A genuinely session-less context: the recipient has no login, which is
		// exactly why the download can't use /assets/:id/file.
		const clientContext = await context.browser()!.newContext();
		const clientPage = await clientContext.newPage();
		try {
			await clientPage.goto(clientLink);

			const attachments = clientPage.locator('.doc-view-attachments');
			await expect(attachments).toBeVisible();
			// Shown under its display name, not the filename.
			const link = attachments.getByRole('link', { name: 'Scope of work' });
			await expect(link).toBeVisible();

			// The bytes actually arrive — fetched from inside the recipient's own
			// unauthenticated context, so this proves the token-gated route serves
			// them without a session.
			const result = await clientPage.evaluate(async (href) => {
				const response = await fetch(href, { credentials: 'include' });
				const buffer = await response.arrayBuffer();
				return { status: response.status, magic: new TextDecoder().decode(buffer.slice(0, 5)), bytes: buffer.byteLength };
			}, (await link.getAttribute('href')) as string);

			expect(result.status).toBe(200);
			expect(result.magic).toBe('%PDF-');
			expect(result.bytes).toBeGreaterThan(0);
		} finally {
			await clientContext.close();
		}
	});
});

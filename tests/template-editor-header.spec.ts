import { test, expect, type Page } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// §3 ①'s header bar: the object-type badge, the folder metadata chip and its
// move-to-folder dialog, the role avatar stack + Manage, the ⋮ overflow's seven
// items, and §11.1's rule that validation errors block "Create document".
//
// Real backend, no mocking. Duplicate, Move, Delete and Version history all
// write to the live Data Store, so each test cleans up the rows it creates where
// a route exists to do so.

async function newTemplate(page: Page) {
	await openNewTemplate(page);
	return /templates\/([^/]+)\/edit/.exec(page.url())?.[1] ?? '';
}

async function openTemplateMenu(page: Page) {
	await page.getByRole('button', { name: 'More template actions' }).click();
}

async function fromTemplateMenu(page: Page, item: string) {
	await openTemplateMenu(page);
	await page.getByRole('menuitem', { name: item }).click();
}

async function addRole(page: Page, name: string) {
	await page.getByRole('button', { name: 'Recipients / Roles' }).first().click();
	await page.getByRole('button', { name: '+ Add role' }).click();
	await page.locator('.roles-panel-row').last().getByLabel('Role name').fill(name);
	await page.getByRole('button', { name: 'Close roles panel' }).click();
}

test.describe('Header bar (§3 ①)', () => {
	test('shows the object-type badge and the folder chip, and moving through the chip persists', async ({ page }) => {
		await newTemplate(page);

		await expect(page.locator('.header-type-badge')).toHaveText('TEMPLATES');
		// A new template is at the root, which is a real state rather than a
		// missing folder — so the chip names it rather than showing nothing.
		const chip = page.locator('.header-folder-chip');
		await expect(chip).toContainText('All templates');

		await chip.click();
		const dialog = page.getByRole('dialog', { name: 'Move template' });
		await expect(dialog).toBeVisible();

		// Create a folder and move into it in one step — the common case when a
		// template is being filed for the first time.
		const folderName = `zz-hdr-folder-${Date.now()}`;
		await dialog.getByLabel('New folder name').fill(folderName);
		await dialog.getByRole('button', { name: 'Create and move' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(chip).toContainText(folderName);

		// The move went through PATCH, so it survives a reload — and, being
		// metadata only, it must not have bumped the version into a conflict.
		await page.reload();
		await expect(page.locator('.header-folder-chip')).toContainText(folderName);
		await expect(page.locator('.template-editor-conflict-banner')).toHaveCount(0);

		// And back to the root, which is the case a naive "only set a folder"
		// implementation gets wrong.
		await page.locator('.header-folder-chip').click();
		await page.getByRole('dialog', { name: 'Move template' }).getByRole('button', { name: /^All templates/ }).click();
		await expect(page.locator('.header-folder-chip')).toContainText('All templates');
	});

	test('the role avatar stack shows initials per role and Manage opens the roles panel', async ({ page }) => {
		await newTemplate(page);
		// A new template is seeded with two roles, so the stack shows their two
		// chips from the start rather than sitting empty.
		await expect(page.locator('.role-avatar-chip')).toHaveCount(2);

		await addRole(page, 'Casey Client');
		await addRole(page, 'Sales Rep');

		const chips = page.locator('.role-avatar-chip');
		await expect(chips).toHaveCount(4);
		// The stack reads in signing order, so the added roles land after the
		// seeded pair.
		await expect(chips.nth(2)).toHaveText('CC');
		await expect(chips.nth(3)).toHaveText('SR');
		// The initials alone aren't reachable by anything but sight.
		await expect(chips.nth(2)).toHaveAttribute('aria-label', 'Casey Client');

		// §3: Manage "opens role management panel" — the same rail panel the 👥
		// icon opens, not a second copy of it.
		await page.getByRole('button', { name: 'Manage' }).click();
		await expect(page.locator('.roles-panel')).toBeVisible();
	});

	test('the ⋮ overflow offers all seven of §3’s items', async ({ page }) => {
		await newTemplate(page);
		await openTemplateMenu(page);

		for (const item of ['Duplicate', 'Rename', 'Move', 'Export PDF', 'Version history', 'Settings', 'Delete']) {
			await expect(page.getByRole('menuitem', { name: item })).toBeVisible();
		}

		// Escape closes it, like every other transient surface (§13).
		await page.keyboard.press('Escape');
		await expect(page.locator('.header-overflow-menu')).toHaveCount(0);
	});

	test('Rename focuses the inline name field, and Move opens the same dialog the chip does', async ({ page }) => {
		await newTemplate(page);

		// §3's "Rename" *is* the inline header field, not a separate dialog.
		await fromTemplateMenu(page, 'Rename');
		const nameInput = page.getByLabel('Template name');
		await expect(nameInput).toBeVisible();
		await nameInput.fill('Renamed from the menu');
		await nameInput.press('Enter');
		await expect(page.locator('.template-name-display')).toContainText('Renamed from the menu');

		await fromTemplateMenu(page, 'Move');
		await expect(page.getByRole('dialog', { name: 'Move template' })).toBeVisible();
	});

	test('Duplicate creates a separate copy carrying the content, and leaves the original alone', async ({ page }) => {
		const originalId = await newTemplate(page);
		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Content worth duplicating');
		await saveNow(page);

		await fromTemplateMenu(page, 'Duplicate');

		// Lands in the copy — the point of duplicating is to work on it.
		await page.waitForURL((url) => /\/templates\/.+\/edit/.test(url.pathname) && !url.pathname.includes(originalId));
		const copyId = /templates\/([^/]+)\/edit/.exec(page.url())?.[1] ?? '';
		expect(copyId).not.toBe(originalId);
		await expect(page.locator('.template-name-display')).toContainText('Copy of');
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Content worth duplicating');

		// The original is untouched, which a copy-by-reference bug would break.
		await page.goto(`/templates/${originalId}/edit`);
		await expect(page.locator('.template-name-display')).not.toContainText('Copy of');
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Content worth duplicating');
	});

	test('Delete confirms first, then the template is gone @core', async ({ page }) => {
		const id = await newTemplate(page);

		await openTemplateMenu(page);
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		// One click doesn't delete — this is the only item here that ends the
		// editing session.
		await expect(page.getByText('Delete this template?')).toBeVisible();
		await page.getByRole('button', { name: 'Keep it' }).click();
		await expect(page.getByText('Delete this template?')).toHaveCount(0);

		// The menu is still open, so it isn't reopened here — toggling the ⋮
		// button again would close it.
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Yes, delete' }).click();
		await page.waitForURL(/\/templates$/);

		// Really gone — the row, its versions, its comments and its body.
		await page.goto(`/templates/${id}/edit`);
		await expect(page.getByText("Couldn't load this template.")).toBeVisible();
	});

	test('Version history saves a labelled checkpoint and restores it, keeping the current state recoverable', async ({ page }) => {
		await newTemplate(page);
		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('The original wording');
		await saveNow(page);

		await fromTemplateMenu(page, 'Version history');
		const dialog = page.getByRole('dialog', { name: 'Version history' });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('No saved versions yet');

		await dialog.getByLabel('Version label').fill('Before the rewrite');
		await dialog.getByRole('button', { name: 'Save a version' }).click();
		await expect(dialog.getByText('Before the rewrite')).toBeVisible();
		await dialog.getByRole('button', { name: 'Close' }).click();

		// Rewrite the text, and wait for it to actually reach the server — the
		// restore has to have something to undo.
		await editor.click();
		await page.keyboard.press('End');
		for (let i = 0; i < 'The original wording'.length; i += 1) await page.keyboard.press('Backspace');
		await page.keyboard.type('Completely different wording');
		// "Saving…" used to appear here on its own, back when a 1.5s debounce fired
		// after every pause in typing. On a 30s interval the honest intermediate
		// state is "Unsaved changes" — which is still worth asserting, because it
		// proves the edit registered as dirty before the flush below sends it.
		await expect(page.locator('.template-editor-autosave-status')).toHaveText('Unsaved changes');
		await saveNow(page);

		await fromTemplateMenu(page, 'Version history');
		await page.getByRole('dialog', { name: 'Version history' }).getByRole('button', { name: 'Restore' }).first().click();

		// The canvas shows the restored content...
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('The original wording');
		// ...and the state that was replaced is itself now a version, so the
		// restore didn't destroy anything.
		await expect(page.getByRole('dialog', { name: 'Version history' })).toContainText('Before restore');
	});

	test('Create document is blocked while the template has a validation error, and the tooltip says why', async ({ page }) => {
		await newTemplate(page);
		const createButton = page.getByRole('button', { name: 'Create document' });
		await expect(createButton).toBeEnabled();

		// Two fields sharing a name is an `error`-severity issue (§9.4), which
		// §3/§11.1 say must block document creation. New fields are auto-numbered
		// ("Signature 1", "Initials 1"), so the collision has to be forced by
		// renaming — the same way template-editor-validation.spec.ts does it.
		// Both fields default to the seeded 'Contact (Signer)' role; any role
		// will do here, so none is added.
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Signature' }).click();
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Initials' }).click();

		await page.locator('.field-block').nth(1).click();
		await page.locator('.field-settings-popover').getByLabel('Field name').fill('Signature 1');
		await page.locator('.field-settings-popover').getByRole('button', { name: 'Done' }).click();

		await expect(createButton).toBeDisabled();
		await expect(createButton).toHaveAttribute('title', /Fix .* first:/);

		// Clearing the collision re-enables it — the gate tracks live state
		// rather than latching on the first error it ever saw.
		await page.locator('.field-block').nth(1).click();
		await page.locator('.field-settings-popover').getByLabel('Field name').fill('Initials for the client');
		await page.locator('.field-settings-popover').getByRole('button', { name: 'Done' }).click();
		await expect(createButton).toBeEnabled();
	});
});

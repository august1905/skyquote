import { test, expect, type Page } from '@playwright/test';
import { SHARED_USER } from './auth-storage-state';
import { openNewTemplate } from './templateFixture';

// §12's comments: "anchored to a block or a text range, threaded, resolvable,
// @-mentions. Sidebar toggled from the header icon."
//
// Real backend, no mocking — every assertion here goes through the live
// `Comments` table. A browser is also the only place the text-range half can be
// verified at all: the anchor is a pair of ProseMirror positions and the
// highlight is a ProseMirror decoration, neither of which exists outside a real
// editor (see template-editor-toolbar.spec.ts's note on jsdom).

async function newTemplateWithText(page: Page, text: string) {
	await openNewTemplate(page);
	const editor = page.locator('.canvas-block .ProseMirror').first();
	await editor.click();
	await page.keyboard.type(text);
	await expect(editor).toContainText(text);
	return editor;
}

/** Opens the selected block's ⋯ overflow and starts a comment on it. */
async function startCommentFromOverflow(page: Page) {
	await page.getByRole('button', { name: 'More block actions' }).click();
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
}

async function selectFirstBlock(page: Page) {
	await page.locator('.canvas-block').first().click();
}

test.describe('Comments (§12)', () => {
	test('a block comment posts, threads a reply, resolves, reopens, and survives a reload @core', async ({ page }) => {
		await newTemplateWithText(page, 'Pricing summary');
		await selectFirstBlock(page);
		await startCommentFromOverflow(page);

		// Starting a comment reveals the sidebar on its own — that's where the
		// composer lives, so requiring the icon to be clicked first would make
		// the ⋯ entry point look broken.
		const sidebar = page.locator('.comments-sidebar');
		await expect(sidebar).toBeVisible();
		await page.getByLabel('Comment', { exact: true }).fill('Is this the current rate?');
		await page.getByRole('button', { name: 'Post comment' }).click();

		const thread = page.locator('.comment-thread').first();
		await expect(thread).toContainText('Is this the current rate?');
		await expect(thread).toContainText(`${SHARED_USER.firstName} ${SHARED_USER.lastName}`);

		// Threaded: the reply lands in the same card, not as a second thread.
		await thread.getByRole('button', { name: 'Reply', exact: true }).click();
		await page.getByLabel('Reply', { exact: true }).fill('Yes, checked this morning');
		await page.getByRole('button', { name: 'Post reply' }).click();
		await expect(thread).toContainText('Yes, checked this morning');
		await expect(page.locator('.comment-thread')).toHaveCount(1);

		// Resolvable, and reversible — §12 says resolvable, not deletable.
		await thread.getByRole('button', { name: 'Resolve' }).click();
		await expect(page.locator('.comment-thread')).toHaveCount(0);
		await page.getByRole('button', { name: /Show 1 resolved/ }).click();
		await expect(page.locator('.comment-thread-resolved')).toHaveCount(1);
		await page.getByRole('button', { name: 'Reopen' }).click();

		// The whole point of a comment is that it outlives the session.
		await page.reload();
		await page.getByRole('button', { name: 'Comments' }).click();
		const reloaded = page.locator('.comment-thread').first();
		await expect(reloaded).toContainText('Is this the current rate?');
		await expect(reloaded).toContainText('Yes, checked this morning');
		await expect(reloaded).toContainText('2 messages');

		// Clean up after itself — unlike the templates the suite leaves behind,
		// comments have a delete route, so there's no reason to accumulate them.
		await reloaded.getByRole('button', { name: 'Delete thread' }).click();
		await expect(page.locator('.comment-thread')).toHaveCount(0);
	});

	test('deleting a thread takes its replies with it, not just the first message', async ({ page }) => {
		await newTemplateWithText(page, 'Terms and conditions');
		await selectFirstBlock(page);
		await startCommentFromOverflow(page);
		await page.getByLabel('Comment', { exact: true }).fill('Root question');
		await page.getByRole('button', { name: 'Post comment' }).click();

		const thread = page.locator('.comment-thread').first();
		await thread.getByRole('button', { name: 'Reply', exact: true }).click();
		await page.getByLabel('Reply', { exact: true }).fill('An answer');
		await page.getByRole('button', { name: 'Post reply' }).click();
		await expect(thread).toContainText('2 messages');

		await thread.getByRole('button', { name: 'Delete thread' }).click();
		await expect(page.locator('.comment-thread')).toHaveCount(0);

		// Reloaded rather than trusted: the reply's removal happens server-side
		// (a cascade in the DELETE route), so only a fresh fetch proves it.
		// An orphaned reply would come back as nothing at all — groupIntoThreads
		// drops it — so the count is checked from the badge, which reads the raw
		// comment list.
		await page.reload();
		await page.getByRole('button', { name: 'Comments' }).click();
		await expect(page.locator('.comments-sidebar')).toContainText('No open comments');
		await expect(page.locator('.comments-header-badge')).toHaveCount(0);
	});

	test('a comment on selected text highlights that passage, and clicking it opens the thread', async ({ page }) => {
		const editor = await newTemplateWithText(page, 'The quick brown fox');

		// Triple-click for the same reason the toolbar spec does it: it goes
		// through ProseMirror's own mouse handling, so the selection lands in
		// its *state* — which is where the anchor positions come from.
		await editor.click({ clickCount: 3 });
		await startCommentFromOverflow(page);
		await expect(page.locator('.comments-new-thread-target')).toContainText('selected text');
		await page.getByLabel('Comment', { exact: true }).fill('Reword this line');
		await page.getByRole('button', { name: 'Post comment' }).click();

		// The highlight is a decoration, so it exists in the rendered editor
		// without the stored doc having changed — asserted below.
		const highlight = page.locator('.comment-highlight').first();
		await expect(highlight).toBeVisible();
		await expect(highlight).toContainText('The quick brown fox');
		await expect(page.locator('.comment-thread-location')).toContainText('selected text');

		// Deselect, then click the highlighted text: that alone should focus the
		// thread again.
		await page.getByRole('button', { name: 'Close comments' }).click();
		await expect(page.locator('.comments-sidebar')).toHaveCount(0);
		await highlight.click();
		await expect(page.locator('.comment-thread-active')).toContainText('Reword this line');

		// A comment must never dirty the template: the anchor lives outside the
		// block tree entirely, so there's nothing for autosave to send.
		await expect(page.locator('.template-editor-autosave-status')).not.toHaveText('Saving…');

		await page.locator('.comment-thread').first().getByRole('button', { name: 'Delete thread' }).click();
	});

	test('the @ picker filters colleagues, inserts one, and the mention renders as a mention', async ({ page }) => {
		await newTemplateWithText(page, 'Scope of work');
		await selectFirstBlock(page);
		await startCommentFromOverflow(page);

		const composer = page.getByLabel('Comment', { exact: true });
		await composer.fill('Can you check this, @Shared');
		// Filtered by what's typed after the @, not the whole list.
		const option = page.getByRole('option', { name: `${SHARED_USER.firstName} ${SHARED_USER.lastName}` });
		await expect(option).toBeVisible();
		await option.click();
		await expect(composer).toHaveValue(`Can you check this, @${SHARED_USER.firstName} ${SHARED_USER.lastName} `);

		await page.getByRole('button', { name: 'Post comment' }).click();
		// Stored as plain text and picked out at render time — so the mention is
		// styled without the body being markup.
		await expect(page.locator('.comment-mention')).toHaveText(`@${SHARED_USER.firstName} ${SHARED_USER.lastName}`);

		await page.locator('.comment-thread').first().getByRole('button', { name: 'Delete thread' }).click();
	});

	test('the header badge counts unresolved threads, and Escape closes the sidebar', async ({ page }) => {
		await newTemplateWithText(page, 'Assumptions');
		await expect(page.locator('.comments-header-badge')).toHaveCount(0);

		await selectFirstBlock(page);
		await startCommentFromOverflow(page);
		await page.getByLabel('Comment', { exact: true }).fill('First open question');
		await page.getByRole('button', { name: 'Post comment' }).click();
		await expect(page.locator('.comments-header-badge')).toHaveText('1');

		// A reply is not a second thing needing attention.
		const thread = page.locator('.comment-thread').first();
		await thread.getByRole('button', { name: 'Reply', exact: true }).click();
		await page.getByLabel('Reply', { exact: true }).fill('Noted');
		await page.getByRole('button', { name: 'Post reply' }).click();
		await expect(page.locator('.comments-header-badge')).toHaveText('1');

		await thread.getByRole('button', { name: 'Resolve' }).click();
		await expect(page.locator('.comments-header-badge')).toHaveCount(0);

		// §13's keyboard rule applies to this panel like every other surface.
		await page.keyboard.press('Escape');
		await expect(page.locator('.comments-sidebar')).toHaveCount(0);

		await page.getByRole('button', { name: 'Comments' }).click();
		await page.getByRole('button', { name: /Show 1 resolved/ }).click();
		await page.locator('.comment-thread').first().getByRole('button', { name: 'Delete thread' }).click();
	});

	test('a comment can be edited by its author, and says so afterwards', async ({ page }) => {
		await newTemplateWithText(page, 'Payment terms');
		await selectFirstBlock(page);
		await startCommentFromOverflow(page);
		await page.getByLabel('Comment', { exact: true }).fill('Origianl typo here');
		await page.getByRole('button', { name: 'Post comment' }).click();

		const thread = page.locator('.comment-thread').first();
		await thread.getByRole('button', { name: 'Edit' }).click();
		await page.getByLabel('Edit comment', { exact: true }).fill('Original, fixed');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect(thread).toContainText('Original, fixed');
		await expect(thread.locator('.comment-edited')).toHaveText('edited');

		await thread.getByRole('button', { name: 'Delete thread' }).click();
	});
});

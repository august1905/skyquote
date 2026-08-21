import { test, expect, type Page } from '@playwright/test';
import { SHARED_USER } from './auth-storage-state';

// §12's comments: "anchored to a block or a text range, threaded, resolvable,
// @-mentions. Sidebar toggled from the header icon."
//
// Real backend, no mocking — every assertion here goes through the live
// `Comments` table. A browser is also the only place the text-range half can be
// verified at all: the anchor is a pair of ProseMirror positions and the
// highlight is a ProseMirror decoration, neither of which exists outside a real
// editor (see template-editor-toolbar.spec.ts's note on jsdom).

async function newTemplateWithText(page: Page, text: string) {
	await page.goto('/templates');
	await page.getByRole('button', { name: '+ New template' }).click();
	await page.waitForURL(/\/templates\/.+\/edit/);
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
	test('a block comment posts, threads a reply, resolves, reopens, and survives a reload', async ({ page }) => {
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

	test('a text anchor that no longer fits its block degrades to the block instead of highlighting the wrong words', async ({ page }) => {
		const editor = await newTemplateWithText(page, 'Delete me entirely please');
		const templateId = /templates\/([^/]+)\/edit/.exec(page.url())?.[1];
		await editor.click({ clickCount: 3 });
		await startCommentFromOverflow(page);
		await page.getByLabel('Comment', { exact: true }).fill('About this passage');
		await page.getByRole('button', { name: 'Post comment' }).click();
		await expect(page.locator('.comment-highlight')).toHaveCount(1);

		// Cut the text down so the stored range runs past the end of the block.
		// Nothing maintains those offsets across sessions, so this is the drift
		// case the sidebar has to be honest about rather than silently
		// highlighting whatever now sits at those positions.
		//
		// Deleted key by key from the end rather than triple-click-and-retype: a
		// triple-click here lands on the comment highlight's own span and does
		// *not* reliably reselect the paragraph, so the replacement text appended
		// instead ("Delete me entirely pleaseShort") — which left the anchor
		// legitimately in bounds and made this test fail while the feature was
		// working correctly. Instrumented and confirmed before changing it.
		await editor.click();
		await page.keyboard.press('End');
		for (let i = 0; i < 'Delete me entirely please'.length; i += 1) await page.keyboard.press('Backspace');
		await expect(editor).toHaveText('');

		// The shortened text has to be on the *server* before reloading, or the
		// block comes back with its original wording and the anchor is legitimately
		// still in bounds — the test would then fail for a reason unrelated to
		// drift. Two weaker waits were tried first and both lied: "All changes
		// saved" was already true from the earlier save, and waiting for the next
		// PUT resolved on a save that was already in flight with the old body. So
		// this polls the stored template until it really holds the new text.
		await expect
			.poll(
				() =>
					page.evaluate(async (id) => {
						const response = await fetch(`/api/templates/${id}`, { credentials: 'include' });
						const data = await response.json();
						return JSON.stringify(data.body?.pages?.[0]?.blocks?.[0]?.doc ?? {});
					}, templateId),
				{ timeout: 15000 }
			)
			.not.toContain('Delete me entirely');

		await page.reload();
		await page.getByRole('button', { name: 'Comments' }).click();
		await expect(page.locator('.comment-thread-location')).toContainText('text has changed');
		await expect(page.locator('.comment-highlight')).toHaveCount(0);
		// The comment itself is untouched — the anchor is best-effort, the body
		// is the durable record.
		await expect(page.locator('.comment-thread')).toContainText('About this passage');

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

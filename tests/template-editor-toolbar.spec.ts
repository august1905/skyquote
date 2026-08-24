import { test, expect, type Locator, type Page } from '@playwright/test';
import { openNewTemplate, saveNow } from './templateFixture';

// §2's contextual formatting toolbar and §9.3's keyboard shortcuts. Real
// backend, no mocking. These two features share a spec because they share
// their whole substrate — the "active rich text editor" ref and the command
// stack — and because a browser is the only place either can be verified at
// all: jsdom can't reliably host ProseMirror (see BUILD_STATUS.md's phase-1
// step-7 note), so every assertion about a mark actually landing has to run
// here rather than in a unit test.

async function newTemplateWithText(page: Page, text: string) {
	await openNewTemplate(page);
	const editor = page.locator('.canvas-block .ProseMirror').first();
	await editor.click();
	await page.keyboard.type(text);
	await expect(editor).toContainText(text);
	return editor;
}

/**
 * A fresh text block on the template that's already open, for the next scenario
 * in the same test.
 *
 * Scenarios used to take a whole new template each — a create, an editor load
 * and a cascade delete apiece, all to get an empty paragraph to type into. A
 * block costs nothing until autosave, and starts just as clean.
 */
async function addTextBlock(page: Page, text: string) {
	await page.getByRole('button', { name: '+ Add block' }).click();
	await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
	const editor = page.locator('.canvas-block .ProseMirror').last();
	await editor.click();
	await page.keyboard.type(text);
	await expect(editor).toContainText(text);
	return editor;
}

/**
 * Selects the paragraph via a triple-click, which goes through ProseMirror's
 * own mouse handling and so is guaranteed to land in its *state*.
 *
 * Deliberately not `Cmd+A`: instrumenting the editor showed that after a
 * plain click into a block, a subsequent Cmd+A produced a browser-level DOM
 * selection spanning the text while ProseMirror's own state selection stayed
 * collapsed — so mark commands operated on an empty range. That mismatch is a
 * property of how the key reaches ProseMirror, not of the toolbar, and these
 * tests are about the toolbar.
 */
async function selectParagraph(page: Page, editor?: Locator) {
	await (editor ?? page.locator('.canvas-block .ProseMirror').first()).click({ clickCount: 3 });
}

/** Selects the paragraph, opens §2's `…` overflow group, and chooses one item. */
async function applyFromOverflow(page: Page, item: string, editor?: Locator) {
	await selectParagraph(page, editor);
	await page.getByRole('button', { name: 'More formatting' }).click();
	await page.getByRole('button', { name: item, exact: true }).click();
}

test.describe('Formatting toolbar (§2)', () => {
	test('is disabled until a text block is focused, then applies marks that survive a reload', async ({ page }) => {
		await openNewTemplate(page);

		// §2: "must disable rather than hide irrelevant controls, so the
		// layout doesn't jump" — present but inert before anything is focused.
		const bold = page.getByRole('button', { name: 'Bold' });
		await expect(bold).toBeVisible();
		await expect(bold).toBeDisabled();
		await expect(page.getByLabel('Paragraph style')).toBeDisabled();

		const editor = page.locator('.canvas-block .ProseMirror').first();
		await editor.click();
		await page.keyboard.type('Formatted text');
		await expect(bold).toBeEnabled();

		await selectParagraph(page);
		await bold.click();
		await expect(editor.locator('strong')).toHaveText('Formatted text');
		// The button reflects the caret's own state, which is what makes the
		// toolbar feel live rather than write-only.
		await expect(bold).toHaveAttribute('aria-pressed', 'true');

		await selectParagraph(page);
		await page.getByRole('button', { name: 'Italic' }).click();
		await page.getByRole('button', { name: 'Underline' }).click();
		await expect(editor.locator('em')).toHaveCount(1);
		await expect(editor.locator('u')).toHaveCount(1);

		await saveNow(page);
		await page.reload();

		const reloaded = page.locator('.canvas-block .ProseMirror').first();
		await expect(reloaded.locator('strong')).toHaveText('Formatted text');
		await expect(reloaded.locator('em')).toHaveCount(1);
		await expect(reloaded.locator('u')).toHaveCount(1);
	});

	test('paragraph style, alignment and lists all apply and report back the caret’s current state', async ({ page }) => {
		const editor = await newTemplateWithText(page, 'Section title');

		const style = page.getByLabel('Paragraph style');
		await expect(style).toHaveValue('paragraph');
		await style.selectOption('heading1');
		await expect(editor.locator('h1')).toHaveText('Section title');
		await expect(style).toHaveValue('heading1');

		// Quote wraps whatever it's applied to, so this also covers the
		// detection-order case the unit tests pin down: both blockquote and
		// paragraph report active at once, and the dropdown must say Quote.
		await style.selectOption('blockquote');
		await expect(editor.locator('blockquote')).toHaveCount(1);
		await expect(style).toHaveValue('blockquote');

		await style.selectOption('paragraph');
		await expect(editor.locator('blockquote')).toHaveCount(0);
		await expect(editor.locator('h1')).toHaveCount(0);

		await page.getByRole('button', { name: 'Align center' }).click();
		await expect(editor.locator('[style*="text-align: center"]')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Align center' })).toHaveAttribute('aria-pressed', 'true');

		// Indent is list-scoped (see EditorToolbar's own note) and says so by
		// staying disabled until there's a list to indent within.
		await expect(page.getByRole('button', { name: 'Increase indent' })).toBeDisabled();
		await page.getByRole('button', { name: 'Bulleted list' }).click();
		await expect(editor.locator('ul li')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Increase indent' })).toBeEnabled();

		await page.getByRole('button', { name: 'Numbered list' }).click();
		await expect(editor.locator('ol li')).toHaveCount(1);
		await expect(editor.locator('ul')).toHaveCount(0);
	});

	test('font size/colour, the overflow group, Clear formatting (selected and collapsed), and links', async ({ page }) => {
		const editor = await newTemplateWithText(page, 'Styled run');

		await selectParagraph(page);
		// A number box plus a slider, not a six-option dropdown — every integer from
		// 8 to 100 is reachable, including sizes the old list simply didn't have.
		await page.getByLabel('Font size', { exact: true }).fill('41');
		await expect(editor.locator('[style*="font-size: 41px"]')).toHaveCount(1);

		// The slider drives the same mark, and the number box follows it.
		await selectParagraph(page);
		await page.getByLabel('Font size slider').fill('72');
		await expect(editor.locator('[style*="font-size: 72px"]')).toHaveCount(1);
		await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('72');

		// With a caret and no selection, a size still applies to the block. Both
		// commands otherwise only set ProseMirror *stored marks* — they'd change
		// what gets typed next and nothing already on screen, while reporting
		// success, so the slider would look broken (see FontSizeControl).
		await editor.click();
		await page.getByLabel('Font size', { exact: true }).fill('9');
		await expect(editor.locator('[style*="font-size: 9px"]')).toHaveCount(1);

		// Reset is a distinct state from any size: it unsets the mark so the text
		// follows the Theme panel again, which no slider position can express. Run
		// from a caret too, for the same reason.
		await editor.click();
		await page.getByRole('button', { name: 'Reset font size to theme' }).click();
		await expect(editor.locator('[style*="font-size"]')).toHaveCount(0);
		// And with nothing left to reset, it says so rather than sitting there inert.
		await expect(page.getByRole('button', { name: 'Reset font size to theme' })).toBeDisabled();

		await selectParagraph(page);
		await page.getByLabel('Font family').selectOption('Georgia, serif');
		await expect(editor.locator('[style*="Georgia"]')).toHaveCount(1);

		await selectParagraph(page);
		await page.getByLabel('Line spacing').selectOption('2');
		await expect(editor.locator('[style*="line-height: 2"]')).toHaveCount(1);

		// §2's `…` overflow group. Each item needs its own selection, and the
		// menu dismisses on choosing one, so it gets reopened each time.
		await applyFromOverflow(page, 'Strikethrough');
		await expect(editor.locator('s')).toHaveCount(1);
		// Dismissing on selection matters: the menu overhangs the canvas, so
		// leaving it open would cover the text being formatted.
		await expect(page.getByRole('button', { name: 'Strikethrough' })).toHaveCount(0);

		await applyFromOverflow(page, 'Highlight');
		await expect(editor.locator('mark')).toHaveCount(1);

		await applyFromOverflow(page, 'Superscript');
		await expect(editor.locator('sup')).toHaveCount(1);

		await selectParagraph(page);
		await page.getByRole('button', { name: 'Clear formatting' }).click();
		for (const tag of ['s', 'mark', 'sup']) {
			await expect(editor.locator(tag)).toHaveCount(0);
		}
		await expect(editor).toContainText('Styled run');

		// Clear formatting with a *collapsed* caret, on its own block. Tiptap's
		// unsetAllMarks only touches non-empty ranges, so without the explicit
		// whole-block fallback in EditorToolbar this button reported success and
		// changed nothing — found by instrumenting a real browser.
		const boldBlock = await addTextBlock(page, 'Bolded line');
		await selectParagraph(page, boldBlock);
		await page.getByRole('button', { name: 'Bold' }).click();
		await expect(boldBlock.locator('strong')).toHaveCount(1);
		await boldBlock.click();
		await page.getByRole('button', { name: 'Clear formatting' }).click();
		await expect(boldBlock.locator('strong')).toHaveCount(0);
		await expect(boldBlock).toContainText('Bolded line');

		// Links, again on their own block. The control collects its URL through
		// window.prompt (see EditorToolbar's note on why), so the dialog has to be
		// answered.
		const linkBlock = await addTextBlock(page, 'Our website');
		page.once('dialog', (dialog) => void dialog.accept('https://skylineclean.com'));
		await selectParagraph(page, linkBlock);
		await page.getByRole('button', { name: 'Insert link' }).click();
		await expect(linkBlock.locator('a')).toHaveAttribute('href', 'https://skylineclean.com');

		page.once('dialog', (dialog) => void dialog.accept(''));
		await selectParagraph(page, linkBlock);
		await page.getByRole('button', { name: 'Insert link' }).click();
		await expect(linkBlock.locator('a')).toHaveCount(0);
	});
});

test.describe('Keyboard shortcuts (§9.3)', () => {
	test('Cmd+D duplicates and Backspace deletes the selected block, but Backspace while typing does not', async ({ page }) => {
		await newTemplateWithText(page, 'Original');
		const blocks = page.locator('.canvas-block');
		await expect(blocks).toHaveCount(1);

		// Backspace with the caret in text is an ordinary character delete —
		// the block must survive. This is the guard that makes the shortcut
		// safe to have at all.
		await page.keyboard.press('Backspace');
		await expect(blocks).toHaveCount(1);
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Origina');

		await page.keyboard.press('ControlOrMeta+d');
		await expect(blocks).toHaveCount(2);

		// Step out of text-edit first, so Backspace addresses the block.
		await page.keyboard.press('Escape');
		await page.keyboard.press('Backspace');
		await expect(blocks).toHaveCount(1);
	});

	test('Escape steps out of text-edit first and only deselects on a second press', async ({ page }) => {
		await newTemplateWithText(page, 'Selected block');

		// Clicking into the block both selects it and enters text-edit, so its
		// floating toolbar is showing.
		const blockToolbar = page.locator('.canvas-block-toolbar');
		await expect(blockToolbar).toBeVisible();

		// First press leaves text-edit but keeps the block selected.
		await page.keyboard.press('Escape');
		await expect(blockToolbar).toBeVisible();
		await expect(page.locator('.canvas-block-selected')).toHaveCount(1);

		// Second press clears the selection entirely.
		await page.keyboard.press('Escape');
		await expect(page.locator('.canvas-block-selected')).toHaveCount(0);
		await expect(blockToolbar).toHaveCount(0);
	});

	test('Escape dismissing the "[" insert picker keeps the caret in the block rather than stepping out', async ({ page }) => {
		const editor = await newTemplateWithText(page, 'Before ');

		// The picker and Escape-to-step-out both want Escape. The picker has to
		// win while it's open, or dismissing it would also throw away the caret
		// the user is about to keep typing at. ProseMirror preventDefaults
		// Escape unconditionally, so this ordering is enforced through its
		// keymap (see escapeToBlur.ts) rather than by inspecting the event.
		await page.keyboard.type('[');
		const picker = page.locator('.rt-suggestion-list');
		await expect(picker).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(picker).toHaveCount(0);

		// Still in text-edit: typing lands in the block, no re-click needed.
		await page.keyboard.type('after');
		await expect(editor).toContainText('after');

		// And Escape now does step out, since the picker is no longer claiming it.
		await page.keyboard.press('Escape');
		await expect(page.locator('.canvas-block-selected')).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(page.locator('.canvas-block-selected')).toHaveCount(0);
	});

	test('Cmd+S saves immediately instead of waiting out the 30s autosave interval', async ({ page }) => {
		await newTemplateWithText(page, 'Force saved');

		// Asserting on the network rather than the status label: a PUT landing
		// within a second of the keypress can only have come from the forced
		// flush, since the debounce alone wouldn't have fired yet. The status
		// text would be ambiguous here — it can still read "All changes saved"
		// from the template's creation while the new edit is pending.
		const save = page.waitForRequest((request) => request.method() === 'PUT' && request.url().includes('/templates/'), { timeout: 1000 });
		await page.keyboard.press('ControlOrMeta+s');
		await save;

		await expect(page.locator('.template-editor-autosave-status')).toHaveText('All changes saved', { timeout: 8000 });
		await page.reload();
		await expect(page.locator('.canvas-block .ProseMirror').first()).toContainText('Force saved');
	});

	test('Cmd+P toggles previewing as a role on and off', async ({ page }) => {
		await openNewTemplate(page);

		// The toggle only exists once there's a role to preview as.
		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await page.getByRole('button', { name: '+ Add role' }).click();
		await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Client');
		await page.getByRole('button', { name: 'Close roles panel' }).click();

		const previewSelect = page.locator('.preview-role-toggle select');
		await expect(previewSelect).toHaveValue('');

		await page.keyboard.press('ControlOrMeta+p');
		await expect(previewSelect).not.toHaveValue('');
		await expect(page.locator('.preview-role-toggle-active')).toHaveCount(1);

		await page.keyboard.press('ControlOrMeta+p');
		await expect(previewSelect).toHaveValue('');
	});
});

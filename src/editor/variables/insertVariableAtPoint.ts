import { richTextEditorAtPoint } from '../richtext/activeRichTextEditor';

/**
 * Drops a merge field into whatever sentence is under the pointer.
 *
 * The Variables panel's click path inserts at the caret, which is only useful
 * if the author put a caret somewhere first — and useless for the thing Grayson
 * asked for (2026-09-03): "ESSENTIAL to be able to drag the merge fields to a
 * specific spot." Aimed at text, the specific spot is a position *in* that text
 * — "Dear [Client.FirstName]," is a chip mid-sentence, not a new block above the
 * paragraph.
 *
 * `posAtCoords` is ProseMirror's own coordinate→position mapping, so the chip
 * lands between the same two characters the pointer sat between, which is the
 * only definition of "here" the author would accept.
 *
 * Returns false when the pointer isn't over an editable rich-text editor, and
 * the caller falls back to placing a block on the page.
 */
export function insertVariableAtPoint(pointer: { x: number; y: number }, variableKey: string): boolean {
	const editor = richTextEditorAtPoint(pointer.x, pointer.y);
	if (!editor) return false;
	const coords = editor.view.posAtCoords({ left: pointer.x, top: pointer.y });
	if (!coords) return false;
	return editor
		.chain()
		// Focus so the insertion is also where typing continues — the chip is
		// rarely the last thing the author wanted to write there.
		.focus()
		.insertContentAt(coords.pos, { type: 'variable', attrs: { key: variableKey, fallback: null } })
		.run();
}

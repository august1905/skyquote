import { Extension } from '@tiptap/core';

/**
 * §9.3's Escape, for the half that happens *inside* a text editor: "Step out
 * of text-edit → block select". Blurring leaves the block itself selected,
 * so a second Escape (handled by `useEditorShortcuts`, outside any editor)
 * clears the selection.
 *
 * This is a ProseMirror keyboard shortcut rather than a case in the
 * document-level listener, and that's the whole point: ProseMirror calls
 * `preventDefault` on Escape *unconditionally* — verified by instrumenting a
 * real browser — so a document-level handler has no way to tell "the `[`
 * insert picker just consumed this Escape" from "nothing did". Going through
 * the keymap makes the ordering explicit instead of guessable: `priority`
 * below puts this after `InsertSuggestion`'s own plugin, so when the picker
 * is open it claims Escape first and the caret stays put, which is what
 * dismissing a picker should do.
 */
export const EscapeToBlur = Extension.create({
	name: 'escapeToBlur',
	// Lower than the default 100, so this extension's keymap is registered
	// after InsertSuggestion's plugin and therefore consulted after it.
	priority: 50,
	addKeyboardShortcuts() {
		return {
			Escape: () => {
				// Blurs the DOM node directly rather than calling Tiptap's own
				// `commands.blur()`, which defers the actual blur to a
				// requestAnimationFrame. With that deferral, pressing Escape
				// twice in quick succession (step out, then deselect) leaves
				// the second press still seeing a focused editor, so it gets
				// swallowed and the block never deselects.
				this.editor.view.dom.blur();
				window.getSelection()?.removeAllRanges();
				return true;
			},
		};
	},
});

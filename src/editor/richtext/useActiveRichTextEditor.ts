import type { Editor } from '@tiptap/core';
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import {
	getActiveRichTextEditor,
	getActiveRichTextEditorVersion,
	subscribeActiveRichTextEditor,
} from './activeRichTextEditor';

/**
 * The active editor, as a React value that re-renders its consumer on both
 * kinds of change §2's toolbar cares about:
 *
 * 1. **Which** editor is active — the module-level version counter, via
 *    `useSyncExternalStore`.
 * 2. **What's selected inside it** — the editor's own `transaction` event.
 *    Without this, every toolbar button's active/disabled state would be
 *    frozen at whatever it was when the editor first became active: moving
 *    the caret from bold text to plain text wouldn't un-light the Bold
 *    button, because nothing else in React's tree re-renders on a caret move.
 *
 * Kept out of `activeRichTextEditor.ts` so that module stays React-free, the
 * plain-module-ref character its own comment describes.
 */
export function useActiveRichTextEditor(): Editor | null {
	useSyncExternalStore(subscribeActiveRichTextEditor, getActiveRichTextEditorVersion, getActiveRichTextEditorVersion);
	const editor = getActiveRichTextEditor();
	const [, bumpOnTransaction] = useReducer((n: number) => n + 1, 0);

	useEffect(() => {
		if (!editor) return;
		editor.on('transaction', bumpOnTransaction);
		return () => {
			editor.off('transaction', bumpOnTransaction);
		};
	}, [editor]);

	return editor;
}

import type { Editor } from '@tiptap/core';

/**
 * The Variables panel's "click inserts at caret" (§3) needs to target
 * whichever of the many per-block/per-cell Tiptap instances the user was
 * last working in — clicking a rail panel button necessarily blurs that
 * editor first. A plain module-level ref (not editor-store state) is
 * deliberate: this doesn't need React re-renders on change, only "read the
 * latest value at click time", and keeping a live `Editor` class instance out
 * of the Zustand/Immer-managed store sidesteps any question of Immer trying
 * to walk/freeze it (see blockTree.ts's `snapshot()` for how sharp Immer's
 * freezing edges already turned out to be for plain data).
 */
let active: Editor | null = null;

export function setActiveRichTextEditor(editor: Editor | null): void {
	active = editor;
}

export function getActiveRichTextEditor(): Editor | null {
	return active;
}

import type { Editor } from '@tiptap/core';

/**
 * The Variables panel's "click inserts at caret" (§3) and §2's contextual
 * formatting toolbar both need to target whichever of the many per-block/
 * per-cell Tiptap instances the user was last working in — clicking a rail
 * panel button or a toolbar button necessarily blurs that editor first. A
 * plain module-level ref (not editor-store state) is deliberate: keeping a
 * live `Editor` class instance out of the Zustand/Immer-managed store
 * sidesteps any question of Immer trying to walk/freeze it (see
 * blockTree.ts's `snapshot()` for how sharp Immer's freezing edges already
 * turned out to be for plain data).
 *
 * **Deliberately never cleared on blur.** A toolbar button click blurs the
 * editor before its own handler runs, so "last focused" — not "currently
 * focused" — is the only thing either consumer can usefully act on. The
 * consequence, stated plainly rather than left as a surprise: the toolbar
 * stays enabled after you click out of a text block, until something else
 * takes focus. §2's "only enabled when a text selection or editable block is
 * focused" is honored for the case that actually matters (nothing focused yet
 * on a fresh load ⇒ disabled), not interpreted so literally that the toolbar
 * would disable itself the instant you reached for it.
 *
 * A subscription is layered on top because the toolbar has to *re-render*
 * when the active editor changes — unlike the Variables panel, which only
 * ever reads the latest value at click time. `useSyncExternalStore` over a
 * monotonic version counter is enough; nothing needs the editor identity
 * itself to be a React value.
 */
let active: Editor | null = null;
/**
 * Which block owns {@link active}. Needed by §12's "comment on the selected
 * text": an editor instance alone doesn't say which block's stored doc its
 * positions are relative to, and a range captured against one block is
 * meaningless against another. Tracked here rather than derived later because
 * only the editor's owner knows the answer.
 */
let activeOwnerBlockId: string | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
	version += 1;
	for (const listener of listeners) listener();
}

export function setActiveRichTextEditor(editor: Editor | null, ownerBlockId: string | null = null): void {
	if (active === editor && activeOwnerBlockId === ownerBlockId) return;
	active = editor;
	activeOwnerBlockId = ownerBlockId;
	emit();
}

/** The block id whose editor is currently active, or null. Paired with {@link getActiveRichTextEditor} — check both before trusting a captured selection. */
export function getActiveRichTextEditorOwnerBlockId(): string | null {
	if (active?.isDestroyed) return null;
	return activeOwnerBlockId;
}

/**
 * Called when an editor unmounts (block deleted, page switched, table cell
 * removed). Without this, the ref would keep pointing at a destroyed
 * ProseMirror instance whose commands silently do nothing — a stale toolbar
 * that looks enabled and simply doesn't work.
 */
export function clearActiveRichTextEditorIf(editor: Editor): void {
	if (active === editor) setActiveRichTextEditor(null);
}

/** Returns null rather than a destroyed editor — belt-and-braces alongside {@link clearActiveRichTextEditorIf}, since an editor can be destroyed without its owner's cleanup having run yet. */
export function getActiveRichTextEditor(): Editor | null {
	if (active?.isDestroyed) return null;
	return active;
}

export function subscribeActiveRichTextEditor(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getActiveRichTextEditorVersion(): number {
	return version;
}

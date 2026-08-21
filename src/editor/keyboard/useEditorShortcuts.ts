import { useEffect } from 'react';
import { deleteBlock, duplicateBlock } from '../commands';
import { findBlockById } from '../commands/blockTree';
import { getActiveRichTextEditor } from '../richtext/activeRichTextEditor';
import { useEditorStore } from '../store/editorStore';
import { isTextEntryTarget, matchEditorShortcut } from './matchEditorShortcut';

interface UseEditorShortcutsOptions {
	/** §9.3's `Cmd+S`: "Force save (never let the browser save dialog appear)." Owned by `useAutosave`, so it's passed in. */
	onForceSave: () => void;
}

/**
 * §9.3's keyboard layer, wired to the same store actions the header buttons
 * and floating block toolbar already use — so a shortcut and its button are
 * never two implementations of one behavior.
 *
 * One document-level `keydown` listener rather than per-component handlers:
 * most of these have to work whether focus is in a Tiptap instance, on a
 * block, or nowhere in particular, and `Cmd+S`/`Cmd+P`/`Cmd+D` additionally
 * need `preventDefault` before the browser's own save/print/bookmark dialog
 * opens. Reads store state through `getState()` rather than subscribed
 * values: this listener is registered once and must always see current
 * state, never a value closed over at registration time.
 *
 * **`Cmd+Z` reaches the command stack directly, with no ProseMirror history
 * to fall through first.** §9.1 asks for the two to be bridged ("Cmd+Z in
 * text-edit mode goes to PM history first, then falls through to the
 * block-level stack") — that bridge is unnecessary here because this app
 * disables Tiptap's own `undoRedo` entirely (see `richTextExtensions.ts`),
 * making the command stack the only history that exists. Coalescing is what
 * delivers the behavior §9.1 actually wanted from the bridge: a burst of
 * typing is one undo entry, so Cmd+Z in text-edit mode undoes a word's worth
 * of typing rather than the whole block's previous state.
 *
 * Shortcuts deliberately **not** handled here:
 * - `Cmd+B/I/U` — Tiptap's StarterKit keymap already owns them inside an
 *   editor, which is the only place they mean anything.
 * - `[` — already built, as a ProseMirror suggestion plugin (`insertSuggestion.ts`).
 * - `/` at the start of an empty line (§9.3's block menu) — would need a
 *   second suggestion plugin and its own menu UI; "+ Add block" and the `[`
 *   picker already cover inserting blocks and inline nodes respectively, so
 *   this is a convenience, not a missing capability.
 */
export function useEditorShortcuts({ onForceSave }: UseEditorShortcutsOptions): void {
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			// Defer to anything closer to the keystroke that already dealt with
			// it. This listener is on `document`, so it runs *after* every
			// inner handler — including ProseMirror's, which calls
			// preventDefault whenever one of its own plugins claims a key. The
			// concrete case this protects: Escape dismissing the `[` insert
			// picker (`insertSuggestion.ts`) would otherwise also reach
			// 'stepOut' below and blur the editor, throwing away the caret the
			// user was about to keep typing at.
			const action = matchEditorShortcut({
				key: event.key,
				metaKey: event.metaKey,
				ctrlKey: event.ctrlKey,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				inTextEntry: isTextEntryTarget(event.target),
			});
			if (!action) return;

			const store = useEditorStore.getState();

			switch (action) {
				case 'undo':
					event.preventDefault();
					store.undo();
					return;
				case 'redo':
					event.preventDefault();
					store.redo();
					return;
				case 'forceSave':
					event.preventDefault();
					onForceSave();
					return;
				case 'togglePreview': {
					event.preventDefault();
					// §6.1 rule 3's "Preview as {role}" — toggles between off
					// and the first role, which is the only unambiguous thing a
					// single keystroke can mean when there are several roles.
					// Picking a specific one stays the header dropdown's job.
					const roles = store.body?.roles ?? [];
					if (roles.length === 0) return;
					store.setPreviewRoleId(store.previewRoleId ? null : (roles[0]?.id ?? null));
					return;
				}
				case 'insertLink': {
					event.preventDefault();
					const editor = getActiveRichTextEditor();
					if (!editor || !editor.isEditable) return;
					const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
					const href = window.prompt('Link URL', existing);
					if (href === null) return;
					if (href.trim() === '') editor.chain().focus().unsetLink().run();
					else editor.chain().focus().setLink({ href: href.trim() }).run();
					return;
				}
				case 'stepOut': {
					// §9.3: "Step out of text-edit → block select → deselect."
					// This handles only the *second* step. When the keystroke
					// came from inside a rich-text editor, that editor's own
					// Escape shortcut owns it (`escapeToBlur.ts` blurs, leaving
					// the block selected) — and an ordinary form field owns
					// Escape too, where it means "cancel what I'm typing".
					// Either way, bailing here is what makes two presses do two
					// different things instead of collapsing into one.
					//
					// `event.target`, not `document.activeElement`: by the time
					// this runs the editor may already have blurred, so the
					// live focus no longer says where the keystroke came from.
					if (isTextEntryTarget(event.target)) return;
					if (store.selection) store.select(null);
					return;
				}
				case 'duplicate': {
					event.preventDefault();
					const { selection, multiSelectedBlockIds } = store;
					if (!selection?.blockId) return;
					// Same "act on the whole multi-selection" rule the floating
					// toolbar's own Duplicate follows.
					for (const id of [selection.blockId, ...multiSelectedBlockIds]) {
						store.runCommand(duplicateBlock(selection.pageId, id));
					}
					return;
				}
				case 'deleteBlock': {
					const { selection, multiSelectedBlockIds, body } = store;
					if (!selection?.blockId || !body) return;
					event.preventDefault();
					// A locked block is non-deletable (§4.3) and `deleteBlock`
					// throws on one — filtered here so a mixed selection still
					// deletes what it legitimately can instead of the whole
					// keystroke failing on the first locked block it hits.
					const deletable = [selection.blockId, ...multiSelectedBlockIds].filter(
						(id) => findBlockById(body.pages, id)?.locked === false
					);
					if (deletable.length === 0) return;
					for (const id of deletable) store.runCommand(deleteBlock(selection.pageId, id));
					store.select(null);
					return;
				}
			}
		}

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onForceSave]);
}

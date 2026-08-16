import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { BlockId, PageId, TemplateBody, TemplateMeta } from '../types';
import type { Command } from '../commands/types';

// Spec §9.1.
const MAX_UNDO_DEPTH = 100;
// "Coalesce rapid text edits into one undo entry per ~500ms idle or per
// block-blur." The blur half of that is `endCoalescing()`, called by
// whatever loses focus (a text block, a page-name input); this constant
// governs the idle half.
const COALESCE_WINDOW_MS = 500;

export interface Selection {
	pageId: PageId;
	/** null = the page itself is selected, not a specific block on it. */
	blockId: BlockId | null;
}

interface EditorState {
	meta: TemplateMeta | null;
	body: TemplateBody | null;
	selection: Selection | null;
	/** True since the last load/save — i.e. there's something for autosave to pick up. */
	dirty: boolean;

	undoStack: Command[];
	redoStack: Command[];
	lastCommandAt: number | null;
	lastCoalesceKey: string | null;

	loadTemplate: (meta: TemplateMeta, body: TemplateBody) => void;
	/** Called once autosave's PUT resolves — advances `meta` without touching `body` or the undo history. */
	markSaved: (meta: TemplateMeta) => void;
	runCommand: (command: Command, options?: { coalesceKey?: string }) => void;
	endCoalescing: () => void;
	undo: () => void;
	redo: () => void;
	select: (selection: Selection | null) => void;
}

export const useEditorStore = create<EditorState>()(
	immer((set) => ({
		meta: null,
		body: null,
		selection: null,
		dirty: false,
		undoStack: [],
		redoStack: [],
		lastCommandAt: null,
		lastCoalesceKey: null,

		loadTemplate: (meta, body) =>
			set((state) => {
				state.meta = meta;
				state.body = body;
				state.selection = null;
				state.dirty = false;
				state.undoStack = [];
				state.redoStack = [];
				state.lastCommandAt = null;
				state.lastCoalesceKey = null;
			}),

		markSaved: (meta) =>
			set((state) => {
				state.meta = meta;
				state.dirty = false;
			}),

		runCommand: (command, options) =>
			set((state) => {
				if (!state.body) throw new Error('runCommand: no template loaded');

				const now = Date.now();
				const coalesceKey = options?.coalesceKey ?? null;
				const withinWindow = state.lastCommandAt != null && now - state.lastCommandAt < COALESCE_WINDOW_MS;
				const shouldCoalesce =
					coalesceKey != null && coalesceKey === state.lastCoalesceKey && withinWindow && state.undoStack.length > 0;

				if (shouldCoalesce) {
					// Still inside the same burst: apply and discard the
					// per-keystroke inverse. The group's *first* inverse is
					// already on top of the stack and still correctly restores
					// the pre-burst state — that's the whole point of coalescing,
					// one undo unwinds the whole burst rather than one keystroke.
					command.apply(state.body);
				} else {
					const inverse = command.apply(state.body);
					state.undoStack.push(inverse);
					if (state.undoStack.length > MAX_UNDO_DEPTH) state.undoStack.shift();
				}

				// A new edit invalidates whatever redo history existed — this
				// matches every editor's undo semantics: redo only makes sense
				// as long as nothing new has been done since the last undo.
				state.redoStack = [];
				state.dirty = true;
				state.lastCommandAt = now;
				state.lastCoalesceKey = coalesceKey;
			}),

		endCoalescing: () =>
			set((state) => {
				state.lastCommandAt = null;
				state.lastCoalesceKey = null;
			}),

		undo: () =>
			set((state) => {
				if (!state.body) return;
				const command = state.undoStack.pop();
				if (!command) return;
				// apply() always returns its own inverse — undo is just "run the
				// top of the undo stack", and the redo command falls out of that
				// call for free, symmetrically with runCommand.
				const redoCommand = command.apply(state.body);
				state.redoStack.push(redoCommand);
				state.dirty = true;
				state.lastCommandAt = null;
				state.lastCoalesceKey = null;
			}),

		redo: () =>
			set((state) => {
				if (!state.body) return;
				const command = state.redoStack.pop();
				if (!command) return;
				const undoCommand = command.apply(state.body);
				state.undoStack.push(undoCommand);
				if (state.undoStack.length > MAX_UNDO_DEPTH) state.undoStack.shift();
				state.dirty = true;
				state.lastCommandAt = null;
				state.lastCoalesceKey = null;
			}),

		select: (selection) =>
			set((state) => {
				state.selection = selection;
			}),
	}))
);

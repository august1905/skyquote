import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { BlockId, PageId, TemplateBody, TemplateMeta } from '../types';
import type { Command } from '../commands/types';
import { defaultTheme } from '../commands/themeCommands';

/**
 * Backfills fields that didn't exist when a template's Stratus body was
 * written — currently just `settings.theme` (added after several real
 * templates already existed without it). `getTemplate`'s response is
 * trusted as `TemplateBody`-shaped without runtime validation the same way
 * the rest of this app trusts its API responses; this is the one place that
 * guarantee could actually be false for an existing document, so it's
 * checked here rather than making every theme-reading component handle a
 * possibly-missing value.
 */
function normalizeBody(body: TemplateBody): TemplateBody {
	if (body.settings.theme) return body;
	return { ...body, settings: { ...body.settings, theme: defaultTheme() } };
}

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
	/**
	 * §4.2's multi-select — additional blocks included alongside `selection`
	 * (the "anchor"), always on `selection.pageId`. Kept as a separate,
	 * additive piece of state rather than folding into `Selection` itself, so
	 * every existing single-selection consumer (the floating toolbar's
	 * position, `BlockSettingsPopover`'s target, etc.) keeps working
	 * unchanged — they only ever care about the one anchor block.
	 */
	multiSelectedBlockIds: BlockId[];
	/** True since the last load/save — i.e. there's something for autosave to pick up. */
	dirty: boolean;

	undoStack: Command[];
	redoStack: Command[];
	lastCommandAt: number | null;
	lastCoalesceKey: string | null;
	/**
	 * Increments on every runCommand/undo/redo, including coalesced ones —
	 * unlike `lastCommandAt` (which undo/redo reset to `null`, so two undos in
	 * a row don't produce a *change* a `useEffect` dependency array would
	 * notice), this is monotonic and never collides. Autosave depends on this
	 * to reliably re-arm its debounce timer and to detect "did a newer edit
	 * land after I captured this snapshot to save" — see useAutosave.ts.
	 */
	editSeq: number;

	loadTemplate: (meta: TemplateMeta, body: TemplateBody) => void;
	/** Called once autosave's PUT resolves — advances `meta` without touching `body` or the undo history. */
	markSaved: (meta: TemplateMeta) => void;
	/**
	 * Advances `meta` (the server bumps `version`/`updatedAt` on every save)
	 * WITHOUT clearing `dirty` — for when a save's response arrives after
	 * newer local edits were already made. Those edits were never part of
	 * the body that request sent, so they must stay marked unsaved; the next
	 * autosave attempt still needs the fresh `version` this save returned,
	 * or it would fail every subsequent save with a stale-version conflict.
	 */
	advanceSavedMeta: (meta: TemplateMeta) => void;
	/**
	 * `TemplateMeta.name` lives on the Data Store row, not `TemplateBody` — it
	 * isn't part of the command/undo stack (§9.1 scopes undo to the body), so
	 * this just marks dirty and bumps `editSeq` directly, the same way any
	 * body edit does, so `useAutosave` picks it up on its normal debounce.
	 * `saveTemplate` already sends `meta.name` on every save (see
	 * useAutosave.ts) — this only needed a way to change it locally first.
	 */
	renameTemplate: (name: string) => void;
	runCommand: (command: Command, options?: { coalesceKey?: string }) => void;
	endCoalescing: () => void;
	undo: () => void;
	redo: () => void;
	/** A plain (non-shift) click/select — always resets `multiSelectedBlockIds` back to none. */
	select: (selection: Selection | null) => void;
	/**
	 * Shift-click (§4.2): toggles `blockId` in/out of the multi-selection.
	 * The very first shift-click with nothing selected yet just becomes a
	 * normal single selection (there's no anchor to add *to*). Shift-clicking
	 * the current anchor itself is a no-op — the anchor can't be toggled off
	 * without also picking a new one, which a single shift-click can't express.
	 */
	toggleMultiSelect: (pageId: PageId, blockId: BlockId) => void;
	clearMultiSelection: () => void;
}

export const useEditorStore = create<EditorState>()(
	immer((set) => ({
		meta: null,
		body: null,
		selection: null,
		multiSelectedBlockIds: [],
		dirty: false,
		undoStack: [],
		redoStack: [],
		lastCommandAt: null,
		lastCoalesceKey: null,
		editSeq: 0,

		loadTemplate: (meta, body) =>
			set((state) => {
				state.meta = meta;
				state.body = normalizeBody(body);
				state.selection = null;
				state.multiSelectedBlockIds = [];
				state.dirty = false;
				state.undoStack = [];
				state.redoStack = [];
				state.lastCommandAt = null;
				state.lastCoalesceKey = null;
				state.editSeq = 0;
			}),

		markSaved: (meta) =>
			set((state) => {
				state.meta = meta;
				state.dirty = false;
			}),

		advanceSavedMeta: (meta) =>
			set((state) => {
				state.meta = meta;
			}),

		renameTemplate: (name) =>
			set((state) => {
				if (!state.meta) return;
				state.meta.name = name;
				state.dirty = true;
				state.editSeq += 1;
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
				state.editSeq += 1;
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
				state.editSeq += 1;
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
				state.editSeq += 1;
			}),

		select: (selection) =>
			set((state) => {
				state.selection = selection;
				state.multiSelectedBlockIds = [];
			}),

		toggleMultiSelect: (pageId, blockId) =>
			set((state) => {
				if (!state.selection || state.selection.blockId == null || state.selection.pageId !== pageId) {
					state.selection = { pageId, blockId };
					state.multiSelectedBlockIds = [];
					return;
				}
				if (blockId === state.selection.blockId) return;
				const index = state.multiSelectedBlockIds.indexOf(blockId);
				if (index === -1) state.multiSelectedBlockIds.push(blockId);
				else state.multiSelectedBlockIds.splice(index, 1);
			}),

		clearMultiSelection: () =>
			set((state) => {
				state.multiSelectedBlockIds = [];
			}),
	}))
);

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { BlockId, BlockType, CatalogItem, PageId, RoleId, TemplateBody, TemplateMeta } from '../types';
import type { InsertTarget } from '../content/palette';
import type { ContentLibraryItem } from '../../api/contentLibrary';
import type { Command } from '../commands/types';
import { defaultTheme } from '../commands/themeCommands';
import { defaultPageSettings } from '../commands/pageSettingsCommands';

/**
 * Backfills fields that didn't exist when a template's Stratus body was
 * written — `settings.theme` (added after several real templates already
 * existed without it), plus `settings.pageSize`/`orientation`/`margins`/
 * `showPageNumbers` (unused dead fields since phase 1, per §10's own
 * pagination work — never actually verified to be present on every real
 * template row, so each is backfilled individually rather than assumed).
 * `getTemplate`'s response is trusted as `TemplateBody`-shaped without
 * runtime validation the same way the rest of this app trusts its API
 * responses; this is the one place that guarantee could actually be false
 * for an existing document, so it's checked here rather than making every
 * page-settings-reading component handle a possibly-missing value.
 */
function normalizeBody(body: TemplateBody): TemplateBody {
	const pageDefaults = defaultPageSettings();
	const needsTheme = !body.settings.theme;
	const needsPageSize = !body.settings.pageSize;
	const needsOrientation = !body.settings.orientation;
	const needsMargins = !body.settings.margins;
	const needsShowPageNumbers = body.settings.showPageNumbers === undefined;
	// §3's attachments, added after real templates existed without them. Lives
	// at the body's top level rather than under `settings` because it's content
	// the recipient sees, not a presentation option.
	const needsAttachments = body.attachments === undefined;
	if (!needsTheme && !needsPageSize && !needsOrientation && !needsMargins && !needsShowPageNumbers && !needsAttachments) return body;
	return {
		...body,
		...(needsAttachments ? { attachments: [] } : {}),
		settings: {
			...body.settings,
			...(needsTheme ? { theme: defaultTheme() } : {}),
			...(needsPageSize ? { pageSize: pageDefaults.pageSize } : {}),
			...(needsOrientation ? { orientation: pageDefaults.orientation } : {}),
			...(needsMargins ? { margins: pageDefaults.margins } : {}),
			...(needsShowPageNumbers ? { showPageNumbers: pageDefaults.showPageNumbers } : {}),
		},
	};
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
	/**
	 * §6.1 rule 3's "Preview as {role}" mode — null means "not previewing" (the normal
	 * authoring canvas). When set to a role id, that role's fillable fields
	 * render as live, fillable inputs instead of their normal inert preview
	 * (§6.1 rule 3: "clicking configures, it does not fill" — this is the one
	 * exception). Nothing entered while previewing is persisted anywhere —
	 * there's no `Document`/recipient record yet to save it into (phase 4's
	 * still-not-built, resource-gated piece) — and every other part of the
	 * editor (block selection, settings, other roles' fields) stays exactly as
	 * it is outside preview. A fuller "recipient-view" render mode (hiding
	 * authoring chrome entirely, per §14's `render/` shared-renderer idea) is
	 * a bigger, separate piece of work — this is deliberately scoped to just
	 * the field-interactivity half of §5's own description.
	 */
	previewRoleId: RoleId | null;
	/**
	 * §10's pagination — a document-wide `blockId -> absolute physical page
	 * number` map, rebuilt by `TemplateCanvas.tsx` whenever any logical
	 * page's own physical-page grouping settles. A `TableOfContentsBlockView`
	 * can live on any page, so it needs this at the store level rather than
	 * threaded down as a prop through `BlockView`'s generic per-block props
	 * (which every other block type would then have to accept and ignore).
	 * Not part of `body`/undo — purely derived, rebuilt fresh on every load.
	 */
	blockPageNumbers: Map<BlockId, number>;
	/**
	 * Workspace-level, not template-scoped — unlike `body`, this isn't reset
	 * by `loadTemplate` and isn't part of undo/redo. Fetched once per editor
	 * session by `TemplateEditor.tsx` (see `setCatalogItems`) so both the
	 * Catalog panel's browser and every `PricingTableBlockView`'s "price
	 * changed since insert" check (§7.7) share one fetch instead of each
	 * re-requesting the same list.
	 */
	catalogItems: CatalogItem[];
	catalogItemsStatus: 'idle' | 'loading' | 'ready' | 'error';
	/**
	 * §8's Content Library. Workspace-level for the same reason
	 * `catalogItems` is — a library item belongs to the workspace, not to the
	 * template currently open — so `loadTemplate` doesn't reset it and it
	 * stays out of undo/redo.
	 *
	 * Holds metadata only, never payloads: the list is what the panel renders,
	 * and a payload is fetched per item at insert time (see
	 * `api/contentLibrary.ts`) so browsing a large library never pulls every
	 * saved block tree into memory.
	 */
	contentLibraryItems: ContentLibraryItem[];
	contentLibraryStatus: 'idle' | 'loading' | 'ready' | 'error';
	/**
	 * Which of §3's right-rail panels (③) is open, or null. One at a time, as
	 * the spec requires.
	 *
	 * In the store rather than `RightRail`'s own `useState` because the header
	 * opens one too: §3's "Manage" button opens the *same* role-management panel
	 * the rail's 👥 icon does, and duplicating the panel in a dialog so the
	 * header could own its own copy would be two implementations of one thing.
	 */
	openRailPanel: 'content' | 'roles' | 'variables' | 'catalog' | 'contentLibrary' | 'attachments' | 'theme' | null;
	/**
	 * §4.1's palette, mid-placement.
	 *
	 * Two tiles can't produce a block on the spot — Image needs a library image
	 * picked, Video needs a URL resolved through oEmbed — so a click or a drop of
	 * either one parks the *destination* here and the Content panel finishes the
	 * job. In the store rather than the panel's own state because a drop is
	 * resolved by `EditorDndProvider`, which sits above the canvas, nowhere near
	 * the panel that owns the picker; throwing the target away and inserting at
	 * the end instead would make dragging those two tiles pointless.
	 *
	 * `error` shares the field because it's the same conversation — the outcome of
	 * one attempted placement — and only one placement can be in flight at a time.
	 */
	palettePlacement: { status: 'needsInput'; blockType: BlockType; target: InsertTarget } | { status: 'error'; message: string } | null;
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
	/**
	 * §13's restore-from-local-draft. Replaces the loaded body with recovered
	 * unsent work and marks it dirty, so autosave picks it up as something
	 * that still needs sending — the one thing `loadTemplate` deliberately
	 * doesn't do, since a fresh server load is by definition already saved.
	 *
	 * Clears undo/redo along with it: the recovered body is a new starting
	 * point, and inverses captured against the *server* copy would be
	 * meaningless applied to this one.
	 */
	restoreDraftBody: (body: TemplateBody) => void;
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
	setPreviewRoleId: (roleId: RoleId | null) => void;
	setCatalogItemsStatus: (status: EditorState['catalogItemsStatus']) => void;
	setCatalogItems: (items: CatalogItem[]) => void;
	setContentLibraryStatus: (status: EditorState['contentLibraryStatus']) => void;
	setContentLibraryItems: (items: ContentLibraryItem[]) => void;
	/** Splices one item into the cached list without a refetch — for the save/delete paths, which already know the authoritative row the backend returned. */
	upsertContentLibraryItem: (item: ContentLibraryItem) => void;
	removeContentLibraryItem: (id: string) => void;
	setBlockPageNumbers: (map: Map<BlockId, number>) => void;
	setOpenRailPanel: (panel: EditorState['openRailPanel']) => void;
	setPalettePlacement: (placement: EditorState['palettePlacement']) => void;
}

export const useEditorStore = create<EditorState>()(
	immer((set) => ({
		meta: null,
		body: null,
		selection: null,
		multiSelectedBlockIds: [],
		previewRoleId: null,
		blockPageNumbers: new Map(),
		catalogItems: [],
		catalogItemsStatus: 'idle',
		contentLibraryItems: [],
		contentLibraryStatus: 'idle',
		/**
		 * Every panel starts closed, Content included — and it was worth trying the
		 * other way to find out why.
		 *
		 * Opening it by default (for §4.1's drag gesture, which can't be discovered
		 * behind a closed panel) had two costs the discoverability didn't cover. A
		 * page frame is a fixed 816px, so on a 1280px window the panel made the
		 * canvas narrower than its own content and pushed the page partly out of
		 * reach. And a rail panel claims Escape (`useCloseOnEscape`), so a
		 * permanently-open one permanently outranked §9.3's Escape-steps-out-of-
		 * text-edit — the editor's own Escape stopped working entirely. The rail's
		 * ➕ is prominent enough to find on its own.
		 */
		openRailPanel: null,
		palettePlacement: null,
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
				state.previewRoleId = null;
				state.blockPageNumbers = new Map();
				// A placement targets a container id from the template that was open
				// when it started; carrying it into a different one would insert into
				// a page that no longer exists.
				state.palettePlacement = null;
				state.dirty = false;
				state.undoStack = [];
				state.redoStack = [];
				state.lastCommandAt = null;
				state.lastCoalesceKey = null;
				state.editSeq = 0;
			}),

		restoreDraftBody: (body) =>
			set((state) => {
				state.body = normalizeBody(body);
				state.selection = null;
				state.multiSelectedBlockIds = [];
				state.blockPageNumbers = new Map();
				state.dirty = true;
				state.undoStack = [];
				state.redoStack = [];
				state.lastCommandAt = null;
				state.lastCoalesceKey = null;
				state.editSeq += 1;
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

		setPreviewRoleId: (roleId) =>
			set((state) => {
				state.previewRoleId = roleId;
			}),

		setCatalogItemsStatus: (status) =>
			set((state) => {
				state.catalogItemsStatus = status;
			}),

		setCatalogItems: (items) =>
			set((state) => {
				state.catalogItems = items;
				state.catalogItemsStatus = 'ready';
			}),

		setContentLibraryStatus: (status) =>
			set((state) => {
				state.contentLibraryStatus = status;
			}),

		setContentLibraryItems: (items) =>
			set((state) => {
				state.contentLibraryItems = items;
				state.contentLibraryStatus = 'ready';
			}),

		upsertContentLibraryItem: (item) =>
			set((state) => {
				const index = state.contentLibraryItems.findIndex((existing) => existing.id === item.id);
				// Newest first, matching the backend's own ORDER BY, so a freshly
				// saved item appears at the top of Recent without a refetch.
				if (index === -1) state.contentLibraryItems.unshift(item);
				else state.contentLibraryItems[index] = item;
			}),

		removeContentLibraryItem: (id) =>
			set((state) => {
				state.contentLibraryItems = state.contentLibraryItems.filter((item) => item.id !== id);
			}),

		setBlockPageNumbers: (map) =>
			set((state) => {
				state.blockPageNumbers = map;
			}),

		setOpenRailPanel: (panel) =>
			set((state) => {
				state.openRailPanel = panel;
				// Closing the Content panel abandons whatever it was mid-way through
				// placing — the picker that would finish it lives in there.
				if (panel !== 'content') state.palettePlacement = null;
			}),

		setPalettePlacement: (placement) =>
			set((state) => {
				state.palettePlacement = placement;
			}),
	}))
);

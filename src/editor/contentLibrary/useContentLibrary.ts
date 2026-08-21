import { useCallback } from 'react';
import {
	createContentLibraryItem,
	getContentLibraryItem,
	recordContentLibraryUse,
	type ContentLibraryItem,
	type ContentLibraryKind,
} from '../../api/contentLibrary';
import { addPage, createBlankPage, insertBlocks } from '../commands';
import { findBlockById } from '../commands/blockTree';
import { collectAllFields } from '../fields/collectFields';
import { useEditorStore } from '../store/editorStore';
import type { Block, Page } from '../types';
import { prepareLibraryBlocksForInsert } from './prepareInsert';

/**
 * §8's two verbs — save to the library, and insert from it — in one place, so
 * the three save entry points (§8: "page `…` menu, block toolbar overflow,
 * multi-selection") and the panel's insert all go through identical logic
 * rather than three near-copies.
 *
 * Deliberately a hook rather than commands: saving talks to the backend and
 * touches no template state at all, and inserting needs an awaited fetch
 * before it can build its command. A `Command` must be synchronous and pure
 * (its `apply` runs inside an Immer producer), so the async half lives here
 * and only the final tree mutation is a command.
 */
export function useContentLibrary() {
	const runCommand = useEditorStore((s) => s.runCommand);
	const upsertItem = useEditorStore((s) => s.upsertContentLibraryItem);

	/**
	 * Saves blocks as a `block` item. Handles one block or a whole
	 * multi-selection — see routes/contentLibraryItems.js on why there's no
	 * separate kind for the latter.
	 */
	const saveBlocks = useCallback(
		async (name: string, blocks: Block[], tags: string[] = []): Promise<ContentLibraryItem> => {
			const item = await createContentLibraryItem({ name, kind: 'block', tags, payload: { blocks } });
			// Cached rather than refetched: the response *is* the authoritative
			// row, so a refetch would be a second round trip for the same data.
			upsertItem(item);
			return item;
		},
		[upsertItem]
	);

	/** Saves a whole page, carrying its own name/background so inserting recreates the page rather than merging into the current one. */
	const savePage = useCallback(
		async (name: string, page: Page, tags: string[] = []): Promise<ContentLibraryItem> => {
			const item = await createContentLibraryItem({
				name,
				kind: 'page',
				tags,
				payload: {
					blocks: page.blocks,
					// Conditional spread, not `background: page.background` —
					// `exactOptionalPropertyTypes` rejects assigning a possibly-
					// undefined value to an optional property.
					page: { name: page.name, ...(page.background ? { background: page.background } : {}) },
				},
			});
			upsertItem(item);
			return item;
		},
		[upsertItem]
	);

	/**
	 * §8's insert: fetch the payload, deep-clone with fresh ids and a
	 * `contentLibraryRef`, then place it.
	 *
	 * A `block` item lands on the current page — after the selected block if
	 * there is one, else at the end (§4.1 path 2). A `page` item becomes a new
	 * page after the current one, restoring its saved name and background.
	 *
	 * Reads template state through `getState()` rather than subscribed values:
	 * everything here happens after an `await`, so a value captured at render
	 * time could already be stale by the time it's used.
	 */
	const insertItem = useCallback(
		async (itemId: string, kind: ContentLibraryKind): Promise<void> => {
			const { payload } = await getContentLibraryItem(itemId);

			const { body, selection } = useEditorStore.getState();
			if (!body) return;

			const prepared = prepareLibraryBlocksForInsert(payload.blocks, itemId, collectAllFields(body), body.roles);

			if (kind === 'page') {
				const currentPageIndex = selection ? body.pages.findIndex((page) => page.id === selection.pageId) : -1;
				const insertAt = currentPageIndex === -1 ? body.pages.length : currentPageIndex + 1;
				const newPage = createBlankPage(payload.page?.name ?? 'Untitled page');
				newPage.blocks = prepared;
				if (payload.page?.background) newPage.background = payload.page.background;
				runCommand(addPage(insertAt, newPage));
			} else {
				// Fall back to the first page when nothing is selected — a
				// template always has at least one, enforced by the page menu.
				const targetPage = body.pages.find((page) => page.id === selection?.pageId) ?? body.pages[0];
				if (!targetPage) return;
				// Only a *top-level* selected block defines an insertion point;
				// a block nested in a column isn't addressable by an index into
				// the page's own blocks, so those fall through to appending.
				const selectedIndex =
					selection?.blockId && findBlockById([targetPage], selection.blockId)
						? targetPage.blocks.findIndex((block) => block.id === selection.blockId)
						: -1;
				const insertAt = selectedIndex === -1 ? targetPage.blocks.length : selectedIndex + 1;
				runCommand(insertBlocks({ pageId: targetPage.id }, insertAt, prepared));
			}

			// §8's usage count, fire-and-forget on purpose: the insert has
			// already succeeded and is undoable, so a failed increment must not
			// surface as an error. Worst case is a slightly stale Featured order.
			try {
				const updated = await recordContentLibraryUse(itemId);
				upsertItem(updated);
			} catch {
				// Intentionally swallowed — see above.
			}
		},
		[runCommand, upsertItem]
	);

	return { saveBlocks, savePage, insertItem };
}

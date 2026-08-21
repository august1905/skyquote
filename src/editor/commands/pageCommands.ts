import type { Draft } from 'immer';
import type { Page, PageId, TemplateBody } from '../types';
import type { Command } from './types';
import { cloneBlockWithNewIds, findPageIndex, pageAt, reindexPageOrder, snapshot } from './blockTree';

export function addPage(index: number, page: Page): Command {
	return {
		name: 'addPage',
		apply(draft: Draft<TemplateBody>) {
			draft.pages.splice(index, 0, page as Draft<Page>);
			reindexPageOrder(draft);
			return deletePage(page.id);
		},
	};
}

// No "can't delete the last page" guard here — that's a UI-level rule (the
// canvas should disable the control), not something the command layer
// enforces. A command's job is to do exactly what it's told; keeping that
// invariant out of apply() keeps commands composable and keeps this file
// testable without smuggling in a business rule that has nothing to do with
// undo/redo correctness.
export function deletePage(pageId: PageId): Command {
	return {
		name: 'deletePage',
		apply(draft: Draft<TemplateBody>) {
			const index = findPageIndex(draft, pageId);
			const removed = snapshot<Page>(pageAt(draft, index));
			draft.pages.splice(index, 1);
			reindexPageOrder(draft);
			return addPage(index, removed);
		},
	};
}

export function renamePage(pageId: PageId, name: string): Command {
	return {
		name: 'renamePage',
		apply(draft: Draft<TemplateBody>) {
			const index = findPageIndex(draft, pageId);
			const page = pageAt(draft, index);
			const previousName = page.name;
			page.name = name;
			return renamePage(pageId, previousName);
		},
	};
}

/** Appended to a duplicated page's name. Not a `-2`-style counter like §4.3's field rule: page names aren't a uniqueness key (unlike field merge names), so there's nothing to disambiguate — this is purely a human hint about where the page came from. */
const DUPLICATE_NAME_SUFFIX = ' (copy)';

/**
 * §3 ⑤'s page `…` menu, "duplicate". Inserts the copy directly after the
 * source, matching how `duplicateBlock` places its clone.
 *
 * **Every block in the copy gets fresh ids, recursively.** Reuses
 * `cloneBlockWithNewIds` — the same function block duplication uses — rather
 * than a structuredClone of the page, because block ids must be unique across
 * the *entire document*, not just within a page: `locateBlock` searches by id
 * alone and would resolve a duplicated id to whichever copy it found first,
 * silently making the other permanently unreachable (see `reassignIds`'s own
 * comment). The page's own id is freshly generated for the same reason.
 */
export function duplicatePage(pageId: PageId): Command {
	return {
		name: 'duplicatePage',
		apply(draft: Draft<TemplateBody>) {
			const index = findPageIndex(draft, pageId);
			const source = snapshot<Page>(pageAt(draft, index));
			const copy: Page = {
				...source,
				id: crypto.randomUUID(),
				name: `${source.name}${DUPLICATE_NAME_SUFFIX}`,
				// Corrected by reindexPageOrder below; carrying the source's
				// own `order` through would leave two pages claiming one slot.
				order: index + 1,
				blocks: source.blocks.map((block) => cloneBlockWithNewIds(block)),
			};
			draft.pages.splice(index + 1, 0, copy as Draft<Page>);
			reindexPageOrder(draft);
			return deletePage(copy.id);
		},
	};
}

/**
 * §3 ⑤'s page `…` menu, "move". `toIndex` is a position in the pages array
 * *after* the page has been lifted out, which is the same `arrayMove`
 * convention `moveBlock` follows — so moving page 0 to index 1 lands it after
 * what used to be page 1, not before it.
 *
 * A no-op move still returns a working inverse rather than throwing: the UI
 * clamps "move up" on the first page and "move down" on the last, and a
 * command that quietly does nothing is easier to reason about than one that
 * throws on a boundary the caller already handled.
 */
export function movePage(pageId: PageId, toIndex: number): Command {
	return {
		name: 'movePage',
		apply(draft: Draft<TemplateBody>) {
			const fromIndex = findPageIndex(draft, pageId);
			const [moved] = draft.pages.splice(fromIndex, 1);
			if (!moved) throw new Error(`movePage: no page at index ${fromIndex}`);
			const clamped = Math.max(0, Math.min(toIndex, draft.pages.length));
			draft.pages.splice(clamped, 0, moved);
			reindexPageOrder(draft);
			return movePage(pageId, fromIndex);
		},
	};
}

/**
 * §3 ⑤'s page `…` menu, "set background". `Page.background` has been in the
 * domain model since phase 1 with nothing ever reading it — same dead-data
 * category `locked`/`style`/`theme` were in before each got wired up.
 *
 * Takes the whole `background` object rather than just a color so the
 * `imageUrl` half of §2.1's shape stays expressible; passing `undefined`
 * clears it back to inheriting the theme's own page background, which is a
 * meaningful state and not the same as an explicit white.
 */
export function setPageBackground(pageId: PageId, background: Page['background'] | undefined): Command {
	return {
		name: 'setPageBackground',
		apply(draft: Draft<TemplateBody>) {
			const index = findPageIndex(draft, pageId);
			const page = pageAt(draft, index);
			const previous = page.background ? snapshot<NonNullable<Page['background']>>(page.background) : undefined;
			if (background) page.background = background;
			else delete page.background;
			return setPageBackground(pageId, previous);
		},
	};
}

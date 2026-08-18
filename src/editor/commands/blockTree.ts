import { current, type Draft } from 'immer';
import type { Block, BlockId, Page, PageBreakBlock, PageId, TemplateBody, TextBlock } from '../types';

/**
 * Finds a page by id in the draft, or throws. A missing page/block here
 * means a command was constructed against stale ids — a programming error,
 * not a user-input problem (ids never come from outside the app) — so this
 * fails loudly rather than silently no-oping a command that then looks like
 * it succeeded.
 */
export function findPage(body: Draft<TemplateBody>, pageId: PageId): Draft<Page> {
	const page = body.pages.find((p) => p.id === pageId);
	if (!page) throw new Error(`findPage: no page with id ${pageId}`);
	return page;
}

export function findBlockIndex(page: Draft<Page>, blockId: BlockId): number {
	const index = page.blocks.findIndex((b) => b.id === blockId);
	if (index === -1) throw new Error(`findBlockIndex: no block with id ${blockId} on page ${page.id}`);
	return index;
}

/**
 * Reads `page.blocks[index]` with a real runtime check rather than an `as`
 * assertion — `noUncheckedIndexedAccess` types every array index as possibly
 * `undefined`, and the point of that flag (see PROJECT_CONTEXT.md) is to
 * force this check to actually happen, not to be cast away because the
 * caller "knows" the index came from findBlockIndex.
 */
export function blockAt(page: Draft<Page>, index: number): Draft<Block> {
	const block = page.blocks[index];
	if (!block) throw new Error(`blockAt: no block at index ${index} on page ${page.id}`);
	return block;
}

export function pageAt(body: Draft<TemplateBody>, index: number): Draft<Page> {
	const page = body.pages[index];
	if (!page) throw new Error(`pageAt: no page at index ${index}`);
	return page;
}

/**
 * Clones a value out of the Immer draft tree into an independent plain
 * object, safe to close over in a Command that outlives the current
 * `produce` call.
 *
 * This is the one sharp edge in the whole command system: a Command's
 * `apply` runs *inside* a producer and returns another Command whose closure
 * may reference data read from the draft. If that data is captured by
 * reference (`const block = page.blocks[i]`), the closure holds an Immer
 * Proxy — and Immer revokes every draft proxy the instant its producer
 * returns. The very next time undo/redo tries to read that captured value,
 * it throws "Cannot perform 'get' on a proxy that has been revoked" — a bug
 * that won't surface until the *second* undo, not the first, since the first
 * only needs the proxy to still be valid at push-time. `current()` resolves
 * a draft to a plain, detached snapshot, which is what every command below
 * uses before storing anything in its returned inverse.
 */
export function snapshot<T>(draftValue: Draft<T>): T {
	return current(draftValue);
}

export function cloneBlockWithNewIds(block: Block): Block {
	// Deep clone via structuredClone first so mutating the id below can't
	// accidentally alias the source block's nested objects (style, doc, etc.)
	// — relevant for duplicateBlock, whose source block may itself still be
	// live in the draft.
	//
	// Field-name deduplication (spec §4.3: duplicated fields get a "-2"
	// suffix to stay unique) isn't handled here — phase 1 has no FieldBlock
	// content yet. Revisit when field duplication is actually exercised.
	const cloned = structuredClone(block);
	cloned.id = crypto.randomUUID();
	return cloned;
}

export function findPageIndex(body: Draft<TemplateBody>, pageId: PageId): number {
	const index = body.pages.findIndex((p) => p.id === pageId);
	if (index === -1) throw new Error(`findPageIndex: no page with id ${pageId}`);
	return index;
}

/**
 * `Page.order` is a denormalized convenience field — the `pages` array's own
 * position is the actual source of truth for ordering. Called after every
 * command that inserts, removes, or reorders pages so `order` never drifts
 * from the array it's supposed to describe.
 */
export function reindexPageOrder(body: Draft<TemplateBody>): void {
	body.pages.forEach((page, index) => {
		page.order = index;
	});
}

export function createBlankTextBlock(): TextBlock {
	return {
		id: crypto.randomUUID(),
		type: 'text',
		locked: false,
		style: {},
		doc: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
	};
}

export function createPageBreakBlock(): PageBreakBlock {
	return { id: crypto.randomUUID(), type: 'page_break', locked: false, style: {} };
}

export function createBlankPage(name: string): Page {
	return {
		id: crypto.randomUUID(),
		name,
		order: 0, // corrected by reindexPageOrder once inserted
		blocks: [createBlankTextBlock()],
	};
}

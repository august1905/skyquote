import { current, type Draft } from 'immer';
import type { Block, BlockId, BlockType, CatalogItem, ColumnsBlock, FieldBlock, FillableField, ImageBlock, Page, PageBreakBlock, PageId, PricingItem, PricingTableBlock, QuoteBuilderBlock, TableBlock, TableCell, TableOfContentsBlock, TemplateBody, TextBlock, VideoBlock } from '../types';
import { ZERO_MONEY } from '../types';

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

/**
 * Reads `blocks[index]` with a real runtime check rather than an `as`
 * assertion — `noUncheckedIndexedAccess` types every array index as possibly
 * `undefined`, and the point of that flag (see PROJECT_CONTEXT.md) is to
 * force this check to actually happen, not to be cast away because the
 * caller "knows" the index is valid.
 */
export function blockAt(blocks: Draft<Block>[], index: number): Draft<Block> {
	const block = blocks[index];
	if (!block) throw new Error(`blockAt: no block at index ${index}`);
	return block;
}

/**
 * Block types that hold their own nested block arrays. `columns` is the only
 * one that actually exists yet — `smart_content` (§4.4 also caps its nesting
 * at depth 2) isn't built, so there's nothing real to recurse into there.
 * Extend {@link locateBlock}/{@link resolveContainerBlocks}/
 * {@link containerBlocksOf}/`cloneBlockWithNewIds`'s `reassignIds` together
 * when it lands.
 */
const CONTAINER_BLOCK_TYPES: BlockType[] = ['columns'];

export function isContainerBlockType(type: BlockType): boolean {
	return CONTAINER_BLOCK_TYPES.includes(type);
}

/**
 * Addresses either a page's own top-level blocks, or one column of a
 * `ColumnsBlock` on that page. §4.4 caps nesting at depth 2, so a column's
 * contents are never themselves addressed via a `parent` — there's only ever
 * one level of `parent` here, never a chain of them.
 */
export interface BlockContainer {
	pageId: PageId;
	parent?: { columnsBlockId: BlockId; column: number };
}

/**
 * Resolves a `BlockContainer` to the actual mutable array it names, inside an
 * Immer draft — used by every command that inserts into or moves blocks
 * between containers.
 */
export function resolveContainerBlocks(draft: Draft<TemplateBody>, container: BlockContainer): Draft<Block>[] {
	const page = findPage(draft, container.pageId);
	if (!container.parent) return page.blocks;
	const parentIndex = page.blocks.findIndex((b) => b.id === container.parent!.columnsBlockId);
	const parentBlock = parentIndex === -1 ? undefined : page.blocks[parentIndex];
	if (!parentBlock || parentBlock.type !== 'columns') {
		throw new Error(`resolveContainerBlocks: no columns block with id ${container.parent.columnsBlockId} on page ${container.pageId}`);
	}
	const column = parentBlock.columns[container.parent.column];
	if (!column) {
		throw new Error(`resolveContainerBlocks: column ${container.parent.column} out of range on columns block ${container.parent.columnsBlockId}`);
	}
	return column;
}

/**
 * The read-only counterpart to {@link resolveContainerBlocks}, operating on
 * plain (non-draft) template state — for call sites like the canvas's drag
 * handler that only need to look something up, never mutate it.
 */
export function containerBlocksOf(pages: Page[], container: BlockContainer): Block[] | undefined {
	const page = pages.find((p) => p.id === container.pageId);
	if (!page) return undefined;
	if (!container.parent) return page.blocks;
	const parentBlock = page.blocks.find((b) => b.id === container.parent!.columnsBlockId);
	if (!parentBlock || parentBlock.type !== 'columns') return undefined;
	return parentBlock.columns[container.parent.column];
}

/**
 * Finds a block anywhere on a page — its top-level `blocks`, or inside any
 * column of any top-level `ColumnsBlock` — and reports which `BlockContainer`
 * it lives in alongside the mutable array and index, so callers (delete,
 * duplicate, setBlockDoc, move) don't need to know in advance whether the id
 * they were given is nested or not.
 */
export function locateBlock(
	page: Draft<Page>,
	blockId: BlockId
): { container: BlockContainer; blocks: Draft<Block>[]; index: number } {
	const topIndex = page.blocks.findIndex((b) => b.id === blockId);
	if (topIndex !== -1) {
		return { container: { pageId: page.id }, blocks: page.blocks, index: topIndex };
	}
	for (const block of page.blocks) {
		if (block.type !== 'columns') continue;
		for (let column = 0; column < block.columns.length; column++) {
			const columnBlocks = block.columns[column];
			if (!columnBlocks) continue;
			const index = columnBlocks.findIndex((b) => b.id === blockId);
			if (index !== -1) {
				return { container: { pageId: page.id, parent: { columnsBlockId: block.id, column } }, blocks: columnBlocks, index };
			}
		}
	}
	throw new Error(`locateBlock: no block with id ${blockId} on page ${page.id}`);
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
 *
 * `current()` has a second sharp edge of its own: if `draftValue` was never
 * actually *modified* within the producer that's running right now, it
 * short-circuits and returns `state.base_` verbatim — the literal object
 * from the *previous* produce's output, which autoFreeze already deep-froze.
 * Splicing that exact reference into an array later (every delete/remove
 * command's inverse re-inserts its snapshot this way) and then writing to
 * one of its own properties — e.g. a reindex loop correcting `.order` —
 * throws "Cannot assign to read only property". Reproduced against the
 * plain, already-shipped `deletePage`+undo with no roles/fields involved at
 * all, so this isn't specific to any one command. `structuredClone`
 * guarantees a fresh, unfrozen, fully detached copy regardless of which path
 * `current()` took internally.
 */
export function snapshot<T>(draftValue: Draft<T>): T {
	return structuredClone(current(draftValue));
}

export function cloneBlockWithNewIds(block: Block): Block {
	// Deep clone via structuredClone first so mutating ids below can't
	// accidentally alias the source block's nested objects (style, doc, etc.)
	// — relevant for duplicateBlock, whose source block may itself still be
	// live in the draft.
	//
	// Field-name deduplication (spec §4.3: duplicated fields get a "-2"
	// suffix to stay unique) isn't handled here — phase 1 has no FieldBlock
	// content yet. Revisit when field duplication is actually exercised.
	const cloned = structuredClone(block);
	reassignIds(cloned);
	return cloned;
}

/**
 * Reassigns ids through the whole subtree, not just the top block. Every
 * block id must be unique across the *entire* document (`locateBlock`
 * searches by id alone, with no notion of "search only inside this specific
 * columns block") — cloning a `ColumnsBlock` without re-idding the blocks
 * nested in its columns would leave two different top-level blocks each
 * containing a child with the same id, and `locateBlock` would always resolve
 * that id to whichever one it finds first, silently making the other
 * permanently unreachable.
 */
function reassignIds(block: Block): void {
	block.id = crypto.randomUUID();
	if (block.type === 'columns') {
		for (const column of block.columns) {
			for (const child of column) reassignIds(child);
		}
	}
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

/** Equal-width columns, each seeded with one blank text block (§4.5: 2–4 columns). */
export function createColumnsBlock(columnCount: 2 | 3 | 4 = 2): ColumnsBlock {
	return {
		id: crypto.randomUUID(),
		type: 'columns',
		locked: false,
		style: {},
		widths: Array.from({ length: columnCount }, () => 1 / columnCount),
		columns: Array.from({ length: columnCount }, () => [createBlankTextBlock()]),
	};
}

export function createBlankCell(): TableCell {
	return { doc: { type: 'doc', content: [{ type: 'paragraph', content: [] }] }, colspan: 1, rowspan: 1, style: {} };
}

/**
 * A cell has no `id` of its own (§2.1 — `TableCell` isn't a `Block`; cells are
 * addressed by row/column position, never independently selected, reordered,
 * or duplicated the way blocks are). That's also why `cloneBlockWithNewIds`'s
 * `reassignIds` never needs a `table` case: duplicating a `TableBlock` only
 * ever needs a new id on the block itself, exactly like any other id-less-
 * content block.
 */
export function createTableBlock(rowCount: 2 | 3 | 4 | 5 = 2, columnCount: 2 | 3 | 4 = 2): TableBlock {
	return {
		id: crypto.randomUUID(),
		type: 'table',
		locked: false,
		style: {},
		rows: Array.from({ length: rowCount }, () => ({ cells: Array.from({ length: columnCount }, () => createBlankCell()) })),
		columnWidths: Array.from({ length: columnCount }, () => 1 / columnCount),
		headerRow: true,
	};
}

/**
 * There's no "blank" image the way every other block type has — an
 * `ImageBlock` is only ever created from an already-uploaded asset (see
 * `src/api/assets.ts` and `blocks/insertable.ts`'s `createFromFile`), so
 * this takes the asset's own identity/dimensions as params rather than
 * generating placeholder content. `url` is expected to be a relative API
 * path, not a resolved absolute URL — see `assetFileRelativePath`.
 */
export function createImageBlock(params: { assetId: string; url: string; alt: string; width: number; height: number }): ImageBlock {
	return {
		id: crypto.randomUUID(),
		type: 'image',
		locked: false,
		style: {},
		assetId: params.assetId,
		url: params.url,
		alt: params.alt,
		width: params.width,
		height: params.height,
		shape: 'rect',
	};
}

/**
 * Same "no blank version" shape as `createImageBlock` — a `VideoBlock` only
 * ever comes from a pasted URL that's already been resolved to oEmbed
 * metadata (see `blocks/insertable.ts`'s `createFromUrl`). `provider` is
 * `'upload'` for a self-hosted video file, but nothing constructs one that
 * way yet — no upload/playback UI exists for it (see BUILD_STATUS.md).
 */
export function createVideoBlock(params: { provider: VideoBlock['provider']; url: string; thumbnailUrl: string }): VideoBlock {
	return {
		id: crypto.randomUUID(),
		type: 'video',
		locked: false,
		style: {},
		provider: params.provider,
		url: params.url,
		thumbnailUrl: params.thumbnailUrl,
		autoplay: false,
	};
}

/** A standalone field block (§6.2) — "used for large signature areas and `billing_details`". */
export function createFieldBlock(field: FillableField): FieldBlock {
	return { id: crypto.randomUUID(), type: 'field', locked: false, style: {}, field };
}

/** A blank row, for both `PricingTableBlock.items` and a `QuoteBuilderBlock` group's `options` — both are `PricingItem[]`, so one factory serves both. */
export function createBlankPricingItem(sectionId: string | null = null): PricingItem {
	return {
		id: crypto.randomUUID(),
		sectionId,
		name: '',
		description: '',
		qty: 1,
		price: ZERO_MONEY,
		optional: false,
		selected: true,
		customFields: {},
	};
}

/**
 * §7.7: "dragging a catalog item creates a row with `catalogItemId` set."
 * `price`/`cost`/`sku` are copied, not referenced — a `PricingItem`'s price
 * is frozen at insert time by design (every other field already works this
 * way; nothing in this app re-derives a row from its source on the fly).
 * `catalogItemId` is what lets a later comparison against the catalog's
 * *current* price notice it's since diverged — see
 * `pricing/catalogPriceChanged.ts`.
 */
export function createPricingItemFromCatalog(catalogItem: CatalogItem, sectionId: string | null = null): PricingItem {
	return {
		id: crypto.randomUUID(),
		sectionId,
		// Conditionally spread, never `sku: catalogItem.sku ?? undefined` —
		// `exactOptionalPropertyTypes` treats an explicit `undefined` on an
		// optional field as a type error, same reason `PricingItemPatch` and
		// friends had to widen their own field types instead.
		...(catalogItem.sku ? { sku: catalogItem.sku } : {}),
		name: catalogItem.name,
		description: catalogItem.description,
		qty: 1,
		price: catalogItem.price,
		...(catalogItem.cost != null ? { cost: catalogItem.cost } : {}),
		...(catalogItem.taxPct != null ? { tax: { type: 'pct' as const, value: catalogItem.taxPct } } : {}),
		optional: false,
		selected: true,
		catalogItemId: catalogItem.id,
		customFields: {},
	};
}

/**
 * §7's currency defaults to `'USD'`, matching `routes/templates.js`'s own
 * hardcoded default for a new template — `TemplateMeta.currency` isn't
 * surfaced or editable anywhere in the editor yet (see BUILD_STATUS.md), so
 * there's nothing else to read a "the template's currency" value from at
 * creation time. Revisit once that surfaces.
 */
export function createPricingTableBlock(): PricingTableBlock {
	return {
		id: crypto.randomUUID(),
		type: 'pricing_table',
		locked: false,
		style: {},
		currency: 'USD',
		columns: [],
		sections: [],
		items: [],
		settings: {
			allowRecipientQtyEdit: false,
			allowRecipientSelectOptional: false,
			showSubtotal: true,
			showDiscount: true,
			showTax: true,
			showTotal: true,
		},
	};
}

export function createQuoteBuilderBlock(): QuoteBuilderBlock {
	return { id: crypto.randomUUID(), type: 'quote_builder', locked: false, style: {}, currency: 'USD', groups: [] };
}

/** §4.5/§10: heading depth defaults to 2 (h1+h2) — h3 is offered but not on by default, matching the reference product's own TOC being a summary, not a full outline. */
export function createTocBlock(): TableOfContentsBlock {
	return { id: crypto.randomUUID(), type: 'toc', locked: false, style: {}, levels: 2 };
}

export function createBlankPage(name: string): Page {
	return {
		id: crypto.randomUUID(),
		name,
		order: 0, // corrected by reindexPageOrder once inserted
		blocks: [createBlankTextBlock()],
	};
}

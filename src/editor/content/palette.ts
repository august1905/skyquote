import type { Block, BlockType, FieldType, Page, TemplateBody } from '../types';
import { INSERTABLE_BLOCK_KINDS, createFieldBlockOfType, type InsertableBlockKind } from '../blocks/insertable';
import { collectAllFields } from '../fields/collectFields';
import { isContainerBlockType, type BlockContainer } from '../commands/blockTree';

/**
 * §3 ④'s Content panel — the palette's pure rules, with no React and no
 * dnd-kit, so the awkward parts (where a click inserts, whether a drop target
 * is legal, what a tile even produces) are testable on their own.
 *
 * Two things use every rule in here: the panel itself (§4.1 path 2, click a
 * tile) and the drag handler (§4.1 path 1, drop a tile on the canvas). They
 * have to agree — a tile that inserts a Columns block on click but silently
 * refuses to drop into a column would be the same feature behaving two ways.
 */

/**
 * §3 ④'s tile order, which is the reference product's own: "Text, Image,
 * Video, Table, Pricing table, Quote builder, Table of contents, Page break,
 * Smart content". Columns isn't in the spec's list but is a real insertable
 * block (§4.5), so it goes last rather than being hidden from the panel that's
 * supposed to be the complete palette.
 *
 * Deliberately a display concern only — `INSERTABLE_BLOCK_KINDS` stays the one
 * source of truth for *what* can be inserted, and a kind added there with no
 * entry here still appears (sorted to the end) rather than vanishing. A unit
 * test asserts the two lists cover each other, so "sorted to the end" is a
 * safety net, not the normal case.
 */
const PALETTE_BLOCK_ORDER: BlockType[] = [
	'text',
	'image',
	'video',
	'table',
	'pricing_table',
	'quote_builder',
	'toc',
	'page_break',
	'spacer',
	'smart_content',
	'columns',
];

function paletteOrderIndex(type: BlockType): number {
	const index = PALETTE_BLOCK_ORDER.indexOf(type);
	return index === -1 ? PALETTE_BLOCK_ORDER.length : index;
}

/** `INSERTABLE_BLOCK_KINDS` in §3 ④'s tile order. A copy — `sort` mutates, and that array is exported state. */
export const PALETTE_BLOCK_KINDS: InsertableBlockKind[] = [...INSERTABLE_BLOCK_KINDS].sort(
	(a, b) => paletteOrderIndex(a.type) - paletteOrderIndex(b.type)
);

/**
 * One glyph per block type. Shared with the canvas's own "+ Add block" menu —
 * the same block should never be a 🖼 in one place and a 🏞 in the other.
 */
export const BLOCK_ICONS: Partial<Record<BlockType, string>> = {
	text: '¶',
	image: '🖼',
	video: '▶',
	table: '▦',
	pricing_table: '$',
	quote_builder: '☑',
	toc: '≡',
	columns: '▥',
	smart_content: '◈',
	page_break: '⤓',
	spacer: '↕',
	field: '✎',
};

/** One glyph per field type, so §3 ④'s ten field tiles are scannable by shape rather than read line by line. */
export const FIELD_ICONS: Record<FieldType, string> = {
	signature: '✍',
	initials: 'AB',
	text: '▭',
	date: '📅',
	file_upload: '📎',
	checkbox: '☑',
	radio_group: '◉',
	dropdown: '▾',
	billing_details: '💳',
	stamp: '◎',
};

/** Where a block goes: which container, and at which index within it. */
export interface InsertTarget {
	container: BlockContainer;
	index: number;
}

/** dnd-kit `data` for a dragged palette tile. A field carries its role because §6.1 rule 1 never lets a field exist without one. */
export type PaletteDragData =
	| { kind: 'paletteBlock'; blockType: BlockType }
	| { kind: 'paletteField'; fieldType: FieldType; roleId: string };

/** Structural, rather than importing the store's `Selection` — this module would otherwise import the store that imports it. */
interface SelectionLike {
	pageId: string;
	blockId: string | null;
}

/**
 * A read-only "where does this block sit" — the plain-state counterpart to
 * `locateBlock`, which needs an Immer draft and throws where this returns null.
 * Local to the palette because insertion is the only caller that needs a
 * *position* (container + index) from plain state rather than the block itself.
 */
function findBlockPosition(page: Page, blockId: string): InsertTarget | null {
	const topLevel = page.blocks.findIndex((block) => block.id === blockId);
	if (topLevel !== -1) return { container: { pageId: page.id }, index: topLevel };

	for (const block of page.blocks) {
		if (block.type === 'columns') {
			for (const [column, columnBlocks] of block.columns.entries()) {
				const index = columnBlocks.findIndex((child) => child.id === blockId);
				if (index !== -1) {
					return { container: { pageId: page.id, parent: { columnsBlockId: block.id, column } }, index };
				}
			}
		} else if (block.type === 'smart_content') {
			const index = block.children.findIndex((child) => child.id === blockId);
			if (index !== -1) {
				return { container: { pageId: page.id, parent: { smartContentBlockId: block.id } }, index };
			}
		}
	}
	return null;
}

/**
 * §4.1 path 2: "insert after the currently selected block (or at end of the
 * current page)".
 *
 * "The current page" is resolved from the selection when there is one —
 * including a page-level selection with no block — and falls back to the *last*
 * page otherwise. Last rather than first because a template is authored
 * top-to-bottom: appending to the end of the document is the useful default,
 * and it matches where the canvas's own "+ Add block" sits.
 *
 * Inserting *after* a selected block inside a column or smart-content container
 * keeps the new block in that container, which is what "after this one" means
 * visually — the alternative (always inserting at the page's top level) would
 * make a click do something the author didn't point at.
 */
export function clickInsertTarget(pages: Page[], selection: SelectionLike | null): InsertTarget | null {
	if (pages.length === 0) return null;

	if (selection) {
		const page = pages.find((candidate) => candidate.id === selection.pageId);
		if (page) {
			if (selection.blockId) {
				const found = findBlockPosition(page, selection.blockId);
				// A stale selection (the block was deleted from under it) falls
				// through to the end of its page rather than returning null — the
				// click should still insert something somewhere sensible.
				if (found) return { container: found.container, index: found.index + 1 };
			}
			return { container: { pageId: page.id }, index: page.blocks.length };
		}
	}

	const lastPage = pages[pages.length - 1];
	if (!lastPage) return null;
	return { container: { pageId: lastPage.id }, index: lastPage.blocks.length };
}

/**
 * `clickInsertTarget` with §4.4 applied: clicking Columns or Smart content while
 * a block *inside* a column is selected can't mean "nest a container in a
 * container", so it falls back to the end of that page's top level rather than
 * refusing the click. The author asked for a Columns block on the page they're
 * looking at; the selection was only ever a hint about where.
 */
export function clickInsertTargetFor(pages: Page[], selection: SelectionLike | null, blockType: BlockType): InsertTarget | null {
	const target = clickInsertTarget(pages, selection);
	if (!target || paletteCanInsertInto(blockType, target.container)) return target;
	const page = pages.find((candidate) => candidate.id === target.container.pageId);
	if (!page) return null;
	return { container: { pageId: page.id }, index: page.blocks.length };
}

/**
 * §4.4's nesting rule, checked *before* a drop is offered rather than after.
 * `insertBlock` throws on a container-inside-a-container, which is the real
 * boundary; this is what keeps a drag from ever showing an insertion indicator
 * where the drop would blow up.
 */
export function paletteCanInsertInto(blockType: BlockType, container: BlockContainer): boolean {
	return !(container.parent && isContainerBlockType(blockType));
}

/**
 * What a tile produces. Image and Video can't be synthesized on the spot — one
 * needs a library image picked, the other a URL resolved through oEmbed — so
 * they resolve to `needsInput` and the panel takes over from there, remembering
 * where the block was headed. See `insertable.ts`'s `picksFromLibrary` /
 * `createFromUrl`.
 */
export type PaletteResolution =
	| { status: 'ready'; block: Block }
	| { status: 'needsInput'; blockType: BlockType }
	| { status: 'unavailable'; reason: string };

export function resolvePaletteInsert(data: PaletteDragData, body: TemplateBody): PaletteResolution {
	if (data.kind === 'paletteField') {
		// The role selector can go stale mid-drag: roles are edited in a
		// different panel, and §6.1 rule 1 forbids a field with no valid role
		// far more strongly than it minds a refused insert.
		if (!body.roles.some((role) => role.id === data.roleId)) {
			return { status: 'unavailable', reason: 'That recipient role no longer exists.' };
		}
		return { status: 'ready', block: createFieldBlockOfType(data.fieldType, data.roleId, collectAllFields(body)) };
	}

	const kind = PALETTE_BLOCK_KINDS.find((candidate) => candidate.type === data.blockType);
	if (!kind) return { status: 'unavailable', reason: `A ${data.blockType} block can't be inserted.` };
	if (kind.create) return { status: 'ready', block: kind.create() };
	return { status: 'needsInput', blockType: kind.type };
}

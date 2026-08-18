import type { Block, BlockType } from '../types';
import { createBlankTextBlock, createColumnsBlock, createPageBreakBlock, createTableBlock } from '../commands';
import { isContainerBlockType } from '../commands/blockTree';

export interface InsertableBlockKind {
	type: BlockType;
	label: string;
	create: () => Block;
}

/**
 * Block types offered by the canvas's own "+ Add block" menu — deliberately
 * a separate, explicit list from the block registry. Every `Block` type is
 * registered (even the unsupported ones, so existing data still renders),
 * but only types with a sensible "create one blank" factory belong here.
 * Add an entry as each block type's real editing support lands (§15's phase
 * order), not just its view.
 */
export const INSERTABLE_BLOCK_KINDS: InsertableBlockKind[] = [
	{ type: 'text', label: 'Text', create: createBlankTextBlock },
	{ type: 'page_break', label: 'Page break', create: createPageBreakBlock },
	{ type: 'columns', label: 'Columns (2)', create: () => createColumnsBlock(2) },
	{ type: 'table', label: 'Table (2×2)', create: () => createTableBlock(2, 2) },
];

/**
 * Same list, minus anything that would nest a container inside a container —
 * for the "+ Add block" menu rendered *inside* a column. `insertBlock`
 * already throws on this (§4.4 caps nesting at depth 2), so this is a UX
 * nicety on top of a real enforced boundary, not the boundary itself.
 */
export const COLUMN_INSERTABLE_BLOCK_KINDS: InsertableBlockKind[] = INSERTABLE_BLOCK_KINDS.filter(
	(kind) => !isContainerBlockType(kind.type)
);

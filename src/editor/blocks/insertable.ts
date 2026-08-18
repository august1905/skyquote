import type { Block, BlockType } from '../types';
import { createBlankTextBlock, createPageBreakBlock } from '../commands';

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
];

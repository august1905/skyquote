import type { Draft } from 'immer';
import type { BlockId, BlockPlacement, PageId, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, findPage, locateBlock } from './blockTree';

/** Nothing useful is left of a block narrower than this, and a zero-width one would be unclickable. */
export const MIN_PLACED_SIZE = 24;

/** Drag steps in whole grid units so blocks line up with each other without fighting the pointer; hold Alt for exact pixels. */
export const PLACEMENT_GRID = 8;

export function snapToGrid(px: number, snap: boolean): number {
	return snap ? Math.round(px / PLACEMENT_GRID) * PLACEMENT_GRID : Math.round(px);
}

/**
 * Keeps a placement on the paper.
 *
 * A block can sit right up against any edge — that's what full-bleed means — but
 * not past one, where the editor would let you drop something that simply isn't
 * in the PDF. Width is clamped before position so a box dragged wider than the
 * page ends up page-width rather than negative-x.
 */
export function clampPlacement(placement: BlockPlacement, pageWidth: number, pageHeight: number): BlockPlacement {
	const width = Math.min(Math.max(Math.round(placement.width), MIN_PLACED_SIZE), pageWidth);
	const height = placement.height === undefined ? undefined : Math.max(Math.round(placement.height), MIN_PLACED_SIZE);
	const clamped: BlockPlacement = {
		x: Math.min(Math.max(Math.round(placement.x), 0), pageWidth - width),
		// Not clamped to `pageHeight - height`: a block taller than the page is a
		// mistake worth *seeing* rather than one silently repositioned, and a block
		// sized by its content has no height to subtract in the first place.
		y: Math.min(Math.max(Math.round(placement.y), 0), Math.max(pageHeight - MIN_PLACED_SIZE, 0)),
		width,
	};
	return height === undefined ? clamped : { ...clamped, height };
}

/**
 * Pins a block at an exact spot, or (with `undefined`) returns it to the flow.
 *
 * Meant to be run with a `coalesceKey` of the block's id during a drag, exactly
 * like `setImageSize` and `setSpacerHeight` — one undo step per gesture rather
 * than one per pointer move.
 */
export function setBlockPlacement(pageId: PageId, blockId: BlockId, placement: BlockPlacement | undefined): Command {
	return {
		name: 'setBlockPlacement',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const { blocks, index } = locateBlock(page, blockId);
			const block = blockAt(blocks, index);
			const previous = block.placement ? { ...block.placement } : undefined;
			if (placement) block.placement = { ...placement };
			else delete block.placement;
			return setBlockPlacement(pageId, blockId, previous);
		},
	};
}

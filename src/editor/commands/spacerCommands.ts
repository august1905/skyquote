import type { Draft } from 'immer';
import type { BlockId, PageId, SpacerBlock, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, findPage, locateBlock } from './blockTree';

/** The range the height control offers. A spacer taller than a Letter page's content area can't do anything a page break wouldn't do better. */
export const MIN_SPACER_HEIGHT = 4;
export const MAX_SPACER_HEIGHT = 800;

export function clampSpacerHeight(height: number): number {
	if (!Number.isFinite(height)) return MIN_SPACER_HEIGHT;
	return Math.min(MAX_SPACER_HEIGHT, Math.max(MIN_SPACER_HEIGHT, Math.round(height)));
}

function findSpacerBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<SpacerBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'spacer') {
		throw new Error(`findSpacerBlock: block ${blockId} is a ${block.type} block, not spacer`);
	}
	return block;
}

/** Run through `runCommand` with a `coalesceKey` of the block's id while a drag is in progress, the same way `setImageSize` is — one undo step per resize, not one per pixel. */
export function setSpacerHeight(pageId: PageId, blockId: BlockId, height: number): Command {
	return {
		name: 'setSpacerHeight',
		apply(draft: Draft<TemplateBody>) {
			const block = findSpacerBlock(draft, pageId, blockId);
			const previous = block.height;
			block.height = clampSpacerHeight(height);
			return setSpacerHeight(pageId, blockId, previous);
		},
	};
}

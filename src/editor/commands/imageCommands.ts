import type { Draft } from 'immer';
import type { BlockId, ImageBlock, PageId, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, findPage, locateBlock } from './blockTree';

function findImageBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<ImageBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'image') {
		throw new Error(`findImageBlock: block ${blockId} is a ${block.type} block, not image`);
	}
	return block;
}

/** Meant to be run through `runCommand` with a `coalesceKey` of the block's id while a resize drag is in progress — see `ImageBlockView`'s pointer handlers. */
export function setImageSize(pageId: PageId, blockId: BlockId, width: number, height: number): Command {
	return {
		name: 'setImageSize',
		apply(draft: Draft<TemplateBody>) {
			const block = findImageBlock(draft, pageId, blockId);
			const previous = { width: block.width, height: block.height };
			block.width = width;
			block.height = height;
			return setImageSize(pageId, blockId, previous.width, previous.height);
		},
	};
}

/**
 * Coalesced per keystroke, the same way `renamePage` coalesces a page-name
 * edit. `alt` is a plain string, not an object Immer ever proxies — read
 * directly rather than through `snapshot()`/`current()`, which only accept
 * an actual draft (an early version of this called `snapshot` here and threw
 * "'current' expects a draft" the moment a test exercised the undo path).
 */
export function setImageAlt(pageId: PageId, blockId: BlockId, alt: string): Command {
	return {
		name: 'setImageAlt',
		apply(draft: Draft<TemplateBody>) {
			const block = findImageBlock(draft, pageId, blockId);
			const previousAlt = block.alt;
			block.alt = alt;
			return setImageAlt(pageId, blockId, previousAlt);
		},
	};
}

export function setImageShape(pageId: PageId, blockId: BlockId, shape: ImageBlock['shape']): Command {
	return {
		name: 'setImageShape',
		apply(draft: Draft<TemplateBody>) {
			const block = findImageBlock(draft, pageId, blockId);
			const previousShape = block.shape;
			block.shape = shape;
			return setImageShape(pageId, blockId, previousShape);
		},
	};
}

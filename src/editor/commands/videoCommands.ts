import type { Draft } from 'immer';
import type { BlockId, PageId, TemplateBody, VideoBlock } from '../types';
import type { Command } from './types';
import { blockAt, findPage, locateBlock } from './blockTree';

function findVideoBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<VideoBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'video') {
		throw new Error(`findVideoBlock: block ${blockId} is a ${block.type} block, not video`);
	}
	return block;
}

export function setVideoAutoplay(pageId: PageId, blockId: BlockId, autoplay: boolean): Command {
	return {
		name: 'setVideoAutoplay',
		apply(draft: Draft<TemplateBody>) {
			const block = findVideoBlock(draft, pageId, blockId);
			const previousAutoplay = block.autoplay;
			block.autoplay = autoplay;
			return setVideoAutoplay(pageId, blockId, previousAutoplay);
		},
	};
}

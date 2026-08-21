import type { Draft } from 'immer';
import type { BlockId, PageId, TableOfContentsBlock, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, findPage, locateBlock } from './blockTree';

function findTocBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<TableOfContentsBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'toc') throw new Error(`findTocBlock: block ${blockId} is a ${block.type} block, not toc`);
	return block;
}

/** §4.5: "heading depth to include, 1–3." Entries themselves are always derived at render time (see collectHeadings.ts) — this is the only thing actually stored on a `TableOfContentsBlock`. */
export function setTocLevels(pageId: PageId, blockId: BlockId, levels: number): Command {
	return {
		name: 'setTocLevels',
		apply(draft: Draft<TemplateBody>) {
			const block = findTocBlock(draft, pageId, blockId);
			const previous = block.levels;
			block.levels = levels;
			return setTocLevels(pageId, blockId, previous);
		},
	};
}

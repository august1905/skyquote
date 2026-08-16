import type { Draft } from 'immer';
import type { Block, BlockId, PageId, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, cloneBlockWithNewIds, findBlockIndex, findPage, snapshot } from './blockTree';

export function insertBlock(pageId: PageId, index: number, block: Block): Command {
	return {
		name: 'insertBlock',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			page.blocks.splice(index, 0, block as Draft<Block>);
			return deleteBlock(pageId, block.id);
		},
	};
}

export function deleteBlock(pageId: PageId, blockId: BlockId): Command {
	return {
		name: 'deleteBlock',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const index = findBlockIndex(page, blockId);
			// Read before mutating: snapshot() detaches this from the draft so
			// insertBlock's closure below can safely outlive this producer run —
			// see blockTree.ts's comment on snapshot() for why that matters.
			const removed = snapshot<Block>(blockAt(page, index));
			page.blocks.splice(index, 1);
			return insertBlock(pageId, index, removed);
		},
	};
}

export function duplicateBlock(pageId: PageId, blockId: BlockId): Command {
	return {
		name: 'duplicateBlock',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const index = findBlockIndex(page, blockId);
			const source = snapshot<Block>(blockAt(page, index));
			const clone = cloneBlockWithNewIds(source);
			page.blocks.splice(index + 1, 0, clone as Draft<Block>);
			return deleteBlock(pageId, clone.id);
		},
	};
}

/**
 * Moves a block within a page or across pages, to array index `toIndex` —
 * using the conventional "splice out, then splice into the resulting array
 * at toIndex" semantics (the same as e.g. dnd-kit's arrayMove), not "insert
 * before whatever currently sits at toIndex in the pre-move array". Concretely,
 * moving index 0 of [A,B,C,D] to index 2 yields [B,C,A,D] — A lands after C.
 */
export function moveBlock(fromPageId: PageId, blockId: BlockId, toPageId: PageId, toIndex: number): Command {
	return {
		name: 'moveBlock',
		apply(draft: Draft<TemplateBody>) {
			const fromPage = findPage(draft, fromPageId);
			const fromIndex = findBlockIndex(fromPage, blockId);
			const moved = snapshot<Block>(blockAt(fromPage, fromIndex));
			fromPage.blocks.splice(fromIndex, 1);

			const toPage = fromPageId === toPageId ? fromPage : findPage(draft, toPageId);
			toPage.blocks.splice(toIndex, 0, moved as Draft<Block>);

			// Safe to move straight back to fromIndex on undo: the undo stack's
			// invariant guarantees nothing else has touched this page between
			// this apply and its own undo being popped.
			return moveBlock(toPageId, blockId, fromPageId, fromIndex);
		},
	};
}

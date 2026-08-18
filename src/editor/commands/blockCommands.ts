import type { Draft } from 'immer';
import type { Block, BlockId, PageId, RichTextDoc, TemplateBody } from '../types';
import type { Command } from './types';
import {
	blockAt,
	cloneBlockWithNewIds,
	findPage,
	isContainerBlockType,
	locateBlock,
	resolveContainerBlocks,
	snapshot,
	type BlockContainer,
} from './blockTree';

export type { BlockContainer };

export function insertBlock(container: BlockContainer, index: number, block: Block): Command {
	return {
		name: 'insertBlock',
		apply(draft: Draft<TemplateBody>) {
			// §4.4 caps nesting at depth 2: a page's top-level blocks, and one
			// level of column inside a ColumnsBlock — never a container nested
			// inside another container.
			if (container.parent && isContainerBlockType(block.type)) {
				throw new Error(`insertBlock: cannot place a ${block.type} block inside a column — §4.4 caps nesting depth at 2`);
			}
			const blocks = resolveContainerBlocks(draft, container);
			blocks.splice(index, 0, block as Draft<Block>);
			return deleteBlock(container.pageId, block.id);
		},
	};
}

export function deleteBlock(pageId: PageId, blockId: BlockId): Command {
	return {
		name: 'deleteBlock',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const { container, blocks, index } = locateBlock(page, blockId);
			// Read before mutating: snapshot() detaches this from the draft so
			// insertBlock's closure below can safely outlive this producer run —
			// see blockTree.ts's comment on snapshot() for why that matters.
			const removed = snapshot<Block>(blockAt(blocks, index));
			blocks.splice(index, 1);
			return insertBlock(container, index, removed);
		},
	};
}

export function duplicateBlock(pageId: PageId, blockId: BlockId): Command {
	return {
		name: 'duplicateBlock',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const { blocks, index } = locateBlock(page, blockId);
			const source = snapshot<Block>(blockAt(blocks, index));
			const clone = cloneBlockWithNewIds(source);
			blocks.splice(index + 1, 0, clone as Draft<Block>);
			return deleteBlock(pageId, clone.id);
		},
	};
}

/**
 * Replaces a text block's document wholesale — Tiptap's `onUpdate` fires once
 * per transaction (effectively per keystroke), so this is meant to be run
 * through `runCommand` with a `coalesceKey` of the block's id, the same way
 * `renamePage` coalesces per-keystroke renames into one undo entry.
 *
 * Only defined for text blocks: `doc` is meaningless on any other block
 * type, and a caller passing the wrong id here is a programming error the
 * same way a stale block id is elsewhere in this file — worth throwing on,
 * not silently ignoring.
 */
export function setBlockDoc(pageId: PageId, blockId: BlockId, doc: RichTextDoc): Command {
	return {
		name: 'setBlockDoc',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const { blocks, index } = locateBlock(page, blockId);
			const block = blockAt(blocks, index);
			if (block.type !== 'text') {
				throw new Error(`setBlockDoc: block ${blockId} is a ${block.type} block, not text`);
			}
			const previousDoc = snapshot<RichTextDoc>(block.doc);
			block.doc = doc;
			return setBlockDoc(pageId, blockId, previousDoc);
		},
	};
}

/**
 * Moves a block from wherever it currently lives (a page's top level, or
 * inside one of a ColumnsBlock's columns) to `toContainer` at array index
 * `toIndex` — using the conventional "splice out, then splice into the
 * resulting array at toIndex" semantics (the same as e.g. dnd-kit's
 * arrayMove), not "insert before whatever currently sits at toIndex in the
 * pre-move array". Concretely, moving index 0 of [A,B,C,D] to index 2 yields
 * [B,C,A,D] — A lands after C.
 *
 * `fromContainer` is discovered via `locateBlock` rather than taken as a
 * parameter — every call site already knows the block's id and current
 * page, and re-deriving its container avoids ever passing a caller-supplied
 * "from" that's out of sync with where the block actually is.
 */
export function moveBlock(fromPageId: PageId, blockId: BlockId, toContainer: BlockContainer, toIndex: number): Command {
	return {
		name: 'moveBlock',
		apply(draft: Draft<TemplateBody>) {
			const fromPage = findPage(draft, fromPageId);
			const { container: fromContainer, blocks: fromBlocks, index: fromIndex } = locateBlock(fromPage, blockId);
			const moved = snapshot<Block>(blockAt(fromBlocks, fromIndex));

			if (toContainer.parent && isContainerBlockType(moved.type)) {
				throw new Error(`moveBlock: cannot place a ${moved.type} block inside a column — §4.4 caps nesting depth at 2`);
			}

			fromBlocks.splice(fromIndex, 1);
			const toBlocks = resolveContainerBlocks(draft, toContainer);
			toBlocks.splice(toIndex, 0, moved as Draft<Block>);

			// Safe to move straight back to fromIndex/fromContainer on undo: the
			// undo stack's invariant guarantees nothing else has touched this
			// page between this apply and its own undo being popped.
			return moveBlock(toContainer.pageId, blockId, fromContainer, fromIndex);
		},
	};
}

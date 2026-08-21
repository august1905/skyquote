import type { Draft } from 'immer';
import type { Block, BlockId, ConditionRule, PageId, SmartContentBlock, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, createSmartContentBlock, findPage, isContainerBlockType, locateBlock, snapshot } from './blockTree';

function findSmartContentBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<SmartContentBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'smart_content') throw new Error(`findSmartContentBlock: block ${blockId} is a ${block.type} block, not smart_content`);
	return block;
}

/**
 * Wraps one or more **top-level** blocks (the floating toolbar's "Smart
 * content" icon, §4.3) in a new `SmartContentBlock`, preserving their
 * relative document order regardless of selection order. Every id must
 * already be top-level — a container block can never live inside another
 * container (§4.4's depth-2 cap, enforced identically by `insertBlock`/
 * `moveBlock`), so a block already inside a column or another smart_content
 * can't be wrapped without breaking that rule.
 */
export function wrapInSmartContent(pageId: PageId, blockIds: BlockId[]): Command {
	return {
		name: 'wrapInSmartContent',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const located = blockIds.map((id) => locateBlock(page, id));
			if (located.some((l) => l.container.parent)) {
				throw new Error('wrapInSmartContent: every block must be top-level — a container cannot nest inside another container');
			}
			const targets = located.map((l) => blockAt(l.blocks, l.index));
			if (targets.some((b) => b.locked)) {
				throw new Error('wrapInSmartContent: locked blocks cannot be wrapped in smart content');
			}
			if (targets.some((b) => isContainerBlockType(b.type))) {
				throw new Error('wrapInSmartContent: cannot wrap a container block — §4.4 caps nesting depth at 2');
			}

			// Ascending, deduplicated original indices — captured before any
			// removal, since restoring them on undo (below) only works against
			// positions measured in the *original* array.
			const indices = [...new Set(located.map((l) => l.index))].sort((a, b) => a - b);
			const children: Block[] = indices.map((i) => snapshot(blockAt(page.blocks, i)));
			const insertAt = indices[0]!;
			for (const i of [...indices].reverse()) page.blocks.splice(i, 1);

			const wrapper = createSmartContentBlock(children);
			page.blocks.splice(insertAt, 0, wrapper as Draft<Block>);

			// Not `unwrapSmartContent(pageId, wrapper.id)`: that splices every
			// child back at the *wrapper's* single position, which is only a
			// correct undo when the wrapped blocks were already contiguous. For
			// a non-contiguous wrap (e.g. blocks 1 and 3 around an untouched
			// block 2), the wrap itself necessarily moves block 3 next to block
			// 1 — undoing it has to put each block back at its own original
			// index, not group them all back at one spot.
			return {
				name: 'unwrapSmartContentAtOriginalPositions',
				apply(undoDraft: Draft<TemplateBody>) {
					const undoPage = findPage(undoDraft, pageId);
					const wrapperIndex = undoPage.blocks.findIndex((b) => b.id === wrapper.id);
					if (wrapperIndex === -1) throw new Error(`wrapInSmartContent (undo): no smart_content block ${wrapper.id} on page ${pageId}`);
					const wrapperBlock = blockAt(undoPage.blocks, wrapperIndex);
					if (wrapperBlock.type !== 'smart_content') {
						throw new Error(`wrapInSmartContent (undo): block ${wrapper.id} is a ${wrapperBlock.type} block, not smart_content`);
					}
					const restoredChildren = snapshot(wrapperBlock.children);
					undoPage.blocks.splice(wrapperIndex, 1);
					// Ascending order: each insert only shifts positions at or
					// after it, which are exactly the not-yet-restored indices.
					indices.forEach((originalIndex, i) => {
						undoPage.blocks.splice(originalIndex, 0, restoredChildren[i] as Draft<Block>);
					});
					return wrapInSmartContent(pageId, restoredChildren.map((c) => c.id));
				},
			};
		},
	};
}

/** Inverse of {@link wrapInSmartContent} — also reachable directly (e.g. a "Remove wrapper" action) since it fully restores the wrapped blocks in place. */
export function unwrapSmartContent(pageId: PageId, smartContentBlockId: BlockId): Command {
	return {
		name: 'unwrapSmartContent',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const index = page.blocks.findIndex((b) => b.id === smartContentBlockId);
			if (index === -1) throw new Error(`unwrapSmartContent: no smart_content block ${smartContentBlockId} on page ${pageId}`);
			const block = blockAt(page.blocks, index);
			if (block.type !== 'smart_content') throw new Error(`unwrapSmartContent: block ${smartContentBlockId} is a ${block.type} block, not smart_content`);

			const children = snapshot(block.children);
			const childIds = children.map((c) => c.id);
			page.blocks.splice(index, 1, ...(children as Draft<Block>[]));

			return wrapInSmartContent(pageId, childIds);
		},
	};
}

/** Replaces the whole rule set + match mode in one command — the rule builder popover edits a local draft and commits it as a single undo step rather than one command per field change. */
export function setSmartContentRules(pageId: PageId, blockId: BlockId, rules: ConditionRule[], match: 'all' | 'any'): Command {
	return {
		name: 'setSmartContentRules',
		apply(draft: Draft<TemplateBody>) {
			const block = findSmartContentBlock(draft, pageId, blockId);
			const previousRules = snapshot(block.rules);
			const previousMatch = block.match;
			block.rules = rules;
			block.match = match;
			return setSmartContentRules(pageId, blockId, previousRules, previousMatch);
		},
	};
}

export function renameSmartContent(pageId: PageId, blockId: BlockId, name: string): Command {
	return {
		name: 'renameSmartContent',
		apply(draft: Draft<TemplateBody>) {
			const block = findSmartContentBlock(draft, pageId, blockId);
			const previous = block.name;
			block.name = name;
			return renameSmartContent(pageId, blockId, previous);
		},
	};
}

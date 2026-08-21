import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { SmartContentBlock, TextBlock } from '../types';
import type { Command } from './types';
import { deleteBlock, insertBlock, moveBlock } from './blockCommands';
import { createColumnsBlock } from './blockTree';
import { renameSmartContent, setSmartContentRules, unwrapSmartContent, wrapInSmartContent } from './smartContentCommands';
import { makeBody, makeBodyWithColumns, makeBodyWithSmartContent, makeConditionRule, makeTextBlock } from './testFixtures';

describe('wrapInSmartContent / unwrapSmartContent', () => {
	it('wraps a single top-level block; its inverse restores the original', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterWrap = produce(original, (draft) => {
			inverse = wrapInSmartContent('page-1', ['block-1']).apply(draft);
		});

		expect(afterWrap.pages[0]?.blocks).toHaveLength(2);
		const wrapper = afterWrap.pages[0]?.blocks[0] as SmartContentBlock;
		expect(wrapper.type).toBe('smart_content');
		expect(wrapper.children.map((b) => b.id)).toEqual(['block-1']);
		expect(afterWrap.pages[0]?.blocks[1]?.id).toBe('block-2');

		const afterUndo = produce(afterWrap, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('wraps multiple blocks in document order regardless of selection order, at the position of the first', () => {
		const original = produce(makeBody(), (draft) => {
			draft.pages[0]?.blocks.push(makeTextBlock('block-3', 'third'));
		});
		let inverse!: Command;

		// Selected out of order — block-3 then block-1 — but the wrapper's
		// children should still come out in original document order.
		const afterWrap = produce(original, (draft) => {
			inverse = wrapInSmartContent('page-1', ['block-3', 'block-1']).apply(draft);
		});

		expect(afterWrap.pages[0]?.blocks.map((b) => b.id)).toHaveLength(2);
		const wrapper = afterWrap.pages[0]?.blocks[0] as SmartContentBlock;
		expect(wrapper.type).toBe('smart_content');
		expect(wrapper.children.map((b) => b.id)).toEqual(['block-1', 'block-3']);
		expect(afterWrap.pages[0]?.blocks[1]?.id).toBe('block-2');

		const afterUndo = produce(afterWrap, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('rejects wrapping a block that is already nested inside a column — a container cannot nest inside another container', () => {
		const original = makeBodyWithColumns();
		expect(() =>
			produce(original, (draft) => {
				wrapInSmartContent('page-1', ['col0-block-1']).apply(draft);
			})
		).toThrow(/every block must be top-level/);
	});

	it('rejects wrapping a locked block', () => {
		const original = produce(makeBody(), (draft) => {
			(draft.pages[0]?.blocks[0] as TextBlock).locked = true;
		});
		expect(() =>
			produce(original, (draft) => {
				wrapInSmartContent('page-1', ['block-1']).apply(draft);
			})
		).toThrow(/locked blocks cannot be wrapped/);
	});

	it('rejects wrapping a container block itself — §4.4 caps nesting depth at 2', () => {
		const original = produce(makeBody(), (draft) => {
			draft.pages[0]?.blocks.push(createColumnsBlock(2));
		});
		const columnsId = original.pages[0]?.blocks[2]?.id as string;
		expect(() =>
			produce(original, (draft) => {
				wrapInSmartContent('page-1', [columnsId]).apply(draft);
			})
		).toThrow(/cannot wrap a container block/);
	});

	it('unwrapSmartContent splices the children back in place; its inverse re-wraps them', () => {
		const original = makeBodyWithSmartContent();
		let inverse!: Command;

		const afterUnwrap = produce(original, (draft) => {
			inverse = unwrapSmartContent('page-1', 'smart-1').apply(draft);
		});
		expect(afterUnwrap.pages[0]?.blocks.map((b) => b.id)).toEqual(['smart0-block-1']);

		const afterRewrap = produce(afterUnwrap, (draft) => {
			inverse.apply(draft);
		});
		const rewrapped = afterRewrap.pages[0]?.blocks[0] as SmartContentBlock;
		expect(rewrapped.type).toBe('smart_content');
		expect(rewrapped.children.map((b) => b.id)).toEqual(['smart0-block-1']);
	});
});

describe('nested blocks (Smart content)', () => {
	it('insertBlock places a block inside a SmartContentBlock\'s children; its inverse removes exactly that', () => {
		const original = makeBodyWithSmartContent();
		const newBlock = makeTextBlock('block-new', 'inserted');
		let inverse!: Command;

		const container = { pageId: 'page-1', parent: { smartContentBlockId: 'smart-1' } };
		const afterInsert = produce(original, (draft) => {
			inverse = insertBlock(container, 1, newBlock).apply(draft);
		});

		const wrapper = afterInsert.pages[0]?.blocks[0] as SmartContentBlock;
		expect(wrapper.children.map((b) => b.id)).toEqual(['smart0-block-1', 'block-new']);

		const afterUndo = produce(afterInsert, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('deleteBlock/moveBlock find a block nested in smart content by id alone, same as a top-level block', () => {
		const original = produce(makeBodyWithSmartContent(), (draft) => {
			const wrapper = draft.pages[0]?.blocks[0] as SmartContentBlock;
			wrapper.children.push(makeTextBlock('smart0-block-2', 'second'));
		});

		let moveInverse!: Command;
		const toContainer = { pageId: 'page-1', parent: { smartContentBlockId: 'smart-1' } };
		const afterMove = produce(original, (draft) => {
			moveInverse = moveBlock('page-1', 'smart0-block-1', toContainer, 1).apply(draft);
		});
		const movedWrapper = afterMove.pages[0]?.blocks[0] as SmartContentBlock;
		expect(movedWrapper.children.map((b) => b.id)).toEqual(['smart0-block-2', 'smart0-block-1']);
		const afterMoveUndo = produce(afterMove, (draft) => {
			moveInverse.apply(draft);
		});
		expect(afterMoveUndo).toEqual(original);

		let deleteInverse!: Command;
		const afterDelete = produce(original, (draft) => {
			deleteInverse = deleteBlock('page-1', 'smart0-block-1').apply(draft);
		});
		const afterDeleteWrapper = afterDelete.pages[0]?.blocks[0] as SmartContentBlock;
		expect(afterDeleteWrapper.children.map((b) => b.id)).toEqual(['smart0-block-2']);
		const afterDeleteUndo = produce(afterDelete, (draft) => {
			deleteInverse.apply(draft);
		});
		expect(afterDeleteUndo).toEqual(original);
	});

	it('insertBlock rejects placing a columns block inside smart content — §4.4 caps nesting at depth 2', () => {
		const original = makeBodyWithSmartContent();
		const container = { pageId: 'page-1', parent: { smartContentBlockId: 'smart-1' } };

		expect(() =>
			produce(original, (draft) => {
				insertBlock(container, 0, createColumnsBlock(2)).apply(draft);
			})
		).toThrow(/cannot place a columns block inside a column/);
	});
});

describe('setSmartContentRules', () => {
	it('replaces rules and match mode; its inverse restores the originals', () => {
		const original = makeBodyWithSmartContent();
		const rule = makeConditionRule();
		let inverse!: Command;

		const afterSet = produce(original, (draft) => {
			inverse = setSmartContentRules('page-1', 'smart-1', [rule], 'any').apply(draft);
		});
		const wrapper = afterSet.pages[0]?.blocks[0] as SmartContentBlock;
		expect(wrapper.rules).toEqual([rule]);
		expect(wrapper.match).toBe('any');

		const afterUndo = produce(afterSet, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('throws for a block that is not smart_content', () => {
		const original = makeBody();
		expect(() =>
			produce(original, (draft) => {
				setSmartContentRules('page-1', 'block-1', [], 'all').apply(draft);
			})
		).toThrow(/is a text block, not smart_content/);
	});
});

describe('renameSmartContent', () => {
	it('renames; its inverse restores the original name', () => {
		const original = makeBodyWithSmartContent();
		let inverse!: Command;

		const afterRename = produce(original, (draft) => {
			inverse = renameSmartContent('page-1', 'smart-1', 'Renewal terms').apply(draft);
		});
		expect((afterRename.pages[0]?.blocks[0] as SmartContentBlock).name).toBe('Renewal terms');

		const afterUndo = produce(afterRename, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

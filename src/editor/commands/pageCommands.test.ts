import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Command } from './types';
import { addPage, deletePage, duplicatePage, movePage, renamePage, setPageBackground } from './pageCommands';
import { createBlankPage } from './blockTree';
import { makeBody, makeBodyWithColumns, makeTextBlock } from './testFixtures';

describe('addPage / deletePage', () => {
	it('addPage inserts at the given index and reindexes order; its inverse removes it and restores order', () => {
		const original = makeBody();
		const newPage = createBlankPage('New Page');
		let inverse!: Command;

		const afterAdd = produce(original, (draft) => {
			inverse = addPage(1, newPage).apply(draft);
		});

		expect(afterAdd.pages.map((p) => p.id)).toEqual(['page-1', newPage.id, 'page-2']);
		expect(afterAdd.pages.map((p) => p.order)).toEqual([0, 1, 2]);

		const afterUndo = produce(afterAdd, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('deletePage removes the page and its blocks; its inverse restores the exact page, including its blocks', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterDelete = produce(original, (draft) => {
			inverse = deletePage('page-1').apply(draft);
		});

		expect(afterDelete.pages.map((p) => p.id)).toEqual(['page-2']);
		expect(afterDelete.pages.map((p) => p.order)).toEqual([0]);

		const afterUndo = produce(afterDelete, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('addPage / deletePage regression: reindexing over an already-frozen, untouched sibling', () => {
	it('add page A, add page B before it, then delete+undo B — across separate chained produce calls, not one', () => {
		// Regression test for a real bug: `current()` short-circuits to the
		// literal (already autoFreeze-frozen) base object when a draft was
		// never modified within its own producer. `deletePage`'s inverse
		// re-splices that exact snapshot back into the array, and
		// `reindexPageOrder` then writes `.order` on every page in it,
		// including the just-spliced-in one — which throws
		// "Cannot assign to read only property" once each produce() call here
		// is genuinely separate (as every real command application is),
		// rather than nested inside one shared producer the way a single
		// `produce(original, ...)` call in a test can accidentally paper
		// over. Fixed by `snapshot()` (blockTree.ts) always returning a
		// `structuredClone`d, guaranteed-unfrozen copy.
		const pageA = createBlankPage('A');
		const pageB = createBlankPage('B');
		let body = makeBody();
		body = produce(body, (draft) => void addPage(0, pageA).apply(draft));
		body = produce(body, (draft) => void addPage(0, pageB).apply(draft));

		let inverse!: Command;
		const afterDelete = produce(body, (draft) => {
			inverse = deletePage(pageB.id).apply(draft);
		});
		expect(afterDelete.pages.map((p) => p.id)).not.toContain(pageB.id);

		const afterUndo = produce(afterDelete, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo.pages.map((p) => p.id)).toEqual(body.pages.map((p) => p.id));
	});
});

describe('renamePage', () => {
	it('renames the page; its inverse restores the previous name', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterRename = produce(original, (draft) => {
			inverse = renamePage('page-1', 'Cover Page').apply(draft);
		});
		expect(afterRename.pages[0]?.name).toBe('Cover Page');

		const afterUndo = produce(afterRename, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('duplicatePage', () => {
	it('inserts the copy directly after the source, name-suffixed, and reindexes order', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterDuplicate = produce(original, (draft) => {
			inverse = duplicatePage('page-1').apply(draft);
		});

		expect(afterDuplicate.pages).toHaveLength(3);
		expect(afterDuplicate.pages[1]?.name).toBe('Page 1 (copy)');
		expect(afterDuplicate.pages.map((p) => p.order)).toEqual([0, 1, 2]);
		// Source untouched, and the copy is a genuinely new page, not an alias.
		expect(afterDuplicate.pages[0]?.id).toBe('page-1');
		expect(afterDuplicate.pages[1]?.id).not.toBe('page-1');

		const afterUndo = produce(afterDuplicate, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('gives every block in the copy a fresh id, so editing one page never touches the other', () => {
		const original = makeBody();

		const afterDuplicate = produce(original, (draft) => {
			duplicatePage('page-1').apply(draft);
		});

		const sourceIds = afterDuplicate.pages[0]!.blocks.map((b) => b.id);
		const copyIds = afterDuplicate.pages[1]!.blocks.map((b) => b.id);
		expect(copyIds).toHaveLength(sourceIds.length);
		// This is the invariant that matters: block ids must be unique across the
		// WHOLE document, because locateBlock searches by id alone and would
		// otherwise resolve a shared id to whichever copy it found first, making
		// the other permanently unreachable.
		expect(new Set([...sourceIds, ...copyIds]).size).toBe(sourceIds.length + copyIds.length);
	});

	it('re-ids blocks nested inside a container too, not just the top level', () => {
		const original = makeBodyWithColumns();

		const afterDuplicate = produce(original, (draft) => {
			duplicatePage('page-1').apply(draft);
		});

		const nestedIdsOf = (pageIndex: number) => {
			const block = afterDuplicate.pages[pageIndex]?.blocks[0];
			if (block?.type !== 'columns') throw new Error('expected a columns block');
			return block.columns.flat().map((b) => b.id);
		};
		const sourceNested = nestedIdsOf(0);
		const copyNested = nestedIdsOf(1);
		expect(copyNested).toHaveLength(sourceNested.length);
		expect(new Set([...sourceNested, ...copyNested]).size).toBe(sourceNested.length + copyNested.length);
	});
});

describe('movePage', () => {
	it('uses arrayMove semantics — moving index 0 to index 1 lands it after the old index 1', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterMove = produce(original, (draft) => {
			inverse = movePage('page-1', 1).apply(draft);
		});
		expect(afterMove.pages.map((p) => p.id)).toEqual(['page-2', 'page-1']);
		expect(afterMove.pages.map((p) => p.order)).toEqual([0, 1]);

		const afterUndo = produce(afterMove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('moves a later page back to the front', () => {
		const original = produce(makeBody(), (draft) => {
			draft.pages.push({ id: 'page-3', name: 'Page 3', order: 2, blocks: [makeTextBlock('block-9')] });
		});

		const afterMove = produce(original, (draft) => {
			movePage('page-3', 0).apply(draft);
		});
		expect(afterMove.pages.map((p) => p.id)).toEqual(['page-3', 'page-1', 'page-2']);
		expect(afterMove.pages.map((p) => p.order)).toEqual([0, 1, 2]);
	});

	it('clamps an out-of-range target instead of throwing, and a no-op move still round-trips', () => {
		const original = makeBody();

		const afterFarMove = produce(original, (draft) => {
			movePage('page-1', 99).apply(draft);
		});
		expect(afterFarMove.pages.map((p) => p.id)).toEqual(['page-2', 'page-1']);

		let inverse!: Command;
		const afterNoOp = produce(original, (draft) => {
			inverse = movePage('page-1', 0).apply(draft);
		});
		expect(afterNoOp).toEqual(original);
		const afterUndo = produce(afterNoOp, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('setPageBackground', () => {
	it('sets a background colour; its inverse removes the property entirely rather than leaving an empty object', () => {
		const original = makeBody();
		expect(original.pages[0]?.background).toBeUndefined();
		let inverse!: Command;

		const afterSet = produce(original, (draft) => {
			inverse = setPageBackground('page-1', { color: '#ff0000' }).apply(draft);
		});
		expect(afterSet.pages[0]?.background).toEqual({ color: '#ff0000' });

		const afterUndo = produce(afterSet, (draft) => {
			inverse.apply(draft);
		});
		// toEqual would pass for `{ background: undefined }` too; this asserts
		// the round trip is exact, because "no background" is a meaningful state
		// (inherit the theme) distinct from an explicit colour.
		expect('background' in afterUndo.pages[0]!).toBe(false);
		expect(afterUndo).toEqual(original);
	});

	it('replaces an existing background and restores the previous one on undo', () => {
		const withRed = produce(makeBody(), (draft) => {
			setPageBackground('page-1', { color: '#ff0000' }).apply(draft);
		});
		let inverse!: Command;

		const afterSet = produce(withRed, (draft) => {
			inverse = setPageBackground('page-1', { color: '#00ff00' }).apply(draft);
		});
		expect(afterSet.pages[0]?.background).toEqual({ color: '#00ff00' });

		const afterUndo = produce(afterSet, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo.pages[0]?.background).toEqual({ color: '#ff0000' });
	});

	it('preserves the imageUrl half of the shape when only the colour changes', () => {
		const withImage = produce(makeBody(), (draft) => {
			setPageBackground('page-1', { imageUrl: 'https://example.com/bg.png' }).apply(draft);
		});

		const afterColor = produce(withImage, (draft) => {
			const existing = withImage.pages[0]?.background;
			setPageBackground('page-1', { ...existing, color: '#123456' }).apply(draft);
		});
		expect(afterColor.pages[0]?.background).toEqual({ imageUrl: 'https://example.com/bg.png', color: '#123456' });
	});
});

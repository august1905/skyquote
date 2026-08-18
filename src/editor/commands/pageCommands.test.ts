import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Command } from './types';
import { addPage, deletePage, renamePage } from './pageCommands';
import { createBlankPage } from './blockTree';
import { makeBody } from './testFixtures';

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

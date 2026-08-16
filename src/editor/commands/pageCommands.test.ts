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

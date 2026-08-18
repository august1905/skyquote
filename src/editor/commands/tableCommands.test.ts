import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { RichTextDoc, TableBlock } from '../types';
import type { Command } from './types';
import { addColumn, addRow, removeColumn, removeRow, setCellDoc, toggleHeaderRow } from './tableCommands';
import { createColumnsBlock } from './blockTree';
import { insertBlock } from './blockCommands';
import { makeBodyWithTable, makeCell } from './testFixtures';

// Same "apply and its inverse in two separate produce() calls" discipline as
// blockCommands.test.ts — see that file's top-of-file comment for why.

describe('setCellDoc', () => {
	it('replaces one cell; its inverse restores it, and the other cells are untouched', () => {
		const original = makeBodyWithTable();
		const newDoc: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }] };
		let inverse!: Command;

		const afterEdit = produce(original, (draft) => {
			inverse = setCellDoc('page-1', 'table-1', 0, 1, newDoc).apply(draft);
		});
		const table = afterEdit.pages[0]?.blocks[0] as TableBlock;
		expect(table.rows[0]?.cells[1]?.doc).toEqual(newDoc);
		expect(table.rows[0]?.cells[0]).toEqual((original.pages[0]?.blocks[0] as TableBlock).rows[0]?.cells[0]);

		const afterUndo = produce(afterEdit, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('throws for an out-of-range row or column', () => {
		const original = makeBodyWithTable();
		expect(() =>
			produce(original, (draft) => {
				setCellDoc('page-1', 'table-1', 5, 0, { type: 'doc', content: [] }).apply(draft);
			})
		).toThrow(/no row 5/);
		expect(() =>
			produce(original, (draft) => {
				setCellDoc('page-1', 'table-1', 0, 5, { type: 'doc', content: [] }).apply(draft);
			})
		).toThrow(/no cell at row 0, column 5/);
	});
});

describe('addRow / removeRow', () => {
	it('addRow inserts a blank row with one cell per existing column; its inverse removes exactly that', () => {
		const original = makeBodyWithTable();
		let inverse!: Command;

		const afterAdd = produce(original, (draft) => {
			inverse = addRow('page-1', 'table-1', 1).apply(draft);
		});
		const table = afterAdd.pages[0]?.blocks[0] as TableBlock;
		expect(table.rows).toHaveLength(3);
		expect(table.rows[1]?.cells).toHaveLength(2);
		expect(table.rows[1]?.cells[0]?.doc.content).toEqual([{ type: 'paragraph', content: [] }]);

		const afterUndo = produce(afterAdd, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('removeRow removes the row; its inverse re-inserts it with identical content at the same index', () => {
		const original = makeBodyWithTable();
		let inverse!: Command;

		const afterRemove = produce(original, (draft) => {
			inverse = removeRow('page-1', 'table-1', 0).apply(draft);
		});
		const table = afterRemove.pages[0]?.blocks[0] as TableBlock;
		expect(table.rows).toHaveLength(1);
		expect(table.rows[0]?.cells[0]?.doc.content[0]).toMatchObject({ content: [{ text: 'r1c0' }] });

		const afterUndo = produce(afterRemove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('refuses to remove the last row', () => {
		const original = produce(makeBodyWithTable(), (draft) => {
			(draft.pages[0]?.blocks[0] as TableBlock).rows.splice(1, 1);
		});
		expect(() =>
			produce(original, (draft) => {
				removeRow('page-1', 'table-1', 0).apply(draft);
			})
		).toThrow(/only one row left/);
	});
});

describe('addColumn / removeColumn', () => {
	it('addColumn inserts a blank cell into every row and re-normalizes column widths; its inverse removes exactly that', () => {
		const original = makeBodyWithTable();
		let inverse!: Command;

		const afterAdd = produce(original, (draft) => {
			inverse = addColumn('page-1', 'table-1', 1).apply(draft);
		});
		const table = afterAdd.pages[0]?.blocks[0] as TableBlock;
		expect(table.columnWidths).toEqual([1 / 3, 1 / 3, 1 / 3]);
		expect(table.rows[0]?.cells).toHaveLength(3);
		expect(table.rows[0]?.cells[1]?.doc.content).toEqual([{ type: 'paragraph', content: [] }]);
		expect(table.rows[0]?.cells[2]?.doc.content[0]).toMatchObject({ content: [{ text: 'r0c1' }] });

		const afterUndo = produce(afterAdd, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('removeColumn removes that column from every row and re-normalizes widths; its inverse restores identical content', () => {
		const original = makeBodyWithTable();
		let inverse!: Command;

		const afterRemove = produce(original, (draft) => {
			inverse = removeColumn('page-1', 'table-1', 0).apply(draft);
		});
		const table = afterRemove.pages[0]?.blocks[0] as TableBlock;
		expect(table.columnWidths).toEqual([1]);
		expect(table.rows[0]?.cells).toHaveLength(1);
		expect(table.rows[0]?.cells[0]?.doc.content[0]).toMatchObject({ content: [{ text: 'r0c1' }] });
		expect(table.rows[1]?.cells[0]?.doc.content[0]).toMatchObject({ content: [{ text: 'r1c1' }] });

		const afterUndo = produce(afterRemove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('refuses to remove the last column', () => {
		const original = produce(makeBodyWithTable(), (draft) => {
			const table = draft.pages[0]?.blocks[0] as TableBlock;
			table.columnWidths = [1];
			table.rows.forEach((row) => row.cells.splice(1, 1));
		});
		expect(() =>
			produce(original, (draft) => {
				removeColumn('page-1', 'table-1', 0).apply(draft);
			})
		).toThrow(/only one column left/);
	});
});

describe('toggleHeaderRow', () => {
	it('flips headerRow; applying its own inverse flips it back', () => {
		const original = makeBodyWithTable();
		expect((original.pages[0]?.blocks[0] as TableBlock).headerRow).toBe(true);
		let inverse!: Command;

		const afterToggle = produce(original, (draft) => {
			inverse = toggleHeaderRow('page-1', 'table-1').apply(draft);
		});
		expect((afterToggle.pages[0]?.blocks[0] as TableBlock).headerRow).toBe(false);

		const afterUndo = produce(afterToggle, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('a table nested inside a Columns block', () => {
	it('is addressed by id alone, same as a top-level table', () => {
		const original = produce(makeBodyWithTable(), (draft) => {
			const columns = createColumnsBlock(2);
			columns.columns[0] = [
				{ id: 'nested-table', type: 'table', locked: false, style: {}, rows: [{ cells: [makeCell('a'), makeCell('b')] }], columnWidths: [0.5, 0.5], headerRow: false },
			];
			insertBlock({ pageId: 'page-1' }, 1, columns).apply(draft);
		});

		const afterEdit = produce(original, (draft) => {
			setCellDoc('page-1', 'nested-table', 0, 0, { type: 'doc', content: [] }).apply(draft);
			addRow('page-1', 'nested-table', 1).apply(draft);
		});

		const columnsBlock = afterEdit.pages[0]?.blocks[1];
		if (columnsBlock?.type !== 'columns') throw new Error('expected a columns block');
		const nestedTable = columnsBlock.columns[0]?.[0];
		if (nestedTable?.type !== 'table') throw new Error('expected a nested table block');
		expect(nestedTable.rows).toHaveLength(2);
		expect(nestedTable.rows[0]?.cells[0]?.doc.content).toEqual([]);
	});
});

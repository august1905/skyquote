import type { Draft } from 'immer';
import type { BlockId, PageId, RichTextDoc, TableBlock, TableCell, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, createBlankCell, findPage, locateBlock, snapshot } from './blockTree';

/**
 * A `TableCell` has no id of its own — cells are addressed by (row, column)
 * position within one already-located `TableBlock`, never independently via
 * the generic block commands the way a nested `ColumnsBlock` child is.
 */
function findTableBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<TableBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'table') {
		throw new Error(`findTableBlock: block ${blockId} is a ${block.type} block, not table`);
	}
	return block;
}

function cellAt(table: Draft<TableBlock>, row: number, column: number): Draft<TableCell> {
	const tableRow = table.rows[row];
	if (!tableRow) throw new Error(`cellAt: no row ${row} on table ${table.id}`);
	const cell = tableRow.cells[column];
	if (!cell) throw new Error(`cellAt: no cell at row ${row}, column ${column} on table ${table.id}`);
	return cell;
}

/**
 * Widths are always kept equal across columns — there's no UI yet to drag-
 * resize an individual column (§4.5's "draggable divider" is deferred, same
 * as `ColumnsBlock`'s), so there's nothing for add/removeColumn to preserve
 * beyond "still sums to 1". Revisit once resize is real.
 */
function equalWidths(columnCount: number): number[] {
	return Array.from({ length: columnCount }, () => 1 / columnCount);
}

export function setCellDoc(pageId: PageId, blockId: BlockId, row: number, column: number, doc: RichTextDoc): Command {
	return {
		name: 'setCellDoc',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			const cell = cellAt(table, row, column);
			const previousDoc = snapshot<RichTextDoc>(cell.doc);
			cell.doc = doc;
			return setCellDoc(pageId, blockId, row, column, previousDoc);
		},
	};
}

/** Not exported — the only ways to add a row are "a blank one" (`addRow`) or "undo a `removeRow`", both of which already have the row content in hand. */
function insertRow(pageId: PageId, blockId: BlockId, index: number, row: { cells: TableCell[] }): Command {
	return {
		name: 'insertRow',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			table.rows.splice(index, 0, row as Draft<{ cells: TableCell[] }>);
			return removeRow(pageId, blockId, index);
		},
	};
}

export function addRow(pageId: PageId, blockId: BlockId, index: number): Command {
	return {
		name: 'addRow',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			const blankRow = { cells: table.columnWidths.map(() => createBlankCell()) };
			return insertRow(pageId, blockId, index, blankRow).apply(draft);
		},
	};
}

export function removeRow(pageId: PageId, blockId: BlockId, index: number): Command {
	return {
		name: 'removeRow',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			if (table.rows.length <= 1) {
				throw new Error(`removeRow: table ${blockId} has only one row left — a table needs at least one`);
			}
			const row = table.rows[index];
			if (!row) throw new Error(`removeRow: no row ${index} on table ${blockId}`);
			const removed = snapshot<{ cells: TableCell[] }>(row);
			table.rows.splice(index, 1);
			return insertRow(pageId, blockId, index, removed);
		},
	};
}

/** Not exported — same reasoning as {@link insertRow}. */
function insertColumn(pageId: PageId, blockId: BlockId, index: number, cellsByRow: TableCell[]): Command {
	return {
		name: 'insertColumn',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			table.rows.forEach((row, rowIndex) => {
				const cell = cellsByRow[rowIndex];
				if (!cell) throw new Error(`insertColumn: missing cell content for row ${rowIndex}`);
				row.cells.splice(index, 0, cell as Draft<TableCell>);
			});
			table.columnWidths = equalWidths(table.columnWidths.length + 1);
			return removeColumn(pageId, blockId, index);
		},
	};
}

export function addColumn(pageId: PageId, blockId: BlockId, index: number): Command {
	return {
		name: 'addColumn',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			const cellsByRow = table.rows.map(() => createBlankCell());
			return insertColumn(pageId, blockId, index, cellsByRow).apply(draft);
		},
	};
}

export function removeColumn(pageId: PageId, blockId: BlockId, index: number): Command {
	return {
		name: 'removeColumn',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			if (table.columnWidths.length <= 1) {
				throw new Error(`removeColumn: table ${blockId} has only one column left — a table needs at least one`);
			}
			const cellsByRow = table.rows.map((row) => {
				const cell = row.cells[index];
				if (!cell) throw new Error(`removeColumn: no cell at column ${index}`);
				return snapshot<TableCell>(cell);
			});
			table.rows.forEach((row) => row.cells.splice(index, 1));
			table.columnWidths = equalWidths(table.columnWidths.length - 1);
			return insertColumn(pageId, blockId, index, cellsByRow);
		},
	};
}

export function toggleHeaderRow(pageId: PageId, blockId: BlockId): Command {
	return {
		name: 'toggleHeaderRow',
		apply(draft: Draft<TemplateBody>) {
			const table = findTableBlock(draft, pageId, blockId);
			table.headerRow = !table.headerRow;
			return toggleHeaderRow(pageId, blockId);
		},
	};
}

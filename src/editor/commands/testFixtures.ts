import type { ColumnsBlock, TableBlock, TableCell, TemplateBody, TextBlock } from '../types';

// Shared across command/store tests. Not a .test.ts file itself — vitest's
// include glob (src/**/*.test.ts) skips it, so it can export plain helpers
// without also being collected as a (empty) test suite.

export function makeTextBlock(id: string, text = ''): TextBlock {
	return {
		id,
		type: 'text',
		locked: false,
		style: {},
		doc: { type: 'doc', content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [] },
	};
}

export function makeColumnsBlock(id: string, columns: TextBlock[][]): ColumnsBlock {
	return {
		id,
		type: 'columns',
		locked: false,
		style: {},
		widths: columns.map(() => 1 / columns.length),
		columns,
	};
}

export function makeBody(): TemplateBody {
	return {
		pages: [
			{
				id: 'page-1',
				name: 'Page 1',
				order: 0,
				blocks: [makeTextBlock('block-1', 'first'), makeTextBlock('block-2', 'second')],
			},
			{
				id: 'page-2',
				name: 'Page 2',
				order: 1,
				blocks: [makeTextBlock('block-3', 'third')],
			},
		],
		roles: [],
		variables: [],
		settings: {
			pageSize: 'LETTER',
			orientation: 'portrait',
			margins: { top: 0, right: 0, bottom: 0, left: 0 },
			showPageNumbers: false,
		},
	};
}

export function makeCell(text = ''): TableCell {
	return {
		doc: { type: 'doc', content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [] },
		colspan: 1,
		rowspan: 1,
		style: {},
	};
}

export function makeTableBlock(id: string, rows: TableCell[][]): TableBlock {
	const columnCount = rows[0]?.length ?? 0;
	return {
		id,
		type: 'table',
		locked: false,
		style: {},
		rows: rows.map((cells) => ({ cells })),
		columnWidths: Array.from({ length: columnCount }, () => 1 / columnCount),
		headerRow: true,
	};
}

/** A page with a lone 2×2 TableBlock ("table-1") — for exercising cell/row/column addressing. */
export function makeBodyWithTable(): TemplateBody {
	return {
		pages: [
			{
				id: 'page-1',
				name: 'Page 1',
				order: 0,
				blocks: [
					makeTableBlock('table-1', [
						[makeCell('r0c0'), makeCell('r0c1')],
						[makeCell('r1c0'), makeCell('r1c1')],
					]),
				],
			},
		],
		roles: [],
		variables: [],
		settings: {
			pageSize: 'LETTER',
			orientation: 'portrait',
			margins: { top: 0, right: 0, bottom: 0, left: 0 },
			showPageNumbers: false,
		},
	};
}

/** A page with a lone ColumnsBlock ("columns-1"), two columns each holding one text block — for exercising nested addressing. */
export function makeBodyWithColumns(): TemplateBody {
	return {
		pages: [
			{
				id: 'page-1',
				name: 'Page 1',
				order: 0,
				blocks: [
					makeColumnsBlock('columns-1', [
						[makeTextBlock('col0-block-1', 'left')],
						[makeTextBlock('col1-block-1', 'right')],
					]),
				],
			},
		],
		roles: [],
		variables: [],
		settings: {
			pageSize: 'LETTER',
			orientation: 'portrait',
			margins: { top: 0, right: 0, bottom: 0, left: 0 },
			showPageNumbers: false,
		},
	};
}

import type { ColumnsBlock, FieldBlock, FillableField, ImageBlock, PricingItem, PricingTableBlock, QuoteBuilderBlock, RichTextNode, TableBlock, TableCell, TemplateBody, TemplateSettings, TextBlock, VideoBlock } from '../types';
import { money } from '../types';
import { defaultTheme } from './themeCommands';

// Shared across command/store tests. Not a .test.ts file itself — vitest's
// include glob (src/**/*.test.ts) skips it, so it can export plain helpers
// without also being collected as a (empty) test suite.

function makeSettings(): TemplateSettings {
	return {
		pageSize: 'LETTER',
		orientation: 'portrait',
		margins: { top: 0, right: 0, bottom: 0, left: 0 },
		showPageNumbers: false,
		theme: defaultTheme(),
	};
}

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
		settings: makeSettings(),
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
		settings: makeSettings(),
	};
}

export function makeImageBlock(id: string, overrides: Partial<ImageBlock> = {}): ImageBlock {
	return {
		id,
		type: 'image',
		locked: false,
		style: {},
		assetId: 'asset-1',
		url: '/assets/asset-1/file',
		alt: '',
		width: 200,
		height: 100,
		shape: 'rect',
		...overrides,
	};
}

/** A page with a lone ImageBlock ("image-1") — for exercising size/alt/shape commands. */
export function makeBodyWithImage(): TemplateBody {
	return {
		pages: [
			{
				id: 'page-1',
				name: 'Page 1',
				order: 0,
				blocks: [makeImageBlock('image-1')],
			},
		],
		roles: [],
		variables: [],
		settings: makeSettings(),
	};
}

export function makeVideoBlock(id: string, overrides: Partial<VideoBlock> = {}): VideoBlock {
	return {
		id,
		type: 'video',
		locked: false,
		style: {},
		provider: 'youtube',
		url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
		autoplay: false,
		...overrides,
	};
}

/** A page with a lone VideoBlock ("video-1") — for exercising the autoplay-toggle command. */
export function makeBodyWithVideo(): TemplateBody {
	return {
		pages: [
			{
				id: 'page-1',
				name: 'Page 1',
				order: 0,
				blocks: [makeVideoBlock('video-1')],
			},
		],
		roles: [],
		variables: [],
		settings: makeSettings(),
	};
}

export function makeField(id: string, roleId: string, overrides: Partial<FillableField> = {}): FillableField {
	return { id, type: 'text', roleId, name: `Text field ${id}`, required: false, ...overrides };
}

/** An inline `fillableField` atom node, the same shape Tiptap serializes one to. */
export function makeFieldNode(field: FillableField): RichTextNode {
	return { type: 'fillableField', attrs: { field } };
}

export function makeFieldBlock(id: string, field: FillableField): FieldBlock {
	return { id, type: 'field', locked: false, style: {}, field };
}

/**
 * Fields in every location `collectAllFields`/`fieldCommands.ts`'s walkers
 * need to handle: inline in a text block's doc, inline in a table cell's
 * doc, a standalone `FieldBlock`, and inline nested inside a `ColumnsBlock`'s
 * column — for exercising the whole-tree field walkers.
 */
export function makeBodyWithFields(): TemplateBody {
	const inlineInText = makeField('field-text', 'role-a');
	const inlineInCell = makeField('field-cell', 'role-b');
	const standalone = makeField('field-standalone', 'role-a');
	const inlineInColumn = makeField('field-column', 'role-b');

	const textBlock: TextBlock = {
		id: 'block-text',
		type: 'text',
		locked: false,
		style: {},
		doc: { type: 'doc', content: [{ type: 'paragraph', content: [makeFieldNode(inlineInText)] }] },
	};

	const tableBlock: TableBlock = {
		id: 'block-table',
		type: 'table',
		locked: false,
		style: {},
		rows: [{ cells: [{ doc: { type: 'doc', content: [{ type: 'paragraph', content: [makeFieldNode(inlineInCell)] }] }, colspan: 1, rowspan: 1, style: {} }] }],
		columnWidths: [1],
		headerRow: true,
	};

	const fieldBlock = makeFieldBlock('block-field', standalone);

	const columnsBlock: ColumnsBlock = {
		id: 'block-columns',
		type: 'columns',
		locked: false,
		style: {},
		widths: [1],
		columns: [
			[
				{
					id: 'block-column-text',
					type: 'text',
					locked: false,
					style: {},
					doc: { type: 'doc', content: [{ type: 'paragraph', content: [makeFieldNode(inlineInColumn)] }] },
				},
			],
		],
	};

	return {
		pages: [{ id: 'page-1', name: 'Page 1', order: 0, blocks: [textBlock, tableBlock, fieldBlock, columnsBlock] }],
		roles: [
			{ id: 'role-a', name: 'Role A', color: '#111', order: 0, isSender: false },
			{ id: 'role-b', name: 'Role B', color: '#222', order: 1, isSender: false },
		],
		variables: [],
		settings: makeSettings(),
	};
}

export function makePricingItem(id: string, overrides: Partial<PricingItem> = {}): PricingItem {
	return {
		id,
		sectionId: null,
		name: `Item ${id}`,
		description: '',
		qty: 1,
		price: money(1000),
		optional: false,
		selected: true,
		customFields: {},
		...overrides,
	};
}

export function makePricingTableBlock(id: string, items: PricingItem[] = [], overrides: Partial<PricingTableBlock> = {}): PricingTableBlock {
	return {
		id,
		type: 'pricing_table',
		locked: false,
		style: {},
		currency: 'USD',
		columns: [],
		sections: [],
		items,
		settings: {
			allowRecipientQtyEdit: false,
			allowRecipientSelectOptional: false,
			showSubtotal: true,
			showDiscount: true,
			showTax: true,
			showTotal: true,
		},
		...overrides,
	};
}

/** A page with a lone `PricingTableBlock` ("pricing-1") holding one item — for exercising item/section/settings commands. */
export function makeBodyWithPricingTable(): TemplateBody {
	return {
		pages: [{ id: 'page-1', name: 'Page 1', order: 0, blocks: [makePricingTableBlock('pricing-1', [makePricingItem('item-1')])] }],
		roles: [],
		variables: [],
		settings: makeSettings(),
	};
}

export function makeQuoteBuilderBlock(id: string, groups: QuoteBuilderBlock['groups'] = []): QuoteBuilderBlock {
	return { id, type: 'quote_builder', locked: false, style: {}, currency: 'USD', groups };
}

/** A page with a lone `QuoteBuilderBlock` ("quote-1") holding one group with one option — for exercising group/option commands. */
export function makeBodyWithQuoteBuilder(): TemplateBody {
	const group = { id: 'group-1', name: 'Frequency', selection: 'single' as const, required: true, options: [makePricingItem('option-1')] };
	return {
		pages: [{ id: 'page-1', name: 'Page 1', order: 0, blocks: [makeQuoteBuilderBlock('quote-1', [group])] }],
		roles: [],
		variables: [],
		settings: makeSettings(),
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
		settings: makeSettings(),
	};
}

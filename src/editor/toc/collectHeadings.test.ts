import { describe, expect, it } from 'vitest';
import type { RichTextDoc, TemplateBody, TextBlock } from '../types';
import { makeBody, makeColumnsBlock, makeSmartContentBlock, makeTableBlock, makeCell, makeTextBlock } from '../commands/testFixtures';
import { collectHeadings } from './collectHeadings';

function headingDoc(level: number, text: string): RichTextDoc {
	return { type: 'doc', content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] }] };
}

function makeHeadingTextBlock(id: string, level: number, text: string): TextBlock {
	return { ...makeTextBlock(id), doc: headingDoc(level, text) };
}

function bodyWithBlocks(blocks: TextBlock[]): TemplateBody {
	const body = makeBody();
	body.pages[0]!.blocks = blocks;
	return body;
}

describe('collectHeadings', () => {
	it('finds top-level headings in document order, extracting level and text', () => {
		const body = bodyWithBlocks([makeHeadingTextBlock('h1', 1, 'Introduction'), makeTextBlock('p1', 'some body text'), makeHeadingTextBlock('h2', 2, 'Pricing')]);
		expect(collectHeadings(body, 3)).toEqual([
			{ id: 'h1-0', blockId: 'h1', level: 1, text: 'Introduction' },
			{ id: 'h2-1', blockId: 'h2', level: 2, text: 'Pricing' },
		]);
	});

	it('filters out headings deeper than maxLevel (§4.5\'s "heading depth to include")', () => {
		const body = bodyWithBlocks([makeHeadingTextBlock('h1', 1, 'One'), makeHeadingTextBlock('h2', 2, 'Two'), makeHeadingTextBlock('h3', 3, 'Three')]);
		expect(collectHeadings(body, 2).map((h) => h.text)).toEqual(['One', 'Two']);
		expect(collectHeadings(body, 1).map((h) => h.text)).toEqual(['One']);
	});

	it('a plain paragraph is not a heading, even at level "0" by default', () => {
		const body = bodyWithBlocks([makeTextBlock('p1', 'just a paragraph')]);
		expect(collectHeadings(body, 3)).toEqual([]);
	});

	it('finds headings nested inside a ColumnsBlock, attributed to the outer column block\'s id (pagination never assigns a page to a nested child directly)', () => {
		const body = makeBody();
		body.pages[0]!.blocks = [makeColumnsBlock('columns-1', [[makeHeadingTextBlock('col0-h', 1, 'Left column heading')], [makeTextBlock('col1-p', 'right text')]])];
		expect(collectHeadings(body, 3)).toEqual([{ id: 'columns-1-0', blockId: 'columns-1', level: 1, text: 'Left column heading' }]);
	});

	it('finds headings nested inside a SmartContentBlock, attributed to the outer smart_content block\'s id, same as Columns', () => {
		const body = makeBody();
		body.pages[0]!.blocks = [makeSmartContentBlock('smart-1', [makeHeadingTextBlock('smart0-h', 1, 'Conditional heading')])];
		expect(collectHeadings(body, 3)).toEqual([{ id: 'smart-1-0', blockId: 'smart-1', level: 1, text: 'Conditional heading' }]);
	});

	it('finds headings inside a table cell, attributed to the table block\'s own id', () => {
		const body = makeBody();
		const cell = { ...makeCell(), doc: headingDoc(2, 'Cell heading') };
		body.pages[0]!.blocks = [makeTableBlock('table-1', [[cell, makeCell('plain cell')]])];
		expect(collectHeadings(body, 3)).toEqual([{ id: 'table-1-0', blockId: 'table-1', level: 2, text: 'Cell heading' }]);
	});

	it('concatenates a heading\'s text across multiple inline text nodes (e.g. split by a mark boundary)', () => {
		const body = makeBody();
		body.pages[0]!.blocks = [
			{
				...makeTextBlock('h1'),
				doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Bold ' }, { type: 'text', text: 'and plain', marks: [] }] }] },
			},
		];
		expect(collectHeadings(body, 3)).toEqual([{ id: 'h1-0', blockId: 'h1', level: 1, text: 'Bold and plain' }]);
	});

	it('walks every page, in order', () => {
		const body = makeBody();
		body.pages = [
			{ id: 'page-1', name: 'Page 1', order: 0, blocks: [makeHeadingTextBlock('h1', 1, 'First')] },
			{ id: 'page-2', name: 'Page 2', order: 1, blocks: [makeHeadingTextBlock('h2', 1, 'Second')] },
		];
		expect(collectHeadings(body, 3).map((h) => h.text)).toEqual(['First', 'Second']);
	});
});

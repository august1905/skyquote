// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocumentXml, emuToPx, halfPointsToPx, twipsToPx } from './parseDocx';

/**
 * Every fixture below is shaped like the real PandaDoc export it was written
 * against — explicit falsey toggles, blocks boxed in 1×1 floating tables,
 * one section per page — rather than like idealised OOXML, because that is
 * where this parser's decisions come from.
 */
function documentXml(body: string): string {
	return `<?xml version="1.0"?><w:document xmlns:w="w" xmlns:wp="wp" xmlns:a="a" xmlns:r="r" xmlns:v="v"><w:body>${body}</w:body></w:document>`;
}

const SECTION = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="979" w:right="763" w:bottom="979" w:left="763"/></w:sectPr>';

function parse(body: string, relationships = new Map<string, string>(), ordered = new Set<string>()) {
	return parseDocumentXml(documentXml(body), relationships, ordered);
}

/** A block the way PandaDoc emits one: a 1×1 floating table at an absolute position. */
function wrapper(inner: string, { x = 706, y = 5386, width = 10680, fill = '' } = {}): string {
	return `<w:tbl><w:tblPr><w:tblpPr w:vertAnchor="margin" w:horzAnchor="margin" w:tblpX="${x}" w:tblpY="${y}"/><w:tblW w:w="${width}" w:type="dxa"/></w:tblPr>
		<w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid>
		<w:tr><w:tc><w:tcPr>${fill ? `<w:shd w:fill="${fill}"/>` : ''}</w:tcPr>${inner}</w:tc></w:tr></w:tbl>`;
}

function paragraph(text: string, runProperties = ''): string {
	return `<w:p><w:r><w:rPr>${runProperties}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}

describe('unit conversion', () => {
	it('converts the units OOXML actually uses to page px at 96dpi', () => {
		expect(twipsToPx(12240)).toBe(816); // Letter width
		expect(twipsToPx(15840)).toBe(1056); // Letter height
		expect(halfPointsToPx(54)).toBe(36); // 27pt
		expect(emuToPx(7772400)).toBe(816);
	});
});

describe('run properties', () => {
	it('reads an explicit falsey toggle as OFF, not as present-therefore-on', () => {
		// The trap this parser was written around. PandaDoc writes every toggle
		// explicitly — 314 `<w:b w:val="false"/>` against 222 true in the sample
		// export, and 528 `<w:strike w:val="false"/>` with no true at all.
		// Presence-means-on renders the whole document bold, italic and struck.
		const parsed = parse(paragraph('Plain', '<w:b w:val="false"/><w:i w:val="false"/><w:strike w:val="false"/><w:u w:val="none"/>') + SECTION);
		const run = parsed.pages[0]!.content[0]!;
		if (run.kind !== 'text') throw new Error('expected text');
		expect(run.paragraphs[0]!.runs[0]).toMatchObject({ text: 'Plain', bold: false, italic: false, underline: false, strike: false });
	});

	it('reads a bare toggle, and an explicit true, as ON', () => {
		const parsed = parse(paragraph('Loud', '<w:b/><w:i w:val="true"/><w:u w:val="single"/>') + SECTION);
		const content = parsed.pages[0]!.content[0]!;
		if (content.kind !== 'text') throw new Error('expected text');
		expect(content.paragraphs[0]!.runs[0]).toMatchObject({ bold: true, italic: true, underline: true });
	});

	it('carries colour and size', () => {
		const parsed = parse(paragraph('Big', '<w:color w:val="004c83"/><w:sz w:val="54"/>') + SECTION);
		const content = parsed.pages[0]!.content[0]!;
		if (content.kind !== 'text') throw new Error('expected text');
		expect(content.paragraphs[0]!.runs[0]).toMatchObject({ colorHex: '#004C83', sizePx: 36 });
	});
});

describe('pages', () => {
	it('starts a new page at every section break, which is how PandaDoc marks one', () => {
		const parsed = parse(paragraph('One') + `<w:p><w:pPr>${SECTION}</w:pPr></w:p>` + paragraph('Two') + SECTION);
		expect(parsed.pages).toHaveLength(2);
		expect(parsed.pageWidthPx).toBe(816);
		expect(parsed.margins).toEqual({ top: 65, right: 51, bottom: 65, left: 51 });
	});

	it('drops a section that carries nothing — PandaDoc emits spacing artefacts as empty sections', () => {
		const parsed = parse(`<w:p><w:pPr>${SECTION}</w:pPr></w:p>` + paragraph('Real') + SECTION);
		expect(parsed.pages).toHaveLength(1);
	});
});

describe('layout wrappers', () => {
	it('unwraps a 1×1 table into ordinary content, keeping its shading', () => {
		const parsed = parse(wrapper(paragraph('Boxed'), { fill: 'dbfaff' }) + SECTION);
		const content = parsed.pages[0]!.content[0]!;
		expect(content.kind).toBe('text');
		if (content.kind !== 'text') return;
		expect(content.backgroundColor).toBe('#DBFAFF');
		expect(content.paragraphs[0]!.runs[0]!.text).toBe('Boxed');
	});

	it('keeps a real table that is nested inside a wrapper', () => {
		// The bug this test exists for: the first version of the walk unwrapped a
		// wrapper by taking only its *paragraphs*, and every data table in the
		// document — all six, nested inside wrappers — disappeared in silence.
		const table = `<w:tbl><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="300"/></w:tblGrid>
			<w:tr><w:tc><w:tcPr/>${paragraph('Bathrooms')}</w:tc><w:tc><w:tcPr/>${paragraph('2')}</w:tc></w:tr></w:tbl>`;
		const parsed = parse(wrapper(table) + SECTION);
		const content = parsed.pages[0]!.content[0]!;
		expect(content.kind).toBe('table');
		if (content.kind !== 'table') return;
		expect(content.rows[0]!.cells).toHaveLength(2);
		expect(content.columnWidths).toEqual([0.25, 0.75]);
	});

	it('reads the wrapper’s absolute position, margins added back', () => {
		const parsed = parse(wrapper(paragraph('Placed'), { x: 706, y: 5386, width: 10680 }) + SECTION);
		// 706 twips = 47px, + the 51px left margin the anchor is relative to.
		expect(parsed.pages[0]!.content[0]!.position).toEqual({ xPx: 98, yPx: 424, widthPx: 712 });
	});

	it('leaves content in the flow when the anchor is one it cannot place', () => {
		const odd = wrapper(paragraph('Odd')).replace('w:vertAnchor="margin"', 'w:vertAnchor="text"');
		expect(parse(odd + SECTION).pages[0]!.content[0]!.position).toBeUndefined();
	});
});

describe('images', () => {
	const anchor = (relationshipId: string, cx: number, cy: number, relativeFrom: string) =>
		`<w:p><w:r><w:drawing><wp:anchor><wp:positionH relativeFrom="${relativeFrom}"><wp:posOffset>0</wp:posOffset></wp:positionH>
			<wp:positionV relativeFrom="${relativeFrom}"><wp:posOffset>0</wp:posOffset></wp:positionV>
			<wp:extent cx="${cx}" cy="${cy}"/><a:blip r:embed="${relationshipId}"/></wp:anchor></w:drawing></w:r></w:p>`;

	it('treats a page-anchored, page-sized image as the page background, not a block', () => {
		const parsed = parse(anchor('rId5', 7772400, 10058400, 'page') + SECTION);
		expect(parsed.pages[0]!.backgroundRelationshipId).toBe('rId5');
		expect(parsed.pages[0]!.content).toHaveLength(0);
	});

	it('treats a column-anchored image as an image block at its own size', () => {
		const parsed = parse(anchor('rId8', 2695575, 2695575, 'column') + SECTION);
		const content = parsed.pages[0]!.content[0]!;
		expect(content).toMatchObject({ kind: 'image', relationshipId: 'rId8', widthPx: 283, heightPx: 283 });
	});

	it('reads a legacy VML frame fill as a background too', () => {
		// One page of the sample export has its background only as
		// `<v:rect><v:fill type="frame">` at 612pt × 792pt. Ignoring VML lost a
		// whole page's artwork without a word.
		const vml = `<w:p><w:r><w:pict><v:rect style="position:absolute;width:612pt;height:792pt"><v:fill type="frame" r:id="rId35"/></v:rect></w:pict></w:r></w:p>`;
		expect(parse(vml + SECTION).pages[0]!.backgroundRelationshipId).toBe('rId35');
	});

	it('keeps the first background when a page declares one twice', () => {
		// PandaDoc emits both a DrawingML anchor and a VML fallback for the same
		// artwork — different encodings, 108KB vs 295KB. First wins keeps the
		// smaller one and stops the fallback being the thing that gets uploaded.
		const vml = `<w:p><w:r><w:pict><v:rect style="width:612pt;height:792pt"><v:fill type="frame" r:id="rId35"/></v:rect></w:pict></w:r></w:p>`;
		expect(parse(anchor('rId5', 7772400, 10058400, 'page') + vml + SECTION).pages[0]!.backgroundRelationshipId).toBe('rId5');
	});
});

describe('hyperlinks', () => {
	it('resolves a link through the relationship table', () => {
		const relationships = new Map([['rId40', 'http://www.skylineclean.com']]);
		const body = `<w:p><w:hyperlink r:id="rId40"><w:r><w:rPr/><w:t>Our site</w:t></w:r></w:hyperlink></w:p>${SECTION}`;
		const content = parse(body, relationships).pages[0]!.content[0]!;
		if (content.kind !== 'text') throw new Error('expected text');
		expect(content.paragraphs[0]!.runs[0]!.href).toBe('http://www.skylineclean.com');
	});
});

import { describe, expect, it } from 'vitest';
import type { TemplateBody, TextBlock } from '../../editor/types';
import { docxToTemplateBody, nearestHouseColor, nearestHouseSize, type ImportedImage } from './docxToTemplate';
import type { DocxContent, DocxPage, ParsedDocx } from './parseDocx';

function baseBody(): TemplateBody {
	return {
		pages: [],
		roles: [{ id: 'role-1', name: 'Contact (Signer)', color: '#2563eb', order: 0, isSender: false }],
		variables: [],
		settings: {
			pageSize: 'LETTER',
			orientation: 'portrait',
			margins: { top: 96, right: 96, bottom: 96, left: 96 },
			showPageNumbers: false,
			theme: { primaryColor: '#094D82', textColor: '#33414F', pageBackgroundColor: '#fff', baseSpacing: 16 },
		},
	};
}

function parsed(pages: DocxPage[]): ParsedDocx {
	return {
		pages,
		pageWidthPx: 816,
		pageHeightPx: 1056,
		margins: { top: 65, right: 51, bottom: 65, left: 51 },
		showPageNumbers: true,
		mediaByRelationshipId: new Map(),
		files: new Map(),
	};
}

function textContent(text: string, extra: Partial<Extract<DocxContent, { kind: 'text' }>> = {}): DocxContent {
	return {
		kind: 'text',
		paragraphs: [{ runs: [{ text, bold: false, italic: false, underline: false, strike: false }] }],
		...extra,
	};
}

function convert(content: DocxContent[], images = new Map<string, ImportedImage>()) {
	return docxToTemplateBody(parsed([{ content }]), images, baseBody());
}

describe('house style snapping', () => {
	it('snaps a near-miss brand colour onto the real one', () => {
		// PandaDoc's navy against Skyline's: invisible to the eye, and the
		// difference is what would stop the style selector ever naming it.
		expect(nearestHouseColor('#004C83')).toBe('#094D82');
		expect(nearestHouseColor('#FFFFFF')).toBe('#FFFFFF');
	});

	it('snaps a size onto the even px the catalogue offers, clamped to its range', () => {
		expect(nearestHouseSize(37)).toBe(38);
		expect(nearestHouseSize(9)).toBe(10);
		expect(nearestHouseSize(200)).toBe(80);
	});

	it('applies both as an ordinary textStyle mark, so every renderer already draws it', () => {
		const { body } = convert([
			{
				kind: 'text',
				paragraphs: [{ runs: [{ text: 'Headline', bold: true, italic: false, underline: false, strike: false, colorHex: '#004C83', sizePx: 37 }] }],
			},
		]);
		const block = body.pages[0]!.blocks[0] as TextBlock;
		expect(block.doc.content[0]!.content![0]!.marks).toEqual([
			{ type: 'bold' },
			{ type: 'textStyle', attrs: { color: '#094D82', fontSize: '38px' } },
		]);
	});
});

describe('merge tokens', () => {
	it('turns a token this app defines into a real chip, mid-sentence', () => {
		const { body, unmappedTokens } = convert([textContent('Prepared for [Client.Company] today')]);
		const block = body.pages[0]!.blocks[0] as TextBlock;
		expect(block.doc.content[0]!.content).toEqual([
			{ type: 'text', text: 'Prepared for ' },
			{ type: 'variable', attrs: { key: 'Client.Company', fallback: null } },
			{ type: 'text', text: ' today' },
		]);
		expect(unmappedTokens).toEqual([]);
	});

	it('leaves a token nothing feeds as plain text, and names it', () => {
		// Inventing a variable here would put "[Client.StreetAddress not
		// provided]" in a real client's document. Plain text reads correctly and
		// the summary says what needs a decision.
		const { body, unmappedTokens } = convert([textContent('At [Client.StreetAddress] now')]);
		const block = body.pages[0]!.blocks[0] as TextBlock;
		expect(block.doc.content[0]!.content).toEqual([{ type: 'text', text: 'At [Client.StreetAddress] now' }]);
		expect(unmappedTokens).toEqual(['Client.StreetAddress']);
	});
});

describe('blocks', () => {
	it('pins a positioned block where PandaDoc put it, with no height so it can reflow', () => {
		// Height stays unset on purpose: everything is re-typeset in Montserrat,
		// so a pinned height would clip whatever grew.
		const { body } = convert([textContent('Placed', { position: { xPx: 98, yPx: 424, widthPx: 712 } })]);
		expect(body.pages[0]!.blocks[0]!.placement).toEqual({ x: 98, y: 424, width: 712 });
	});

	it('keeps a wrapper’s shading as the block’s background', () => {
		const { body } = convert([textContent('On a band', { backgroundColor: '#DBFAFF' })]);
		expect(body.pages[0]!.blocks[0]!.style.backgroundColor).toBe('#DBFAFF');
	});

	it('makes a page background out of a full-bleed image rather than a block', () => {
		const images = new Map([['rId5', { assetId: 'asset-1', url: '/assets/asset-1/file' }]]);
		const result = docxToTemplateBody(parsed([{ content: [], backgroundRelationshipId: 'rId5' }]), images, baseBody());
		expect(result.body.pages[0]!.background).toEqual({ assetId: 'asset-1', imageUrl: '/assets/asset-1/file' });
		expect(result.body.pages[0]!.blocks).toHaveLength(0);
		expect(result.counts.backgrounds).toBe(1);
	});

	it('skips an image whose upload failed instead of writing a block pointing at nothing', () => {
		const { body, counts } = convert([{ kind: 'image', relationshipId: 'rId9', widthPx: 200, heightPx: 100 }]);
		expect(body.pages[0]!.blocks).toHaveLength(0);
		expect(counts.images).toBe(0);
	});

	it('groups consecutive bullets into one list', () => {
		const { body } = convert([
			{
				kind: 'text',
				paragraphs: [
					{ runs: [{ text: 'Intro', bold: false, italic: false, underline: false, strike: false }] },
					{ runs: [{ text: 'One', bold: false, italic: false, underline: false, strike: false }], list: { ordered: false, level: 0 } },
					{ runs: [{ text: 'Two', bold: false, italic: false, underline: false, strike: false }], list: { ordered: false, level: 0 } },
				],
			},
		]);
		const block = body.pages[0]!.blocks[0] as TextBlock;
		expect(block.doc.content.map((node) => node.type)).toEqual(['paragraph', 'bulletList']);
		expect(block.doc.content[1]!.content).toHaveLength(2);
	});
});

describe('the imported body', () => {
	it('takes page geometry from the document but keeps this app’s roles and theme', () => {
		// A .docx has no idea who signs anything, and the seeded signer pair is
		// this app's own default — the import builds onto it rather than over it.
		const result = docxToTemplateBody(parsed([{ content: [textContent('Hi')] }]), new Map(), baseBody());
		expect(result.body.settings.margins).toEqual({ top: 65, right: 51, bottom: 65, left: 51 });
		expect(result.body.settings.showPageNumbers).toBe(true);
		expect(result.body.roles.map((role) => role.name)).toEqual(['Contact (Signer)']);
		expect(result.body.settings.theme.primaryColor).toBe('#094D82');
	});
});

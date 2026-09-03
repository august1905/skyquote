import { describe, expect, it } from 'vitest';
import { money } from '../../editor/types';
import type { PricingItem, PricingTableBlock, TemplateBody, TemplateSettings, TextBlock } from '../../editor/types';
import type { CrmDealQuote } from '../../api/zohoCrm';
import { computeTotals } from '../../pricing/computeTotals';
import { packageSectionKey, selectableItemIds } from '../../pricing/recipientSelections';
import { applyQuotesToBody } from './importQuote';

/**
 * The import decides what a customer is quoted, so the tests are about money
 * and the package contract: one section per CRM quote, only the sections are
 * choosable (a package is all-or-nothing), each package's own total matches
 * its CRM quote's, and the document total is the preselected package's alone.
 */

function makeSettings(): TemplateSettings {
	return {
		pageSize: 'LETTER',
		orientation: 'portrait',
		margins: { top: 96, right: 96, bottom: 96, left: 96 },
		showPageNumbers: false,
		theme: { primaryColor: '#1a1a1a', textColor: '#333', pageBackgroundColor: '#fff', baseSpacing: 16 },
	};
}

function item(id: string, price: number): PricingItem {
	return { id, sectionId: null, name: id, description: '', qty: 1, price: money(price), optional: false, selected: true, customFields: {} };
}

function table(id: string, items: PricingItem[]): PricingTableBlock {
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
			showDiscount: false,
			showTax: false,
			showTotal: true,
		},
	};
}

function textBlock(id: string): TextBlock {
	return { id, type: 'text', locked: false, style: {}, doc: { type: 'doc', content: [] } };
}

function body(blocks: TemplateBody['pages'][number]['blocks']): TemplateBody {
	return { pages: [{ id: 'p1', name: 'Page 1', order: 0, blocks }], roles: [], variables: [], settings: makeSettings() };
}

function quote(overrides: Partial<CrmDealQuote> = {}): CrmDealQuote {
	return {
		id: 'q1',
		name: '(SW) Siding',
		number: null,
		subject: '(SW) Siding - The Brad Belstra Residence',
		status: 'Pending',
		discount: 0,
		total: 110200,
		items: [{ name: 'RES Softwash', description: '', qty: 1, price: 96200 }],
		...overrides,
	};
}

function secondQuote(overrides: Partial<CrmDealQuote> = {}): CrmDealQuote {
	return quote({
		id: 'q2',
		name: 'Package 2 - Siding + Windows',
		subject: 'Package 2 - Siding + Windows - The Brad Belstra Residence',
		total: 121600,
		items: [
			{ name: 'RES Softwash', description: '', qty: 1, price: 96200 },
			{ name: 'RES Windows Exterior', description: '', qty: 1, price: 25400 },
		],
		...overrides,
	});
}

function firstTable(b: TemplateBody): PricingTableBlock {
	const block = b.pages[0]!.blocks.find((candidate) => candidate.type === 'pricing_table');
	if (!block || block.type !== 'pricing_table') throw new Error('no pricing table');
	return block;
}

describe('applyQuotesToBody', () => {
	it('turns the first pricing table into a package selection: one named section per quote, rows all-or-nothing', () => {
		const scaffold = body([textBlock('t'), table('pt', [item('placeholder', 100)])]);
		const result = applyQuotesToBody(scaffold, [quote(), secondQuote()]);
		expect(result).not.toBeNull();
		const imported = firstTable(result!.body);

		expect(imported.settings.packageSelection).toBe(true);
		expect(imported.settings.allowRecipientSelectOptional).toBe(false);
		expect(imported.sections.map((s) => s.name)).toEqual(['(SW) Siding', 'Package 2 - Siding + Windows']);
		// Every row belongs to its quote's section, none is individually optional.
		expect(imported.items.every((i) => i.sectionId !== null && !i.optional)).toBe(true);
		expect(imported.items.some((i) => i.name === 'placeholder')).toBe(false);

		// The only choosable things are the packages themselves.
		const ids = selectableItemIds(result!.body);
		expect(ids.size).toBe(2);
		for (const section of imported.sections) expect(ids.has(packageSectionKey(section.id))).toBe(true);
		expect(result!.imported).toBe(2);
	});

	it('preselects the first package by default, and the document total is that package alone', () => {
		const result = applyQuotesToBody(body([table('pt', [])]), [quote(), secondQuote()]);
		const imported = firstTable(result!.body);
		expect(imported.selectedSectionId).toBe(imported.sections[0]!.id);
		// 962.00 — the chosen package, not the sum of both packages.
		expect(computeTotals(result!.body).total).toBe(96200);
	});

	it('preselects an already-accepted CRM quote instead of the first', () => {
		const result = applyQuotesToBody(body([table('pt', [])]), [quote(), secondQuote({ status: 'Accepted' })]);
		const imported = firstTable(result!.body);
		expect(imported.selectedSectionId).toBe(imported.sections[1]!.id);
		expect(computeTotals(result!.body).total).toBe(96200 + 25400);
	});

	it('lands a quote-level discount inside its own package, so each package total matches its CRM quote', () => {
		const result = applyQuotesToBody(body([table('pt', [])]), [quote({ discount: 2550 }), secondQuote()]);
		const imported = firstTable(result!.body);
		const first = imported.sections[0]!;
		const discountLine = imported.items.find((i) => i.name === 'Discount');
		expect(discountLine).toBeDefined();
		expect(discountLine!.sectionId).toBe(first.id);
		expect(discountLine!.price).toBe(-2550);
		// The chosen (first) package: 962.00 − 25.50. The other package untouched.
		expect(computeTotals(result!.body).total).toBe(96200 - 2550);
	});

	it('targets only the FIRST pricing table; a second one keeps its own items', () => {
		const scaffold = body([table('pt1', [item('scaffold-row', 100)]), table('pt2', [item('keep-me', 200)])]);
		const result = applyQuotesToBody(scaffold, [quote()]);
		expect(firstTable(result!.body).items.some((i) => i.name === 'scaffold-row')).toBe(false);
		const second = result!.body.pages[0]!.blocks[1] as PricingTableBlock;
		expect(second.items.map((i) => i.name)).toEqual(['keep-me']);
		expect(second.settings.packageSelection).toBeUndefined();
	});

	it('returns null when the template has no pricing table, or no quote has lines — and never mutates its input', () => {
		expect(applyQuotesToBody(body([textBlock('t')]), [quote()])).toBeNull();
		const scaffold = body([table('pt', [item('placeholder', 100)])]);
		expect(applyQuotesToBody(scaffold, [quote({ items: [] })])).toBeNull();
		expect(applyQuotesToBody(scaffold, [])).toBeNull();
		expect(firstTable(scaffold).items[0]!.name).toBe('placeholder');
	});

	it('drops an empty quote but keeps the rest, falling back to subject then a numbered name', () => {
		const unnamed = secondQuote({ name: null, subject: null });
		const result = applyQuotesToBody(body([table('pt', [])]), [quote({ items: [] }), unnamed]);
		const imported = firstTable(result!.body);
		expect(imported.sections.map((s) => s.name)).toEqual(['Package 1']);
		expect(result!.imported).toBe(1);
	});
});

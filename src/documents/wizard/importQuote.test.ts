import { describe, expect, it } from 'vitest';
import { money } from '../../editor/types';
import type { PricingItem, PricingTableBlock, TemplateBody, TemplateSettings, TextBlock } from '../../editor/types';
import type { CrmDealQuote } from '../../api/zohoCrm';
import { computeTotals } from '../../pricing/computeTotals';
import { selectableItemIds } from '../../pricing/recipientSelections';
import { applyQuoteToBody } from './importQuote';

/**
 * The import decides what a customer is quoted, so the tests are about money
 * and the checkable-boxes contract: every imported line must be tickable
 * (optional + offered), a discount must not be untickable away, and the
 * document's total must equal the CRM quote's.
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
		number: 'Q-101',
		subject: 'Cleaning Packages - One Time',
		discount: 0,
		items: [
			{ name: 'Interior Window Cleaning', description: 'All interior glass and frames.', qty: 1, price: 59200 },
			{ name: 'Exterior Window Cleaning', description: '', qty: 1, price: 25000 },
		],
		...overrides,
	};
}

function firstTable(b: TemplateBody): PricingTableBlock {
	const block = b.pages[0]!.blocks.find((candidate) => candidate.type === 'pricing_table');
	if (!block || block.type !== 'pricing_table') throw new Error('no pricing table');
	return block;
}

describe('applyQuoteToBody', () => {
	it('replaces the first pricing table’s items with the quote’s, every one optional, selected, and offered to the recipient', () => {
		const scaffold = body([textBlock('t'), table('pt', [item('placeholder', 100)])]);
		const result = applyQuoteToBody(scaffold, quote());
		expect(result).not.toBeNull();
		const imported = firstTable(result!.body);
		expect(imported.items.map((i) => [i.name, i.price, i.optional, i.selected])).toEqual([
			['Interior Window Cleaning', 59200, true, true],
			['Exterior Window Cleaning', 25000, true, true],
		]);
		expect(imported.settings.allowRecipientSelectOptional).toBe(true);
		// The checkable-boxes contract: every imported row is one the recipient can tick.
		expect(selectableItemIds(result!.body).size).toBe(2);
		expect(result!.imported).toBe(2);
	});

	it('matches the CRM quote’s total, and a quote-level discount lands as one non-optional negative line', () => {
		const result = applyQuoteToBody(body([table('pt', [])]), quote({ discount: 2550 }));
		const imported = firstTable(result!.body);
		const discountLine = imported.items[imported.items.length - 1]!;
		expect(discountLine.name).toBe('Discount');
		expect(discountLine.price).toBe(-2550);
		expect(discountLine.optional).toBe(false);
		// 592.00 + 250.00 − 25.50
		expect(computeTotals(result!.body).total).toBe(59200 + 25000 - 2550);
		// A discount is not a choice — it must never appear as a tickable row.
		expect(selectableItemIds(result!.body).has(discountLine.id)).toBe(false);
	});

	it('targets only the FIRST pricing table; a second one keeps its own items', () => {
		const scaffold = body([table('pt1', [item('scaffold-row', 100)]), table('pt2', [item('keep-me', 200)])]);
		const result = applyQuoteToBody(scaffold, quote());
		expect(firstTable(result!.body).items.some((i) => i.name === 'scaffold-row')).toBe(false);
		const second = result!.body.pages[0]!.blocks[1] as PricingTableBlock;
		expect(second.items.map((i) => i.name)).toEqual(['keep-me']);
	});

	it('returns null when the template has no pricing table, or the quote has no lines — and never mutates its input', () => {
		expect(applyQuoteToBody(body([textBlock('t')]), quote())).toBeNull();
		const scaffold = body([table('pt', [item('placeholder', 100)])]);
		expect(applyQuoteToBody(scaffold, quote({ items: [] }))).toBeNull();
		expect(firstTable(scaffold).items[0]!.name).toBe('placeholder');
	});
});

import { describe, expect, it } from 'vitest';
import type { ColumnsBlock, PricingItem, PricingTableBlock, QuoteBuilderBlock, SmartContentBlock, TemplateBody, TemplateSettings } from '../editor/types';
import { money } from '../editor/types';
import { computePricingTableTotals, computeQuoteBuilderTotals, computeTotals } from './computeTotals';

function makeItem(overrides: Partial<PricingItem> = {}): PricingItem {
	return {
		id: overrides.id ?? 'item-1',
		sectionId: null,
		name: 'Item',
		description: '',
		qty: 1,
		price: money(1000),
		optional: false,
		selected: true,
		customFields: {},
		...overrides,
	};
}

function makePricingTable(overrides: Partial<PricingTableBlock> = {}): PricingTableBlock {
	return {
		id: 'pricing-1',
		type: 'pricing_table',
		locked: false,
		style: {},
		currency: 'USD',
		columns: [],
		sections: [],
		items: [],
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

function makeSettings(): TemplateSettings {
	return {
		pageSize: 'LETTER',
		orientation: 'portrait',
		margins: { top: 0, right: 0, bottom: 0, left: 0 },
		showPageNumbers: false,
		theme: {
			headingFont: 'Georgia',
			bodyFont: 'Arial',
			primaryColor: '#000',
			textColor: '#000',
			pageBackgroundColor: '#fff',
			baseSpacing: 0,
		},
	};
}

function makeBody(blocks: TemplateBody['pages'][number]['blocks']): TemplateBody {
	return {
		pages: [{ id: 'page-1', name: 'Page 1', order: 0, blocks }],
		roles: [],
		variables: [],
		settings: makeSettings(),
	};
}

describe('computePricingTableTotals — line math (§7.1/§7.2)', () => {
	it('a plain line with no discount/tax: subtotal = qty × price, total = subtotal', () => {
		const table = makePricingTable({ items: [makeItem({ qty: 2, price: money(1000) })] });
		const result = computePricingTableTotals(table);
		expect(result.lines).toEqual([
			{ itemId: 'item-1', included: true, subtotal: money(2000), discount: money(0), tax: money(0), total: money(2000) },
		]);
		expect(result.subtotal).toBe(money(2000));
		expect(result.total).toBe(money(2000));
	});

	it('applies a percentage discount before tax, per §7.2\'s order of operations', () => {
		const table = makePricingTable({
			items: [makeItem({ qty: 1, price: money(1000), discount: { type: 'pct', value: 10 }, tax: { type: 'pct', value: 8 } })],
		});
		const result = computePricingTableTotals(table);
		const line = result.lines[0]!;
		expect(line.subtotal).toBe(money(1000));
		expect(line.discount).toBe(money(100)); // 10% of 1000
		expect(line.tax).toBe(money(72)); // 8% of (1000 - 100) = 900
		expect(line.total).toBe(money(972));
	});

	it('a fixed-amount discount/tax is already in minor units, not a percentage', () => {
		const table = makePricingTable({
			items: [makeItem({ qty: 1, price: money(1000), discount: { type: 'amount', value: 150 }, tax: { type: 'amount', value: 50 } })],
		});
		const line = computePricingTableTotals(table).lines[0]!;
		expect(line.discount).toBe(money(150));
		expect(line.tax).toBe(money(50));
		expect(line.total).toBe(money(1000 - 150 + 50));
	});

	it('rounds a fractional-cent line at the line level (§7.6) — half a cent rounds up', () => {
		// 1.5 × 333 = 499.5
		const table = makePricingTable({ items: [makeItem({ qty: 1.5, price: money(333) })] });
		expect(computePricingTableTotals(table).lines[0]!.subtotal).toBe(money(500));
	});

	it('an unselected optional item is excluded from every rollup, but still reported as a line', () => {
		const table = makePricingTable({
			items: [makeItem({ id: 'required', qty: 1, price: money(1000) }), makeItem({ id: 'optional', qty: 1, price: money(500), optional: true, selected: false })],
		});
		const result = computePricingTableTotals(table);
		expect(result.lines).toHaveLength(2);
		expect(result.lines.find((l) => l.itemId === 'optional')!.included).toBe(false);
		expect(result.subtotal).toBe(money(1000));
		expect(result.total).toBe(money(1000));
	});

	it('a selected optional item counts toward the total like any other', () => {
		const table = makePricingTable({ items: [makeItem({ qty: 1, price: money(1000), optional: true, selected: true })] });
		expect(computePricingTableTotals(table).total).toBe(money(1000));
	});
});

describe('computePricingTableTotals — sections (§7.1: rows → sections → block)', () => {
	it('rolls items up into their section\'s totals, and the block total includes items with no matching section', () => {
		const table = makePricingTable({
			sections: [{ id: 'sec-1', name: 'Janitorial', order: 0 }],
			items: [
				makeItem({ id: 'a', sectionId: 'sec-1', qty: 1, price: money(1000) }),
				makeItem({ id: 'b', sectionId: 'sec-1', qty: 1, price: money(500) }),
				makeItem({ id: 'c', sectionId: null, qty: 1, price: money(200) }),
			],
		});
		const result = computePricingTableTotals(table);
		expect(result.sections).toEqual([{ sectionId: 'sec-1', subtotal: money(1500), discount: money(0), tax: money(0), total: money(1500) }]);
		expect(result.total).toBe(money(1700)); // section total (1500) + the ungrouped item (200)
	});

	it('an item referencing a since-deleted section still counts toward the block total with no section entry of its own', () => {
		const table = makePricingTable({
			sections: [],
			items: [makeItem({ qty: 1, price: money(1000), sectionId: 'gone' })],
		});
		const result = computePricingTableTotals(table);
		expect(result.sections).toEqual([]);
		expect(result.total).toBe(money(1000));
	});
});

describe('computeQuoteBuilderTotals', () => {
	it('flattens every group\'s options into one set of lines', () => {
		const block: QuoteBuilderBlock = {
			id: 'qb-1',
			type: 'quote_builder',
			locked: false,
			style: {},
			currency: 'USD',
			groups: [
				{ id: 'g1', name: 'Frequency', selection: 'single', required: true, options: [makeItem({ id: 'weekly', qty: 1, price: money(1000) })] },
				{ id: 'g2', name: 'Add-ons', selection: 'multi', required: false, options: [makeItem({ id: 'addon', qty: 1, price: money(300), optional: true, selected: false })] },
			],
		};
		const result = computeQuoteBuilderTotals(block);
		expect(result.lines).toHaveLength(2);
		expect(result.total).toBe(money(1000)); // the unselected add-on is excluded
	});
});

describe('computeTotals — the document/header rollup (§7.4)', () => {
	it('is zero for a template with no pricing blocks at all', () => {
		const result = computeTotals(makeBody([]));
		expect(result.blocks).toEqual([]);
		expect(result.total).toBe(money(0));
	});

	it('sums across multiple pricing tables in the same template (§7.5)', () => {
		const a = makePricingTable({ id: 'a', items: [makeItem({ qty: 1, price: money(1000) })] });
		const b = makePricingTable({ id: 'b', items: [makeItem({ qty: 1, price: money(2500) })] });
		const result = computeTotals(makeBody([a, b]));
		expect(result.blocks.map((bl) => bl.blockId)).toEqual(['a', 'b']);
		expect(result.total).toBe(money(3500));
	});

	it('sums a pricing table and a quote builder together', () => {
		const table = makePricingTable({ items: [makeItem({ qty: 1, price: money(1000) })] });
		const quote: QuoteBuilderBlock = {
			id: 'qb-1',
			type: 'quote_builder',
			locked: false,
			style: {},
			currency: 'USD',
			groups: [{ id: 'g1', name: 'Plan', selection: 'single', required: true, options: [makeItem({ id: 'plan', qty: 1, price: money(500) })] }],
		};
		expect(computeTotals(makeBody([table, quote])).total).toBe(money(1500));
	});

	it('finds a pricing table nested inside a Columns block, same whole-tree walk every other cross-cutting feature uses', () => {
		const nested = makePricingTable({ items: [makeItem({ qty: 1, price: money(750) })] });
		const columns: ColumnsBlock = { id: 'columns-1', type: 'columns', locked: false, style: {}, widths: [0.5, 0.5], columns: [[nested], []] };
		expect(computeTotals(makeBody([columns])).total).toBe(money(750));
	});

	it('finds a pricing table nested inside a SmartContentBlock — counted toward the total regardless of the smart content\'s own (unevaluated-here) rules', () => {
		const nested = makePricingTable({ items: [makeItem({ qty: 1, price: money(1200) })] });
		const smartContent: SmartContentBlock = {
			id: 'smart-1',
			type: 'smart_content',
			locked: false,
			style: {},
			name: 'Smart content',
			rules: [{ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'is_empty', value: null }],
			match: 'all',
			children: [nested],
		};
		expect(computeTotals(makeBody([smartContent])).total).toBe(money(1200));
	});

	it('takes its currency from the first pricing block found, and defaults to USD when there are none', () => {
		expect(computeTotals(makeBody([])).currency).toBe('USD');
		const table = makePricingTable({ currency: 'CAD', items: [] });
		expect(computeTotals(makeBody([table])).currency).toBe('CAD');
	});
});

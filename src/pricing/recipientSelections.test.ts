import { describe, expect, it } from 'vitest';
import { money } from '../editor/types';
import type { ColumnsBlock, PricingItem, PricingTableBlock, QuoteBuilderBlock, TemplateBody, TemplateSettings } from '../editor/types';
import { computeTotals } from './computeTotals';
import {
	applyPricingSelections,
	configuredBodyForAgreement,
	defaultSelections,
	hasRecipientChoices,
	selectableItemIds,
	unsatisfiedGroups,
	type PricingSelections,
} from './recipientSelections';

/**
 * This module decides what ends up in a signed contract, so the tests are about
 * money and omission rather than about shape. Two properties matter most:
 *
 * - **`applyPricingSelections` keeps every row** (section 1 must still show the
 *   things you can tick), while **`configuredBodyForAgreement` removes them**
 *   (the PDF must contain only what was bought).
 * - Both agree with `computeTotals` on the price. A configured body whose total
 *   disagrees with the page the customer read is the whole failure mode.
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

function item(id: string, price: number, overrides: Partial<PricingItem> = {}): PricingItem {
	return { id, sectionId: null, name: id, description: '', qty: 1, price: money(price), optional: false, selected: true, customFields: {}, ...overrides };
}

function table(id: string, items: PricingItem[], allowRecipientSelectOptional = true): PricingTableBlock {
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
			allowRecipientSelectOptional,
			showSubtotal: true,
			showDiscount: false,
			showTax: false,
			showTotal: true,
		},
	};
}

function quoteBuilder(id: string, groups: QuoteBuilderBlock['groups']): QuoteBuilderBlock {
	return { id, type: 'quote_builder', locked: false, style: {}, currency: 'USD', groups };
}

function body(blocks: TemplateBody['pages'][number]['blocks']): TemplateBody {
	return { pages: [{ id: 'p1', name: 'Page 1', order: 0, blocks }], roles: [], variables: [], settings: makeSettings() };
}

describe('selectableItemIds', () => {
	it('offers only the optional rows of a table the author opened up', () => {
		const b = body([table('t1', [item('base', 100), item('extra', 50, { optional: true })])]);
		expect([...selectableItemIds(b)]).toEqual(['extra']);
	});

	it('offers nothing when the author left recipient selection off', () => {
		const b = body([table('t1', [item('extra', 50, { optional: true })], false)]);
		expect(selectableItemIds(b).size).toBe(0);
		expect(hasRecipientChoices(b)).toBe(false);
	});

	it('offers every quote-builder option, with no separate switch to respect', () => {
		// Picking one is the whole point of the block, unlike an optional table row.
		const b = body([
			quoteBuilder('q1', [{ id: 'g1', name: 'Frequency', selection: 'single', required: true, options: [item('weekly', 400), item('monthly', 150)] }]),
		]);
		expect([...selectableItemIds(b)].sort()).toEqual(['monthly', 'weekly']);
	});

	it('reaches a pricing table nested inside a columns block', () => {
		const nested: ColumnsBlock = {
			id: 'c1',
			type: 'columns',
			locked: false,
			style: {},
			widths: [1],
			columns: [[table('t1', [item('extra', 50, { optional: true })])]],
		};
		expect([...selectableItemIds(body([nested]))]).toEqual(['extra']);
	});
});

describe('defaultSelections', () => {
	it("starts from what the author left ticked, and includes non-optional rows as always-in", () => {
		const b = body([table('t1', [item('base', 100), item('yes', 50, { optional: true, selected: true }), item('no', 25, { optional: true, selected: false })])]);
		expect(defaultSelections(b)).toEqual({ base: true, yes: true, no: false });
	});
});

describe('applyPricingSelections', () => {
	it('keeps every row present, so section 1 still has something to tick', () => {
		const b = body([table('t1', [item('base', 100), item('extra', 50, { optional: true, selected: true })])]);
		const applied = applyPricingSelections(b, { base: true, extra: false });
		const block = applied.pages[0]!.blocks[0] as PricingTableBlock;
		expect(block.items.map((i) => i.id)).toEqual(['base', 'extra']);
		expect(block.items[1]!.selected).toBe(false);
	});

	it('drops an unticked optional row out of the total', () => {
		const b = body([table('t1', [item('base', 100), item('extra', 50, { optional: true, selected: true })])]);
		expect(computeTotals(applyPricingSelections(b, { base: true, extra: true })).total).toBe(money(150));
		expect(computeTotals(applyPricingSelections(b, { base: true, extra: false })).total).toBe(money(100));
	});

	it('makes a quote-builder option actually leave the total when unticked', () => {
		// The regression this exists for: options are created `optional: false`, and
		// `computeLine` only honours `selected` when `optional` is true — so without
		// forcing it, unticking an option left its price in the total.
		const b = body([
			quoteBuilder('q1', [{ id: 'g1', name: 'Frequency', selection: 'single', required: true, options: [item('weekly', 400), item('monthly', 150)] }]),
		]);
		expect(computeTotals(applyPricingSelections(b, { weekly: true, monthly: false })).total).toBe(money(400));
		expect(computeTotals(applyPricingSelections(b, { weekly: false, monthly: true })).total).toBe(money(150));
	});

	it("leaves a table alone when the author never opened it up", () => {
		const b = body([table('t1', [item('extra', 50, { optional: true, selected: false })], false)]);
		// A selection map that tries to turn it on must not win — that switch is the
		// author's, and a hand-crafted request must not be able to override it.
		expect(computeTotals(applyPricingSelections(b, { extra: true })).total).toBe(money(0));
	});
});

describe('configuredBodyForAgreement', () => {
	it('removes unselected rows entirely, so they cannot reach the PDF', () => {
		const b = body([table('t1', [item('base', 100), item('extra', 50, { optional: true, selected: true })])]);
		const agreement = configuredBodyForAgreement(b, { base: true, extra: false });
		const block = agreement.pages[0]!.blocks[0] as PricingTableBlock;
		expect(block.items.map((i) => i.id)).toEqual(['base']);
	});

	it('normalises kept rows so the signed document reads as a definite list', () => {
		const b = body([table('t1', [item('extra', 50, { optional: true, selected: true })])]);
		const block = configuredBodyForAgreement(b, { extra: true }).pages[0]!.blocks[0] as PricingTableBlock;
		expect(block.items[0]).toMatchObject({ optional: false, selected: true });
	});

	it('agrees with the interactive page on the price', () => {
		// The property that matters most: what they saw is what they signed.
		const b = body([table('t1', [item('base', 100), item('a', 50, { optional: true }), item('bb', 25, { optional: true })])]);
		const selections: PricingSelections = { base: true, a: true, bb: false };
		expect(computeTotals(configuredBodyForAgreement(b, selections)).total).toBe(computeTotals(applyPricingSelections(b, selections)).total);
	});

	it('keeps only the chosen quote-builder option and drops an emptied group', () => {
		const b = body([
			quoteBuilder('q1', [
				{ id: 'g1', name: 'Frequency', selection: 'single', required: true, options: [item('weekly', 400), item('monthly', 150)] },
				{ id: 'g2', name: 'Extras', selection: 'multi', required: false, options: [item('windows', 80)] },
			]),
		]);
		const agreement = configuredBodyForAgreement(b, { weekly: false, monthly: true, windows: false });
		const block = agreement.pages[0]!.blocks[0] as QuoteBuilderBlock;
		expect(block.groups.map((g) => g.id)).toEqual(['g1']);
		expect(block.groups[0]!.options.map((o) => o.id)).toEqual(['monthly']);
	});

	it('never drops a non-optional row, whatever the selection map says', () => {
		// A customer cannot decline the base service by editing a request payload.
		const b = body([table('t1', [item('base', 100)])]);
		const block = configuredBodyForAgreement(b, { base: false }).pages[0]!.blocks[0] as PricingTableBlock;
		expect(block.items.map((i) => i.id)).toEqual(['base']);
	});

	it('filters a table nested inside a columns block', () => {
		const nested: ColumnsBlock = {
			id: 'c1',
			type: 'columns',
			locked: false,
			style: {},
			widths: [1],
			columns: [[table('t1', [item('base', 100), item('extra', 50, { optional: true })])]],
		};
		const agreement = configuredBodyForAgreement(body([nested]), { base: true, extra: false });
		const column = (agreement.pages[0]!.blocks[0] as ColumnsBlock).columns[0]!;
		expect((column[0] as PricingTableBlock).items.map((i) => i.id)).toEqual(['base']);
	});
});

describe('unsatisfiedGroups', () => {
	const b = body([
		quoteBuilder('q1', [
			{ id: 'g1', name: 'Frequency', selection: 'single', required: true, options: [item('weekly', 400), item('monthly', 150)] },
			{ id: 'g2', name: 'Extras', selection: 'multi', required: false, options: [item('windows', 80)] },
		]),
	]);

	it('is empty once a required group has an answer', () => {
		expect(unsatisfiedGroups(b, { weekly: true, monthly: false, windows: false })).toEqual([]);
	});

	it('names a required group with nothing chosen', () => {
		const problems = unsatisfiedGroups(b, { weekly: false, monthly: false, windows: false });
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatchObject({ groupId: 'g1', groupName: 'Frequency', reason: 'none-chosen' });
	});

	it('catches two options ticked in a single-selection group', () => {
		// Would otherwise produce a PDF charging for both, which the customer would
		// only discover after signing it.
		const problems = unsatisfiedGroups(b, { weekly: true, monthly: true, windows: false });
		expect(problems[0]).toMatchObject({ groupId: 'g1', reason: 'too-many-chosen' });
	});

	it('does not require an optional multi group', () => {
		expect(unsatisfiedGroups(b, { weekly: true, monthly: false, windows: false })).toEqual([]);
	});
});

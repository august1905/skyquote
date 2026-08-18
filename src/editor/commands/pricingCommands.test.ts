import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { PricingTableBlock, QuoteBuilderBlock } from '../types';
import { money } from '../types';
import type { Command } from './types';
import {
	addPricingItem,
	addPricingSection,
	addQuoteGroup,
	addQuoteOption,
	removePricingItem,
	removePricingSection,
	removeQuoteGroup,
	removeQuoteOption,
	renamePricingSection,
	setPricingTableCurrency,
	setPricingTableSettings,
	setQuoteBuilderCurrency,
	updatePricingItem,
	updateQuoteGroup,
	updateQuoteOption,
} from './pricingCommands';
import { makeBodyWithPricingTable, makeBodyWithQuoteBuilder } from './testFixtures';

describe('pricing table: items', () => {
	it('addPricingItem appends a blank item; its inverse removes exactly that one', () => {
		const original = makeBodyWithPricingTable();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = addPricingItem('page-1', 'pricing-1').apply(draft);
		});
		const table = after.pages[0]?.blocks[0] as PricingTableBlock;
		expect(table.items).toHaveLength(2);

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('removePricingItem removes by id; its inverse re-inserts at the original index', () => {
		const original = makeBodyWithPricingTable();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = removePricingItem('page-1', 'pricing-1', 'item-1').apply(draft);
		});
		expect((after.pages[0]?.blocks[0] as PricingTableBlock).items).toEqual([]);

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('updatePricingItem patches only the given fields; its inverse restores every original field, including explicit clears', () => {
		const original = makeBodyWithPricingTable();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = updatePricingItem('page-1', 'pricing-1', 'item-1', {
				name: 'Weekly cleaning',
				qty: 3,
				discount: { type: 'pct', value: 10 },
			}).apply(draft);
		});
		const item = (after.pages[0]?.blocks[0] as PricingTableBlock).items[0]!;
		expect(item.name).toBe('Weekly cleaning');
		expect(item.qty).toBe(3);
		expect(item.discount).toEqual({ type: 'pct', value: 10 });

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('two add/undo cycles in a row do not throw (the frozen-snapshot regression check every command file carries)', () => {
		let body = makeBodyWithPricingTable();
		for (let cycle = 0; cycle < 2; cycle++) {
			let inverse!: Command;
			body = produce(body, (draft) => {
				inverse = addPricingItem('page-1', 'pricing-1').apply(draft);
			});
			body = produce(body, (draft) => {
				inverse.apply(draft);
			});
		}
		expect((body.pages[0]?.blocks[0] as PricingTableBlock).items).toHaveLength(1);
	});
});

describe('pricing table: sections', () => {
	it('addPricingSection appends a "Section N"; renamePricingSection changes just the name', () => {
		const original = makeBodyWithPricingTable();
		let addInverse!: Command;
		let renameInverse!: Command;
		const afterAdd = produce(original, (draft) => {
			addInverse = addPricingSection('page-1', 'pricing-1').apply(draft);
		});
		const sectionId = (afterAdd.pages[0]?.blocks[0] as PricingTableBlock).sections[0]!.id;
		expect((afterAdd.pages[0]?.blocks[0] as PricingTableBlock).sections[0]!.name).toBe('Section 1');

		const afterRename = produce(afterAdd, (draft) => {
			renameInverse = renamePricingSection('page-1', 'pricing-1', sectionId, 'Janitorial').apply(draft);
		});
		expect((afterRename.pages[0]?.blocks[0] as PricingTableBlock).sections[0]!.name).toBe('Janitorial');

		const undoneRename = produce(afterRename, (draft) => {
			renameInverse.apply(draft);
		});
		expect(undoneRename).toEqual(afterAdd);

		const undoneAdd = produce(afterAdd, (draft) => {
			addInverse.apply(draft);
		});
		expect(undoneAdd).toEqual(original);
	});

	it('removePricingSection ungroups its items (never deletes them) and its inverse restores the section and every affected item\'s sectionId', () => {
		const original = makeBodyWithPricingTable();
		let afterSetup = produce(original, (draft) => {
			addPricingSection('page-1', 'pricing-1').apply(draft);
		});
		const sectionId = (afterSetup.pages[0]?.blocks[0] as PricingTableBlock).sections[0]!.id;
		afterSetup = produce(afterSetup, (draft) => {
			const table = draft.pages[0]!.blocks[0] as PricingTableBlock;
			table.items[0]!.sectionId = sectionId;
		});

		let removeInverse!: Command;
		const afterRemove = produce(afterSetup, (draft) => {
			removeInverse = removePricingSection('page-1', 'pricing-1', sectionId).apply(draft);
		});
		const tableAfterRemove = afterRemove.pages[0]?.blocks[0] as PricingTableBlock;
		expect(tableAfterRemove.sections).toEqual([]);
		expect(tableAfterRemove.items[0]!.sectionId).toBeNull();

		const undone = produce(afterRemove, (draft) => {
			removeInverse.apply(draft);
		});
		expect(undone).toEqual(afterSetup);
	});
});

describe('pricing table: settings & currency', () => {
	it('setPricingTableSettings patches only the given settings fields; its inverse restores the rest', () => {
		const original = makeBodyWithPricingTable();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = setPricingTableSettings('page-1', 'pricing-1', { showTax: false, allowRecipientSelectOptional: true }).apply(draft);
		});
		const settings = (after.pages[0]?.blocks[0] as PricingTableBlock).settings;
		expect(settings.showTax).toBe(false);
		expect(settings.allowRecipientSelectOptional).toBe(true);
		expect(settings.showSubtotal).toBe(true); // untouched

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('setPricingTableCurrency round-trips', () => {
		const original = makeBodyWithPricingTable();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = setPricingTableCurrency('page-1', 'pricing-1', 'CAD').apply(draft);
		});
		expect((after.pages[0]?.blocks[0] as PricingTableBlock).currency).toBe('CAD');
		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});
});

describe('quote builder: groups', () => {
	it('addQuoteGroup appends a "Group N" with no options; its inverse removes it', () => {
		const original = makeBodyWithQuoteBuilder();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = addQuoteGroup('page-1', 'quote-1').apply(draft);
		});
		const block = after.pages[0]?.blocks[0] as QuoteBuilderBlock;
		expect(block.groups).toHaveLength(2);
		expect(block.groups[1]).toEqual({ id: block.groups[1]!.id, name: 'Group 1', selection: 'single', required: false, options: [] });

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('removeQuoteGroup removes the group and every option in it; its inverse restores the whole group at its original index', () => {
		const original = makeBodyWithQuoteBuilder();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = removeQuoteGroup('page-1', 'quote-1', 'group-1').apply(draft);
		});
		expect((after.pages[0]?.blocks[0] as QuoteBuilderBlock).groups).toEqual([]);

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('updateQuoteGroup patches selection/required/name; its inverse restores them', () => {
		const original = makeBodyWithQuoteBuilder();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = updateQuoteGroup('page-1', 'quote-1', 'group-1', { selection: 'multi', required: false }).apply(draft);
		});
		const group = (after.pages[0]?.blocks[0] as QuoteBuilderBlock).groups[0]!;
		expect(group.selection).toBe('multi');
		expect(group.required).toBe(false);

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});
});

describe('quote builder: options', () => {
	it('addQuoteOption appends a blank option to the given group; its inverse removes it', () => {
		const original = makeBodyWithQuoteBuilder();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = addQuoteOption('page-1', 'quote-1', 'group-1').apply(draft);
		});
		expect((after.pages[0]?.blocks[0] as QuoteBuilderBlock).groups[0]!.options).toHaveLength(2);

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('removeQuoteOption removes by id; its inverse re-inserts at the original index within the same group', () => {
		const original = makeBodyWithQuoteBuilder();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = removeQuoteOption('page-1', 'quote-1', 'group-1', 'option-1').apply(draft);
		});
		expect((after.pages[0]?.blocks[0] as QuoteBuilderBlock).groups[0]!.options).toEqual([]);

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('updateQuoteOption patches a group\'s option; its inverse restores it — same PricingItemPatch as a pricing-table item', () => {
		const original = makeBodyWithQuoteBuilder();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = updateQuoteOption('page-1', 'quote-1', 'group-1', 'option-1', { price: money(2500) }).apply(draft);
		});
		expect((after.pages[0]?.blocks[0] as QuoteBuilderBlock).groups[0]!.options[0]!.price).toBe(money(2500));

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('setQuoteBuilderCurrency round-trips', () => {
		const original = makeBodyWithQuoteBuilder();
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = setQuoteBuilderCurrency('page-1', 'quote-1', 'EUR').apply(draft);
		});
		expect((after.pages[0]?.blocks[0] as QuoteBuilderBlock).currency).toBe('EUR');
		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});
});

describe('type guards', () => {
	it('throws when the target block is not a pricing table', () => {
		const original = makeBodyWithQuoteBuilder(); // has quote-1, not a pricing table
		expect(() =>
			produce(original, (draft) => {
				addPricingItem('page-1', 'quote-1').apply(draft);
			})
		).toThrow(/not pricing_table/);
	});

	it('throws when the target block is not a quote builder', () => {
		const original = makeBodyWithPricingTable(); // has pricing-1, not a quote builder
		expect(() =>
			produce(original, (draft) => {
				addQuoteGroup('page-1', 'pricing-1').apply(draft);
			})
		).toThrow(/not quote_builder/);
	});
});

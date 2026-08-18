import type { Draft } from 'immer';
import type { BlockId, PageId, PricingItem, PricingSection, PricingTableBlock, QuoteBuilderBlock, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, createBlankPricingItem, findPage, locateBlock, snapshot } from './blockTree';

function findPricingTableBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<PricingTableBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'pricing_table') throw new Error(`findPricingTableBlock: block ${blockId} is a ${block.type} block, not pricing_table`);
	return block;
}

function findQuoteBuilderBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<QuoteBuilderBlock> {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'quote_builder') throw new Error(`findQuoteBuilderBlock: block ${blockId} is a ${block.type} block, not quote_builder`);
	return block;
}

/** Whole-block replace, self-symmetric — same idiom as `fieldCommands.ts`'s `restorePages` — for the rare command that changes several of a pricing table's fields (section list *and* several items' `sectionId`) in one shot. */
function restorePricingTable(pageId: PageId, blockId: BlockId, table: PricingTableBlock): Command {
	return {
		name: 'restorePricingTable',
		apply(draft: Draft<TemplateBody>) {
			const page = findPage(draft, pageId);
			const { blocks, index } = locateBlock(page, blockId);
			const previous = snapshot<PricingTableBlock>(blockAt(blocks, index) as Draft<PricingTableBlock>);
			blocks[index] = table;
			return restorePricingTable(pageId, blockId, previous);
		},
	};
}

function findItemIndex(items: PricingItem[], itemId: string): number {
	const index = items.findIndex((i) => i.id === itemId);
	if (index === -1) throw new Error(`no pricing item with id ${itemId}`);
	return index;
}

/**
 * Same widened-optional-patch shape as `VariableDefPatch`/`FieldConfigPatch`
 * — `exactOptionalPropertyTypes` needs an explicit `| undefined` to allow a
 * patch that *clears* `sku`/`discount`/`tax`/`catalogItemId`, not just omits
 * them. Shared by pricing-table items and quote-builder options — both are
 * `PricingItem[]`.
 */
export type PricingItemPatch = { [K in keyof Omit<PricingItem, 'id'>]?: Omit<PricingItem, 'id'>[K] | undefined };

function applyItemPatch(item: Draft<PricingItem>, patch: PricingItemPatch): PricingItemPatch {
	const previous: PricingItemPatch = {
		sectionId: item.sectionId,
		sku: item.sku,
		name: item.name,
		description: item.description,
		qty: item.qty,
		price: item.price,
		cost: item.cost,
		discount: item.discount,
		tax: item.tax,
		optional: item.optional,
		selected: item.selected,
		catalogItemId: item.catalogItemId,
		customFields: snapshot(item.customFields),
	};
	Object.assign(item, patch);
	return previous;
}

// ─── Pricing table: items ────────────────────────────────────────────────────

/** Always appended to the end — reordering pricing rows by drag isn't built (see BUILD_STATUS.md), same deferred-input-method pattern as several other blocks' drag features. */
export function addPricingItem(pageId: PageId, blockId: BlockId, sectionId: string | null = null): Command {
	return {
		name: 'addPricingItem',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const item = createBlankPricingItem(sectionId);
			table.items.push(item);
			return removePricingItem(pageId, blockId, item.id);
		},
	};
}

/** Not exported — the only ways to add an item back are "a blank one" (`addPricingItem`) or "undo a removal", both of which already have the exact content and index in hand. */
function insertPricingItem(pageId: PageId, blockId: BlockId, index: number, item: PricingItem): Command {
	return {
		name: 'insertPricingItem',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			table.items.splice(index, 0, item as Draft<PricingItem>);
			return removePricingItem(pageId, blockId, item.id);
		},
	};
}

export function removePricingItem(pageId: PageId, blockId: BlockId, itemId: string): Command {
	return {
		name: 'removePricingItem',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const index = findItemIndex(table.items, itemId);
			const removed = snapshot<PricingItem>(table.items[index]!);
			table.items.splice(index, 1);
			return insertPricingItem(pageId, blockId, index, removed);
		},
	};
}

export function updatePricingItem(pageId: PageId, blockId: BlockId, itemId: string, patch: PricingItemPatch): Command {
	return {
		name: 'updatePricingItem',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const item = table.items[findItemIndex(table.items, itemId)]!;
			const previous = applyItemPatch(item, patch);
			return updatePricingItem(pageId, blockId, itemId, previous);
		},
	};
}

// ─── Pricing table: sections (§7.1's optional grouping) ─────────────────────

function nextSectionName(existing: PricingSection[]): string {
	const used = new Set(existing.map((s) => s.name));
	let n = 1;
	while (used.has(`Section ${n}`)) n++;
	return `Section ${n}`;
}

export function addPricingSection(pageId: PageId, blockId: BlockId): Command {
	return {
		name: 'addPricingSection',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const section: PricingSection = { id: crypto.randomUUID(), name: nextSectionName(table.sections), order: table.sections.length };
			table.sections.push(section);
			return removePricingSection(pageId, blockId, section.id);
		},
	};
}

/**
 * Removing a section only ever ungroups its items (setting their `sectionId`
 * back to `null`) — sections are an optional display grouping (§7.1), so
 * deleting one must never delete pricing rows. This changes the section list
 * *and* potentially several items' `sectionId` in one shot, so — same
 * reasoning as `deleteFieldsForRole` — its inverse is a coarse whole-block
 * snapshot (`restorePricingTable`) rather than tracking each individual field
 * change precisely; this is a rare, whole-table action from a settings UI,
 * not a per-keystroke hot path.
 */
export function removePricingSection(pageId: PageId, blockId: BlockId, sectionId: string): Command {
	return {
		name: 'removePricingSection',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const before = snapshot<PricingTableBlock>(table);
			table.sections = table.sections.filter((s) => s.id !== sectionId);
			for (const item of table.items) {
				if (item.sectionId === sectionId) item.sectionId = null;
			}
			return restorePricingTable(pageId, blockId, before);
		},
	};
}

export function renamePricingSection(pageId: PageId, blockId: BlockId, sectionId: string, name: string): Command {
	return {
		name: 'renamePricingSection',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const section = table.sections.find((s) => s.id === sectionId);
			if (!section) throw new Error(`renamePricingSection: no section ${sectionId}`);
			const previousName = section.name;
			section.name = name;
			return renamePricingSection(pageId, blockId, sectionId, previousName);
		},
	};
}

// ─── Pricing table: settings & currency ─────────────────────────────────────

export type PricingTableSettingsPatch = Partial<PricingTableBlock['settings']>;

export function setPricingTableSettings(pageId: PageId, blockId: BlockId, patch: PricingTableSettingsPatch): Command {
	return {
		name: 'setPricingTableSettings',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const previous: PricingTableSettingsPatch = { ...table.settings };
			Object.assign(table.settings, patch);
			return setPricingTableSettings(pageId, blockId, previous);
		},
	};
}

export function setPricingTableCurrency(pageId: PageId, blockId: BlockId, currency: string): Command {
	return {
		name: 'setPricingTableCurrency',
		apply(draft: Draft<TemplateBody>) {
			const table = findPricingTableBlock(draft, pageId, blockId);
			const previous = table.currency;
			table.currency = currency;
			return setPricingTableCurrency(pageId, blockId, previous);
		},
	};
}

// ─── Quote builder: groups ───────────────────────────────────────────────────

function nextGroupName(existing: QuoteBuilderBlock['groups']): string {
	const used = new Set(existing.map((g) => g.name));
	let n = 1;
	while (used.has(`Group ${n}`)) n++;
	return `Group ${n}`;
}

export function addQuoteGroup(pageId: PageId, blockId: BlockId): Command {
	return {
		name: 'addQuoteGroup',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const group = { id: crypto.randomUUID(), name: nextGroupName(block.groups), selection: 'single' as const, required: false, options: [] };
			block.groups.push(group);
			return removeQuoteGroup(pageId, blockId, group.id);
		},
	};
}

/** Not exported, same reasoning as {@link insertPricingItem}. */
function insertQuoteGroup(pageId: PageId, blockId: BlockId, index: number, group: QuoteBuilderBlock['groups'][number]): Command {
	return {
		name: 'insertQuoteGroup',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			block.groups.splice(index, 0, group as Draft<typeof group>);
			return removeQuoteGroup(pageId, blockId, group.id);
		},
	};
}

/** Removes the whole group, options included — unlike a pricing section, a quote-builder group *is* the container for its options, not a display label over items that live independently. */
export function removeQuoteGroup(pageId: PageId, blockId: BlockId, groupId: string): Command {
	return {
		name: 'removeQuoteGroup',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const index = block.groups.findIndex((g) => g.id === groupId);
			if (index === -1) throw new Error(`removeQuoteGroup: no group ${groupId}`);
			const removed = snapshot(block.groups[index]!);
			block.groups.splice(index, 1);
			return insertQuoteGroup(pageId, blockId, index, removed);
		},
	};
}

export type QuoteGroupPatch = Partial<{ name: string; selection: 'single' | 'multi'; required: boolean }>;

export function updateQuoteGroup(pageId: PageId, blockId: BlockId, groupId: string, patch: QuoteGroupPatch): Command {
	return {
		name: 'updateQuoteGroup',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const group = block.groups.find((g) => g.id === groupId);
			if (!group) throw new Error(`updateQuoteGroup: no group ${groupId}`);
			const previous: QuoteGroupPatch = { name: group.name, selection: group.selection, required: group.required };
			Object.assign(group, patch);
			return updateQuoteGroup(pageId, blockId, groupId, previous);
		},
	};
}

// ─── Quote builder: options (each a `PricingItem`, same as a pricing-table row) ──

function findGroup(block: Draft<QuoteBuilderBlock>, groupId: string) {
	const group = block.groups.find((g) => g.id === groupId);
	if (!group) throw new Error(`no quote-builder group with id ${groupId}`);
	return group;
}

export function addQuoteOption(pageId: PageId, blockId: BlockId, groupId: string): Command {
	return {
		name: 'addQuoteOption',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const group = findGroup(block, groupId);
			const option = createBlankPricingItem(null);
			group.options.push(option);
			return removeQuoteOption(pageId, blockId, groupId, option.id);
		},
	};
}

/** Not exported, same reasoning as {@link insertPricingItem}. */
function insertQuoteOption(pageId: PageId, blockId: BlockId, groupId: string, index: number, option: PricingItem): Command {
	return {
		name: 'insertQuoteOption',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const group = findGroup(block, groupId);
			group.options.splice(index, 0, option as Draft<PricingItem>);
			return removeQuoteOption(pageId, blockId, groupId, option.id);
		},
	};
}

export function removeQuoteOption(pageId: PageId, blockId: BlockId, groupId: string, optionId: string): Command {
	return {
		name: 'removeQuoteOption',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const group = findGroup(block, groupId);
			const index = findItemIndex(group.options, optionId);
			const removed = snapshot<PricingItem>(group.options[index]!);
			group.options.splice(index, 1);
			return insertQuoteOption(pageId, blockId, groupId, index, removed);
		},
	};
}

export function updateQuoteOption(pageId: PageId, blockId: BlockId, groupId: string, optionId: string, patch: PricingItemPatch): Command {
	return {
		name: 'updateQuoteOption',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const group = findGroup(block, groupId);
			const option = group.options[findItemIndex(group.options, optionId)]!;
			const previous = applyItemPatch(option, patch);
			return updateQuoteOption(pageId, blockId, groupId, optionId, previous);
		},
	};
}

export function setQuoteBuilderCurrency(pageId: PageId, blockId: BlockId, currency: string): Command {
	return {
		name: 'setQuoteBuilderCurrency',
		apply(draft: Draft<TemplateBody>) {
			const block = findQuoteBuilderBlock(draft, pageId, blockId);
			const previous = block.currency;
			block.currency = currency;
			return setQuoteBuilderCurrency(pageId, blockId, previous);
		},
	};
}

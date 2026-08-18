/**
 * §7's pricing math. Pure, unit-tested to the cent, no dependency on the
 * editor store or React — per §14's architecture, this is meant to be
 * shareable with the backend eventually (still an open decision, see
 * BUILD_STATUS.md's "Decisions already made" table, on exactly how that
 * sharing happens across the two separate repos/runtimes).
 *
 * Never let a second, divergent totals implementation grow next to this one
 * (§7.1's explicit warning) — the editor header rollup, a pricing table's own
 * footer, and (later) PDF export must all call these same functions.
 */
import type { Block, Money, PricingItem, PricingTableBlock, QuoteBuilderBlock, TemplateBody } from '../editor/types';
import { money, ZERO_MONEY } from '../editor/types';

/**
 * §7.6's "round at each line, then sum", made the single constant the spec
 * asks for: every computed amount is rounded to the nearest integer minor
 * unit the moment it's produced, so nothing downstream ever accumulates
 * fractional cents. Ties round up (`Math.round`'s own behavior) — consistent
 * everywhere this is called, never re-decided per call site.
 */
function roundMoney(minorUnitsFloat: number): Money {
	return money(Math.round(minorUnitsFloat));
}

/**
 * §2.1's `discount`/`tax` shape leaves `value`'s unit implicit. Convention
 * fixed here: a `pct` value is percentage points (`10` means 10%), an
 * `amount` value is already in the template's minor units — matching how
 * `price`/`cost` are already minor units everywhere else in this file.
 */
function adjustmentAmount(base: Money, adjustment: { type: 'pct' | 'amount'; value: number } | undefined): Money {
	if (!adjustment) return ZERO_MONEY;
	return adjustment.type === 'pct' ? roundMoney((base * adjustment.value) / 100) : roundMoney(adjustment.value);
}

export interface LineTotal {
	itemId: string;
	/**
	 * False for an optional item not selected by default. Excluded from every
	 * rollup above it, but still reported here (rather than omitted) so a
	 * caller — the pricing table's own footer, in particular — can render an
	 * excluded line distinctly (e.g. struck through) instead of it just
	 * vanishing from the totals with no visible line to explain why.
	 */
	included: boolean;
	subtotal: Money;
	discount: Money;
	tax: Money;
	total: Money;
}

export interface SectionTotal {
	sectionId: string | null;
	subtotal: Money;
	discount: Money;
	tax: Money;
	total: Money;
}

export interface RollupTotals {
	subtotal: Money;
	discount: Money;
	tax: Money;
	total: Money;
}

export interface BlockTotals extends RollupTotals {
	blockId: string;
	currency: string;
	lines: LineTotal[];
	sections: SectionTotal[];
}

export interface DocumentTotals extends RollupTotals {
	currency: string;
	blocks: BlockTotals[];
}

function sumRollup(parts: RollupTotals[]): RollupTotals {
	let subtotal = 0;
	let discount = 0;
	let tax = 0;
	let total = 0;
	for (const p of parts) {
		subtotal += p.subtotal;
		discount += p.discount;
		tax += p.tax;
		total += p.total;
	}
	return { subtotal: money(subtotal), discount: money(discount), tax: money(tax), total: money(total) };
}

/** §7.2's order of operations for one row: subtotal, then discount, then tax — each rounded before the next step touches it. */
function computeLine(item: PricingItem): LineTotal {
	const included = !item.optional || item.selected;
	const subtotal = roundMoney(item.qty * item.price);
	const discount = adjustmentAmount(subtotal, item.discount);
	const afterDiscount = money(subtotal - discount);
	const tax = adjustmentAmount(afterDiscount, item.tax);
	const total = money(afterDiscount + tax);
	return { itemId: item.id, included, subtotal, discount, tax, total };
}

function rollupOf(lines: LineTotal[]): RollupTotals {
	return sumRollup(lines.filter((l) => l.included));
}

/**
 * §7.5: a table's sections are an optional display grouping, not a
 * requirement that every item belong to one — an item whose `sectionId`
 * doesn't match any of `block.sections` (never assigned one, or its section
 * was since removed) still counts toward the block's own total below, it
 * just has no `SectionTotal` entry of its own to show a subheading footer for.
 */
export function computePricingTableTotals(block: PricingTableBlock): BlockTotals {
	const lines = block.items.map(computeLine);
	const lineByItemId = new Map(lines.map((l) => [l.itemId, l] as const));
	const bySection = new Map<string | null, LineTotal[]>();
	for (const item of block.items) {
		const line = lineByItemId.get(item.id);
		if (!line) continue;
		const arr = bySection.get(item.sectionId) ?? [];
		arr.push(line);
		bySection.set(item.sectionId, arr);
	}
	const sections: SectionTotal[] = block.sections.map((s) => ({ sectionId: s.id, ...rollupOf(bySection.get(s.id) ?? []) }));
	return { blockId: block.id, currency: block.currency, lines, sections, ...rollupOf(lines) };
}

export function computeQuoteBuilderTotals(block: QuoteBuilderBlock): BlockTotals {
	const items = block.groups.flatMap((g) => g.options);
	const lines = items.map(computeLine);
	return { blockId: block.id, currency: block.currency, lines, sections: [], ...rollupOf(lines) };
}

/** Recurses into `ColumnsBlock` columns — same whole-tree-walk convention `collectAllFields` uses — so a pricing table nested in a column still counts toward the document total. */
function collectPricingBlocks(blocks: Block[]): (PricingTableBlock | QuoteBuilderBlock)[] {
	const found: (PricingTableBlock | QuoteBuilderBlock)[] = [];
	for (const block of blocks) {
		if (block.type === 'pricing_table' || block.type === 'quote_builder') found.push(block);
		else if (block.type === 'columns') for (const col of block.columns) found.push(...collectPricingBlocks(col));
	}
	return found;
}

/**
 * §7.4: the header/document total is the sum across **every** pricing/quote
 * block in the template, using each item's own stored `qty` and default
 * `selected` state for optional items — "default quantities and default
 * optional-item selections", not a recipient's later live edits. Recipient
 * selections only exist once a real `Document` does (the Create Document
 * wizard, phase 4's still-not-built, resource-gated piece) — this function
 * is already shaped to take that over once it exists (a caller would compute
 * per-block totals from the recipient's live selections instead of the
 * template's stored items), it just has nothing to read yet.
 */
export function computeTotals(body: TemplateBody): DocumentTotals {
	const allBlocks = body.pages.flatMap((p) => p.blocks);
	const pricingBlocks = collectPricingBlocks(allBlocks);
	const blocks = pricingBlocks.map((b) => (b.type === 'pricing_table' ? computePricingTableTotals(b) : computeQuoteBuilderTotals(b)));
	const currency = blocks[0]?.currency ?? 'USD';
	return { currency, blocks, ...sumRollup(blocks) };
}

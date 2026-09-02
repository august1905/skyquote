import { produce } from 'immer';
import type { Draft } from 'immer';
import { money } from '../../editor/types';
import type { PricingItem, PricingTableBlock, TemplateBody } from '../../editor/types';
import { collectPricingBlocksByPage } from '../../pricing/computeTotals';
import { findPage, locateBlock, blockAt } from '../../editor/commands/blockTree';
import type { CrmDealQuote } from '../../api/zohoCrm';

/**
 * Fills the template's line-item section with the deal's accepted CRM quote.
 *
 * The target is the **first pricing table** in the body — the section the
 * template author placed for exactly this (Grayson, 2026-09-02: "once it
 * imports, it should show up in the document inside of a line item section that
 * has been placed in the template"). Its items are **replaced**, not appended:
 * whatever rows the template carried were scaffolding for the import, and
 * leaving them would double-count the quote.
 *
 * Every imported line arrives `optional: true, selected: true`, and the block's
 * `allowRecipientSelectOptional` is switched on — this is what feeds the
 * checkable-boxes flow: the customer unticks what they don't want in section 1,
 * and `configuredBodyForAgreement` drops those rows from the agreement that
 * goes to Zoho Sign.
 *
 * A quote-level discount becomes one **non-optional negative line**, so the
 * document's total matches the CRM quote's and the customer can see why.
 *
 * Returns `null` when the body has no pricing table — the import has nowhere to
 * land, and the caller leaves the body untouched.
 */
export function applyQuoteToBody(body: TemplateBody, quote: CrmDealQuote): { body: TemplateBody; imported: number } | null {
	const target = collectPricingBlocksByPage(body).find(({ block }) => block.type === 'pricing_table');
	if (!target || quote.items.length === 0) return null;

	const items: PricingItem[] = quote.items.map((line) => ({
		id: crypto.randomUUID(),
		sectionId: null,
		name: line.name,
		description: line.description,
		qty: line.qty,
		price: money(line.price),
		optional: true,
		selected: true,
		customFields: {},
	}));

	if (quote.discount > 0) {
		items.push({
			id: crypto.randomUUID(),
			sectionId: null,
			name: 'Discount',
			description: quote.number ? `From CRM quote ${quote.number}` : 'From the CRM quote',
			qty: 1,
			price: money(-quote.discount),
			optional: false,
			selected: true,
			customFields: {},
		});
	}

	const next = produce(body, (draft: Draft<TemplateBody>) => {
		const page = findPage(draft, target.pageId);
		const { blocks, index } = locateBlock(page, target.block.id);
		const block = blockAt(blocks, index) as Draft<PricingTableBlock>;
		block.items = items;
		block.settings.allowRecipientSelectOptional = true;
	});

	return { body: next, imported: quote.items.length };
}

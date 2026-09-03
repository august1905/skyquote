import { produce } from 'immer';
import type { Draft } from 'immer';
import { money } from '../../editor/types';
import type { PricingItem, PricingSection, PricingTableBlock, TemplateBody } from '../../editor/types';
import { collectPricingBlocksByPage } from '../../pricing/computeTotals';
import { findPage, locateBlock, blockAt } from '../../editor/commands/blockTree';
import type { CrmDealQuote } from '../../api/zohoCrm';

/**
 * Fills the template's Package selection with the deal's CRM quotes — one
 * **section per quote**, because one quote is one package (Grayson,
 * 2026-09-02): the section name is the package name, its items are that entire
 * quote's lines, and the customer picks exactly one package in the document.
 *
 * The target is the **first pricing table** in the body — the block the
 * template author placed for exactly this. Its sections and items are
 * **replaced**, not appended: whatever rows the template carried were
 * scaffolding for the import, and leaving them would double-count.
 *
 * The block becomes a package choice (`settings.packageSelection`), and a
 * package is all-or-nothing: every line lands `optional: false`, and
 * `allowRecipientSelectOptional` is switched off, so the only choosable thing
 * is which package. An already-accepted CRM quote becomes the preselected
 * package; otherwise the first (cheapest — the backend sorts) is.
 *
 * A quote-level discount becomes one negative line **inside its package**, so
 * each package's total matches its CRM quote's and the customer can see why.
 *
 * Returns `null` when the body has no pricing table or no quote has items —
 * the import has nowhere to land or nothing to land, and the caller leaves the
 * body untouched.
 */
export function applyQuotesToBody(body: TemplateBody, quotes: CrmDealQuote[]): { body: TemplateBody; imported: number } | null {
	const target = collectPricingBlocksByPage(body).find(({ block }) => block.type === 'pricing_table');
	const usable = quotes.filter((quote) => quote.items.length > 0);
	if (!target || usable.length === 0) return null;

	const sections: PricingSection[] = [];
	const items: PricingItem[] = [];
	let selectedSectionId: string | null = null;

	usable.forEach((quote, index) => {
		const section: PricingSection = {
			id: crypto.randomUUID(),
			name: quote.name || quote.subject || `Package ${index + 1}`,
			order: index,
		};
		sections.push(section);
		if (quote.status === 'Accepted' && selectedSectionId === null) selectedSectionId = section.id;

		for (const line of quote.items) {
			items.push({
				id: crypto.randomUUID(),
				sectionId: section.id,
				name: line.name,
				description: line.description,
				qty: line.qty,
				price: money(line.price),
				optional: false,
				selected: true,
				customFields: {},
			});
		}
		if (quote.discount > 0) {
			items.push({
				id: crypto.randomUUID(),
				sectionId: section.id,
				name: 'Discount',
				description: quote.number ? `From CRM quote ${quote.number}` : 'From the CRM quote',
				qty: 1,
				price: money(-quote.discount),
				optional: false,
				selected: true,
				customFields: {},
			});
		}
	});

	const next = produce(body, (draft: Draft<TemplateBody>) => {
		const page = findPage(draft, target.pageId);
		const { blocks, index } = locateBlock(page, target.block.id);
		const block = blockAt(blocks, index) as Draft<PricingTableBlock>;
		block.sections = sections;
		block.items = items;
		block.selectedSectionId = selectedSectionId ?? sections[0]!.id;
		block.settings.packageSelection = true;
		block.settings.allowRecipientSelectOptional = false;
	});

	return { body: next, imported: usable.length };
}

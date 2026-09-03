import { produce } from 'immer';
import type { Draft } from 'immer';
import type { PricingItem, PricingTableBlock, TemplateBody } from '../../editor/types';
import { blockAt, findPage, locateBlock } from '../../editor/commands/blockTree';
import { collectPricingBlocksByPage, computePricingTableTotals, computeTotals } from '../../pricing/computeTotals';
import { formatMoney } from '../../pricing/formatMoney';

interface PricingStepProps {
	body: TemplateBody;
	onChange: (body: TemplateBody) => void;
}

function itemsOf(block: ReturnType<typeof collectPricingBlocksByPage>[number]['block']): PricingItem[] {
	return block.type === 'pricing_table' ? block.items : block.groups.flatMap((g) => g.options);
}

/**
 * §11 step 4: "Configure pricing — optionally adjust quantities/optional
 * items before send." This edits a working copy of the template body
 * (`onChange` replaces it wholesale) via the exact same `findPage`/
 * `locateBlock` addressing every editor command already uses — there's
 * nothing document-specific about finding a block by id, so this reuses
 * that rather than writing a second tree-walker.
 */
export function PricingStep({ body, onChange }: PricingStepProps) {
	const pricingBlocks = collectPricingBlocksByPage(body);
	const totals = computeTotals(body);

	function updateItem(pageId: string, blockId: string, itemId: string, patch: Partial<Pick<PricingItem, 'qty' | 'selected'>>) {
		onChange(
			produce(body, (draft: Draft<TemplateBody>) => {
				const page = findPage(draft, pageId);
				const { blocks, index } = locateBlock(page, blockId);
				const target = blockAt(blocks, index);
				if (target.type !== 'pricing_table' && target.type !== 'quote_builder') return;
				const items = target.type === 'pricing_table' ? target.items : target.groups.flatMap((g) => g.options);
				const item = items.find((i) => i.id === itemId);
				if (item) Object.assign(item, patch);
			})
		);
	}

	function choosePackage(pageId: string, blockId: string, sectionId: string) {
		onChange(
			produce(body, (draft: Draft<TemplateBody>) => {
				const page = findPage(draft, pageId);
				const { blocks, index } = locateBlock(page, blockId);
				const target = blockAt(blocks, index);
				if (target.type !== 'pricing_table') return;
				target.selectedSectionId = sectionId;
			})
		);
	}

	/** The default the customer's own chooser opens on — they can still switch packages in the document. */
	function packagePicker(pageId: string, block: PricingTableBlock) {
		const sectionTotalById = new Map(computePricingTableTotals(block).sections.map((s) => [s.sectionId, s] as const));
		return (
			<div key={block.id} className="wizard-pricing-block">
				{[...block.sections]
					.sort((a, b) => a.order - b.order)
					.map((section) => {
						const total = sectionTotalById.get(section.id);
						return (
							<label key={section.id} className="wizard-pricing-package">
								<input
									type="radio"
									name={`wizard-package-${block.id}`}
									checked={(block.selectedSectionId ?? null) === section.id}
									aria-label={`${section.name || 'Package'} as default`}
									onChange={() => choosePackage(pageId, block.id, section.id)}
								/>
								<span className="wizard-pricing-item-name">{section.name || 'Package'}</span>
								<span className="wizard-pricing-item-price">{total ? formatMoney(total.total, block.currency) : null}</span>
							</label>
						);
					})}
				<p className="wizard-hint">The customer picks their package in the document — this only sets which one starts selected.</p>
			</div>
		);
	}

	if (pricingBlocks.length === 0) {
		return <p className="wizard-hint">This template has no Package selection or quote builder blocks.</p>;
	}

	return (
		<div className="wizard-step">
			{pricingBlocks.map(({ pageId, block }) => {
				if (block.type === 'pricing_table' && block.settings.packageSelection) return packagePicker(pageId, block);
				return (
				<div key={block.id} className="wizard-pricing-block">
					{itemsOf(block).map((item) => (
						<div key={item.id} className="wizard-pricing-item">
							<span className="wizard-pricing-item-name">{item.name || 'Untitled item'}</span>
							<input
								type="number"
								min={0}
								aria-label={`${item.name || 'Untitled item'} quantity`}
								value={item.qty}
								onChange={(e) => updateItem(pageId, block.id, item.id, { qty: Number(e.target.value) })}
							/>
							{item.optional && (
								<label className="wizard-pricing-item-optional">
									<input
										type="checkbox"
										checked={item.selected}
										onChange={(e) => updateItem(pageId, block.id, item.id, { selected: e.target.checked })}
									/>
									Include
								</label>
							)}
							<span className="wizard-pricing-item-price">{formatMoney(item.price, block.currency)}</span>
						</div>
					))}
				</div>
				);
			})}
			<div className="wizard-pricing-total">Total: {formatMoney(totals.total, totals.currency)}</div>
		</div>
	);
}

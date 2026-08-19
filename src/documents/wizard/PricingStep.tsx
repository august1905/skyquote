import { produce } from 'immer';
import type { Draft } from 'immer';
import type { PricingItem, TemplateBody } from '../../editor/types';
import { blockAt, findPage, locateBlock } from '../../editor/commands/blockTree';
import { collectPricingBlocksByPage, computeTotals } from '../../pricing/computeTotals';
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

	if (pricingBlocks.length === 0) {
		return <p className="wizard-hint">This template has no pricing tables or quote builders.</p>;
	}

	return (
		<div className="wizard-step">
			{pricingBlocks.map(({ pageId, block }) => (
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
			))}
			<div className="wizard-pricing-total">Total: {formatMoney(totals.total, totals.currency)}</div>
		</div>
	);
}

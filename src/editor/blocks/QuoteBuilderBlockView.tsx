import { addQuoteGroup, addQuoteOption, removeQuoteGroup, removeQuoteOption, setQuoteBuilderCurrency, updateQuoteGroup, updateQuoteOption } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { QuoteBuilderBlock } from '../types';
import { computeQuoteBuilderTotals } from '../../pricing/computeTotals';
import { formatMoney } from '../../pricing/formatMoney';
import type { BlockViewProps } from './types';
import { PricingItemRow } from './pricing/PricingItemRow';
import './pricing/pricing.css';

/**
 * §2.1's `QuoteBuilderBlock` — "recipient-configurable pricing: mutually
 * exclusive option groups + add-ons". The authoring side (this view): define
 * groups, each holding options (single/multi selection, optionally
 * required). The recipient-facing side — actually letting someone pick an
 * option and see the total react live — needs a real Document/recipient
 * view to be meaningful (a template preview has no "the recipient chose
 * this" state to persist), so it isn't built here; see BUILD_STATUS.md.
 */
export function QuoteBuilderBlockView({ pageId, block, selected }: BlockViewProps<QuoteBuilderBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const totals = computeQuoteBuilderTotals(block);
	const lineByItemId = new Map(totals.lines.map((l) => [l.itemId, l]));
	const editable = selected && !block.locked;

	function stopAnd<E extends { stopPropagation: () => void }>(action: () => void) {
		return (e: E) => {
			e.stopPropagation();
			action();
		};
	}

	return (
		<div className="block-quote-builder">
			{editable && (
				<div className="quote-builder-toolbar" onClick={(e) => e.stopPropagation()}>
					<label>
						Currency
						<input
							type="text"
							value={block.currency}
							onChange={(e) => runCommand(setQuoteBuilderCurrency(pageId, block.id, e.target.value.toUpperCase()), { coalesceKey: `${block.id}-currency` })}
							onBlur={endCoalescing}
						/>
					</label>
				</div>
			)}
			{block.groups.map((group) => (
				<div key={group.id} className="quote-group">
					<div className="quote-group-header">
						{editable ? (
							<>
								<input
									type="text"
									className="quote-group-name"
									value={group.name}
									onChange={(e) => runCommand(updateQuoteGroup(pageId, block.id, group.id, { name: e.target.value }), { coalesceKey: `${block.id}-${group.id}-name` })}
									onBlur={endCoalescing}
								/>
								<label>
									<select
										value={group.selection}
										onChange={(e) => runCommand(updateQuoteGroup(pageId, block.id, group.id, { selection: e.target.value as 'single' | 'multi' }))}
									>
										<option value="single">Pick one</option>
										<option value="multi">Pick any</option>
									</select>
								</label>
								<label>
									<input
										type="checkbox"
										checked={group.required}
										onChange={(e) => runCommand(updateQuoteGroup(pageId, block.id, group.id, { required: e.target.checked }))}
									/>
									Required
								</label>
								<button type="button" className="quote-group-remove" onClick={stopAnd(() => runCommand(removeQuoteGroup(pageId, block.id, group.id)))}>
									Remove group
								</button>
							</>
						) : (
							<>
								<span className="quote-group-name">{group.name}</span>
								<span>{group.selection === 'single' ? 'Pick one' : 'Pick any'}{group.required ? ' · Required' : ''}</span>
							</>
						)}
					</div>
					{group.options.map((option) => (
						<PricingItemRow
							key={option.id}
							item={option}
							line={lineByItemId.get(option.id)!}
							currency={block.currency}
							locked={block.locked}
							showRemove={editable}
							showDiscount
							showTax
							onChange={(patch) => runCommand(updateQuoteOption(pageId, block.id, group.id, option.id, patch), { coalesceKey: `${block.id}-${option.id}` })}
							onBlurField={endCoalescing}
							onRemove={() => runCommand(removeQuoteOption(pageId, block.id, group.id, option.id))}
						/>
					))}
					{editable && (
						<button type="button" className="quote-group-add-option" onClick={() => runCommand(addQuoteOption(pageId, block.id, group.id))}>
							+ Option
						</button>
					)}
				</div>
			))}
			{editable && (
				<button type="button" onClick={() => runCommand(addQuoteGroup(pageId, block.id))}>
					+ Group
				</button>
			)}
			<div className="quote-builder-footer">
				<div className="pricing-table-footer-row pricing-table-footer-total">
					<span>Total</span>
					<span>{formatMoney(totals.total, block.currency)}</span>
				</div>
			</div>
		</div>
	);
}

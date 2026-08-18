import type { PricingItem } from '../../types';
import type { PricingItemPatch } from '../../commands';
import { formatMoney, parseMoneyInput } from '../../../pricing/formatMoney';
import type { LineTotal } from '../../../pricing/computeTotals';
import { AdjustmentInput } from './AdjustmentInput';

interface PricingItemRowProps {
	item: PricingItem;
	line: LineTotal;
	currency: string;
	locked: boolean;
	/** Only the remove button needs this — every other field is editable regardless of selection, same convention `TableCellEditor`'s cells already follow. */
	showRemove: boolean;
	showDiscount: boolean;
	showTax: boolean;
	onChange: (patch: PricingItemPatch) => void;
	onBlurField: () => void;
	onRemove: () => void;
}

/** One row, shared by a `PricingTableBlock`'s items and a `QuoteBuilderBlock` group's options — both are `PricingItem[]`. */
export function PricingItemRow({ item, line, currency, locked, showRemove, showDiscount, showTax, onChange, onBlurField, onRemove }: PricingItemRowProps) {
	return (
		<div className={`pricing-item-row${line.included ? '' : ' pricing-item-row-excluded'}`}>
			<input
				className="pricing-item-name"
				type="text"
				placeholder="Item name"
				disabled={locked}
				value={item.name}
				onChange={(e) => onChange({ name: e.target.value })}
				onBlur={onBlurField}
			/>
			<input
				className="pricing-item-description"
				type="text"
				placeholder="Description"
				disabled={locked}
				value={item.description}
				onChange={(e) => onChange({ description: e.target.value })}
				onBlur={onBlurField}
			/>
			<input
				className="pricing-item-qty"
				type="number"
				aria-label={`${item.name || 'Item'} quantity`}
				disabled={locked}
				value={item.qty}
				onChange={(e) => onChange({ qty: Number(e.target.value) })}
				onBlur={onBlurField}
			/>
			<input
				className="pricing-item-price"
				type="number"
				step="0.01"
				aria-label={`${item.name || 'Item'} price`}
				disabled={locked}
				value={(item.price / 100).toFixed(2)}
				onChange={(e) => {
					const parsed = parseMoneyInput(e.target.value);
					if (parsed !== null) onChange({ price: parsed });
				}}
				onBlur={onBlurField}
			/>
			{showDiscount && <AdjustmentInput label="Discount" disabled={locked} value={item.discount} onChange={(discount) => onChange({ discount })} />}
			{showTax && <AdjustmentInput label="Tax" disabled={locked} value={item.tax} onChange={(tax) => onChange({ tax })} />}
			<label className="pricing-item-optional">
				<input type="checkbox" disabled={locked} checked={item.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
				Optional
			</label>
			{item.optional && (
				<label className="pricing-item-selected">
					<input type="checkbox" disabled={locked} checked={item.selected} onChange={(e) => onChange({ selected: e.target.checked })} />
					Included by default
				</label>
			)}
			<span className="pricing-item-line-total">{formatMoney(line.total, currency)}</span>
			{showRemove && !locked && (
				<button type="button" className="pricing-item-remove" aria-label={`Remove ${item.name || 'item'}`} onClick={onRemove}>
					×
				</button>
			)}
		</div>
	);
}

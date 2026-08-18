/** A `PricingItem.discount`/`.tax` editor — §2.1's `{ type: 'pct' | 'amount'; value: number } | undefined`. Shared by pricing-table rows and quote-builder options, both of which have this exact shape twice (once for discount, once for tax). */
export interface AdjustmentValue {
	type: 'pct' | 'amount';
	value: number;
}

interface AdjustmentInputProps {
	label: string;
	value: AdjustmentValue | undefined;
	disabled?: boolean;
	onChange: (value: AdjustmentValue | undefined) => void;
}

export function AdjustmentInput({ label, value, disabled, onChange }: AdjustmentInputProps) {
	return (
		<label className="pricing-adjustment">
			<span className="pricing-adjustment-label">{label}</span>
			<select
				aria-label={label}
				disabled={disabled}
				value={value?.type ?? 'none'}
				onChange={(e) => {
					const kind = e.target.value;
					if (kind === 'none') onChange(undefined);
					else onChange({ type: kind as 'pct' | 'amount', value: value?.value ?? 0 });
				}}
			>
				<option value="none">—</option>
				<option value="pct">%</option>
				<option value="amount">$</option>
			</select>
			{value && (
				<input
					type="number"
					className="pricing-adjustment-value"
					aria-label={`${label} value`}
					disabled={disabled}
					value={value.value}
					onChange={(e) => onChange({ type: value.type, value: Number(e.target.value) })}
				/>
			)}
		</label>
	);
}

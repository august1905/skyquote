import { TEXT_STYLE_COLORS, TEXT_STYLE_SIZES, textStyleId, type TextStyle } from '../textStyles';

interface TextStyleSelectProps {
	/** The style currently applied, or null when the text is wearing something outside the catalogue. */
	value: TextStyle | null;
	onChange: (styleId: string) => void;
	disabled?: boolean;
	/** Distinguishes the toolbar's ("Text style") from the merge field popover's ("Merge field style") — two controls with one accessible name would make both ambiguous. */
	label: string;
	className?: string;
}

/**
 * §'s text styles as one selector — every colour at every size, grouped by
 * colour, exactly as Grayson described them ("one option is Navy 22px, another
 * is White 12px, another is White 14px").
 *
 * One `<select>` rather than separate colour and size controls, because the
 * styles are the vocabulary: "Navy 22px" is a thing you pick, not two things
 * you compose. `<optgroup>` per colour is what keeps ~600 options navigable —
 * the list collapses to 17 headings you scan, and native type-ahead ("navy 22")
 * jumps straight to a style by name.
 *
 * The empty option only exists while the selection *is* unstyled: it reports
 * "not one of ours" honestly instead of showing a style that isn't applied. It
 * isn't offered as a choice once a style is set — clearing is Reset/Clear
 * formatting's job, and a blank entry that silently unstyles text on mis-click
 * would be a trap.
 */
export function TextStyleSelect({ value, onChange, disabled, label, className }: TextStyleSelectProps) {
	return (
		<select
			className={className}
			aria-label={label}
			value={value?.id ?? ''}
			disabled={disabled}
			onChange={(event) => {
				if (event.target.value) onChange(event.target.value);
			}}
		>
			{value === null && <option value="">No style</option>}
			{TEXT_STYLE_COLORS.map((color) => (
				<optgroup key={color.id} label={color.name}>
					{TEXT_STYLE_SIZES.map((sizePx) => (
						<option key={sizePx} value={textStyleId(color.id, sizePx)}>
							{color.name} {sizePx}px
						</option>
					))}
				</optgroup>
			))}
		</select>
	);
}

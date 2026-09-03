import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { allVariables } from '../variables/systemVariables';
import { findTextStyle, textStyleCss } from '../textStyles';
import { TextStyleSelect } from '../toolbar/TextStyleSelect';
import './richtext.css';

/**
 * §5: click a variable chip → popover to change which variable it points to,
 * or set fallback text (used at document-generation time if the variable
 * resolves empty — phase 4). The chip itself always renders the literal
 * `[Key]` token in template mode, never a resolved value.
 */
export function VariableChipView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
	const [open, setOpen] = useState(false);
	const customVariables = useEditorStore((s) => s.body?.variables ?? []);
	const variables = allVariables(customVariables);
	const key = node.attrs.key as string;
	const fallback = (node.attrs.fallback as string | null) ?? '';
	const style = findTextStyle(node.attrs.styleId as string | null);

	// PM gives this atom node a real NodeSelection while it's clicked into;
	// once the user selects/clicks anything else, `selected` goes false —
	// piggybacking on that closes the popover without a separate outside-
	// click listener.
	useEffect(() => {
		if (!selected) setOpen(false);
	}, [selected]);

	return (
		<NodeViewWrapper
			as="span"
			className={`rt-variable-chip${selected ? ' rt-variable-chip-selected' : ''}`}
			// On the wrapper, not the button: the chip's own button inherits both
			// (`font: inherit; color: inherit` in richtext.css), so the style shows
			// through without fighting the chip's highlight.
			style={style ? textStyleCss(style) : undefined}
		>
			<button type="button" className="rt-variable-chip-button" onClick={() => setOpen((o) => !o)}>
				[{key}]
			</button>
			{open && (
				<span className="rt-variable-popover" contentEditable={false}>
					<label>
						<span>Variable</span>
						<select aria-label="Variable" value={key} onChange={(e) => updateAttributes({ key: e.target.value })}>
							{variables.map((v) => (
								<option key={v.key} value={v.key}>
									{v.label} ({v.key})
								</option>
							))}
						</select>
					</label>
					<label>
						<span>Fallback text</span>
						<input
							type="text"
							aria-label="Fallback text"
							value={fallback}
							onChange={(e) => updateAttributes({ fallback: e.target.value || null })}
						/>
					</label>
					{/* §'s house styles, per chip. A merge field is usually the one
					    piece of a line that has to look different — a total, a
					    client name in a headline — and styling it by selecting the
					    chip in the text meant selecting an atom node, which is
					    fiddly at chip size. */}
					<label>
						<span>Style</span>
						<TextStyleSelect
							label="Merge field style"
							value={style}
							onChange={(styleId) => updateAttributes({ styleId })}
						/>
					</label>
					<div className="rt-variable-popover-actions">
						<button type="button" onClick={() => setOpen(false)}>
							Done
						</button>
						<button type="button" aria-label="Remove variable" onClick={() => deleteNode()}>
							Remove
						</button>
					</div>
				</span>
			)}
		</NodeViewWrapper>
	);
}

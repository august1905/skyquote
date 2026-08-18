import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { VariableDef } from '../types';

export interface VariableSuggestionListRef {
	onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface VariableSuggestionListProps {
	items: VariableDef[];
	command: (item: VariableDef) => void;
}

/**
 * The `[` picker's dropdown (§4.1: "filter as you type, navigate with
 * arrows, insert on Enter, dismiss on Escape" — Escape is handled by the
 * extension itself, since it needs to close the whole suggestion, not just
 * this list). Only variables today; fillable fields extend this same list
 * once they exist (§4.1: "typing `[` opens a combobox for variables and
 * fields" — see BUILD_STATUS.md).
 */
export const VariableSuggestionList = forwardRef<VariableSuggestionListRef, VariableSuggestionListProps>((props, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => setSelectedIndex(0), [props.items]);

	function selectItem(index: number) {
		const item = props.items[index];
		if (item) props.command(item);
	}

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }) => {
			if (props.items.length === 0) return false;
			if (event.key === 'ArrowUp') {
				setSelectedIndex((i) => (i + props.items.length - 1) % props.items.length);
				return true;
			}
			if (event.key === 'ArrowDown') {
				setSelectedIndex((i) => (i + 1) % props.items.length);
				return true;
			}
			if (event.key === 'Enter') {
				selectItem(selectedIndex);
				return true;
			}
			return false;
		},
	}));

	if (props.items.length === 0) {
		return (
			<div className="rt-suggestion-list">
				<div className="rt-suggestion-empty">No matching variables</div>
			</div>
		);
	}

	return (
		<div className="rt-suggestion-list">
			{props.items.map((item, index) => (
				<button
					key={item.key}
					type="button"
					className={`rt-suggestion-item${index === selectedIndex ? ' rt-suggestion-item-active' : ''}`}
					onMouseEnter={() => setSelectedIndex(index)}
					onClick={() => selectItem(index)}
				>
					<span className="rt-suggestion-item-label">{item.label}</span>
					<span className="rt-suggestion-item-key">{item.key}</span>
				</button>
			))}
		</div>
	);
});
VariableSuggestionList.displayName = 'VariableSuggestionList';

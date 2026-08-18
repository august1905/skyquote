import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FieldChipView } from './FieldChipView';
import type { FillableField } from '../types';

/**
 * §5's other required custom PM node: "Renders a role-tinted pill labeled
 * with the field type/name. Click → field settings popover." Unlike
 * `variable` (whose only real data is a `key` string), a field's *entire*
 * `FillableField` lives in this node's `field` attr — there's no separate
 * central registry to look it up in (§6.2), so the node has to carry its own
 * full config.
 */
declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		fillableField: {
			insertFillableField: (field: FillableField) => ReturnType;
		};
	}
}

export const FillableFieldNode = Node.create({
	name: 'fillableField',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			field: { default: null },
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-field-id]' }];
	},

	renderHTML({ HTMLAttributes }) {
		const field = HTMLAttributes.field as FillableField | null;
		return ['span', mergeAttributes(HTMLAttributes, { 'data-field-id': field?.id ?? '', class: 'rt-field-chip-html' }), field?.name ?? ''];
	},

	addNodeView() {
		return ReactNodeViewRenderer(FieldChipView);
	},

	addCommands() {
		return {
			insertFillableField:
				(field: FillableField) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs: { field } }),
		};
	},
});

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { VariableChipView } from './VariableChipView';

/**
 * §5's required custom PM node: "Renders `[Client.Company]` as a chip with a
 * subtle highlight. Deleting removes the whole chip. Click → popover to
 * change variable or set fallback text." `atom` + non-`editable`'s content
 * means ProseMirror treats it as a single unit for cursor/selection/deletion
 * purposes — ordinary Backspace removes the whole node, never partial text
 * inside it (there is none).
 */
export interface VariableNodeAttrs {
	key: string;
	fallback: string | null;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		variable: {
			insertVariable: (attrs: VariableNodeAttrs) => ReturnType;
		};
	}
}

export const VariableNode = Node.create({
	name: 'variable',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			key: { default: '' },
			fallback: { default: null },
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-variable-key]', getAttrs: (el) => ({ key: el.getAttribute('data-variable-key') || '' }) }];
	},

	renderHTML({ HTMLAttributes }) {
		const key = String(HTMLAttributes.key ?? '');
		return ['span', mergeAttributes(HTMLAttributes, { 'data-variable-key': key, class: 'rt-variable-chip' }), `[${key}]`];
	},

	addNodeView() {
		return ReactNodeViewRenderer(VariableChipView);
	},

	addCommands() {
		return {
			insertVariable:
				(attrs: VariableNodeAttrs) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs }),
		};
	},
});

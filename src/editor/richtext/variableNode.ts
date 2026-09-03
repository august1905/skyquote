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
	/**
	 * A house text style (`navy-22`), or null to inherit whatever the
	 * surrounding text is wearing.
	 *
	 * An attribute rather than a `textStyle` mark on the node, even though the
	 * two would render alike here. The chip is a placeholder that becomes real
	 * text at document time, and `resolveVariables` is where that happens — an
	 * attribute makes the style part of the thing being resolved, and turns into
	 * an ordinary colour/size mark on the text it produces. A mark would have had
	 * to be copied across that boundary by hand, which is exactly the sort of
	 * thing that gets forgotten and silently drops a 48px navy headline to body
	 * size the moment a document is created.
	 */
	styleId?: string | null;
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
			styleId: {
				default: null,
				// Round-trips as `data-style-id` rather than as a bare `styleId`
				// attribute, so a chip that goes out through `getHTML` and comes
				// back through a paste keeps its style.
				parseHTML: (element) => element.getAttribute('data-style-id'),
				renderHTML: (attributes) => (attributes.styleId ? { 'data-style-id': attributes.styleId as string } : {}),
			},
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

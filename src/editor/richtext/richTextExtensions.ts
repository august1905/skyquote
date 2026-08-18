import { StarterKit } from '@tiptap/starter-kit';
import type { AnyExtension } from '@tiptap/core';
import { VariableNode } from './variableNode';
import { VariableSuggestion } from './variableSuggestion';

/**
 * Shared by every rich-text surface (`TextBlockView`, `TableCellEditor`) so
 * the `variable` node and its `[` picker behave identically everywhere text
 * is editable — §5 requires both nodes work "inline in rich text", not just
 * in whole text blocks.
 */
export function richTextExtensions(): AnyExtension[] {
	return [
		// This app owns undo/redo (the command stack) so the whole
		// TemplateBody stays the unit of undo, not just one editor's own
		// ProseMirror history.
		StarterKit.configure({ undoRedo: false }),
		VariableNode,
		VariableSuggestion,
	];
}

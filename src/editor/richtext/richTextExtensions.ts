import { StarterKit } from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import type { AnyExtension } from '@tiptap/core';
import { VariableNode } from './variableNode';
import { FillableFieldNode } from './fieldNode';
import { InsertSuggestion } from './insertSuggestion';
import { EscapeToBlur } from './escapeToBlur';

/**
 * Shared by every rich-text surface (`TextBlockView`, `TableCellEditor`) so
 * the `variable` node and its `[` picker behave identically everywhere text
 * is editable — §5 requires both nodes work "inline in rich text", not just
 * in whole text blocks.
 *
 * The mark/node set here is what §2's contextual toolbar can actually offer.
 * StarterKit already brings bold/italic/strike/code/underline/link, headings,
 * blockquote, code block, and both list types (verified against the installed
 * 3.30.1 build rather than assumed from the docs — `link` and `underline` are
 * enabled by default in v3's StarterKit, so neither needs installing
 * separately). Everything added alongside it below is an official Tiptap
 * extension, deliberately not a hand-rolled mark:
 *
 * - `TextStyleKit` — color, font family, font size, line height. Its
 *   `backgroundColor` is switched off because the dedicated `Highlight` mark
 *   below covers the same ground and is what §2's "highlight" control means;
 *   leaving both on would put two different ways to shade text in the schema
 *   with nothing to distinguish them.
 * - `TextAlign` — §2's left/center/right/justify, applied to the block types
 *   that can meaningfully carry it.
 * - `Superscript`/`Subscript`/`Highlight` — §2's `…` overflow group.
 */
export function richTextExtensions(): AnyExtension[] {
	return [
		// This app owns undo/redo (the command stack) so the whole
		// TemplateBody stays the unit of undo, not just one editor's own
		// ProseMirror history.
		StarterKit.configure({ undoRedo: false }),
		TextStyleKit.configure({ backgroundColor: false }),
		TextAlign.configure({ types: ['heading', 'paragraph'] }),
		Highlight,
		Superscript,
		Subscript,
		VariableNode,
		FillableFieldNode,
		InsertSuggestion,
		// Listed after InsertSuggestion, and lower-priority than it, so the
		// `[` picker gets first refusal on Escape — see escapeToBlur.ts.
		EscapeToBlur,
	];
}

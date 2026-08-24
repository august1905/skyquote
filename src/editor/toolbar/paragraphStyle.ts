/**
 * §2's "Paragraph style dropdown: Normal text, Heading 1–3, Quote, Code" —
 * the detection half, kept pure so it's unit-testable without a live
 * ProseMirror instance (jsdom can't reliably host one; see BUILD_STATUS.md's
 * phase-1 step-7 note on why Tiptap wiring gets verified in a real browser
 * instead).
 */

export type ParagraphStyleId = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'blockquote' | 'codeBlock';

export const PARAGRAPH_STYLE_OPTIONS: { id: ParagraphStyleId; label: string }[] = [
	{ id: 'paragraph', label: 'Normal text' },
	{ id: 'heading1', label: 'Heading 1' },
	{ id: 'heading2', label: 'Heading 2' },
	{ id: 'heading3', label: 'Heading 3' },
	{ id: 'blockquote', label: 'Quote' },
	{ id: 'codeBlock', label: 'Code' },
];

/** The subset of Tiptap's `Editor.isActive` this needs — narrowed to a plain function so tests can pass a fake. */
export type IsActive = (name: string, attrs?: Record<string, unknown>) => boolean;

/**
 * Which single style the dropdown should display for the current selection.
 *
 * Order matters and isn't arbitrary: a blockquote *wraps* a paragraph, so
 * both `blockquote` and `paragraph` report active inside a quote — checking
 * paragraph first would make the dropdown claim "Normal text" for quoted
 * text. Code block and headings are their own node types and can't overlap,
 * but they're checked ahead of paragraph for the same reason. Paragraph is
 * the fallback because it's the only one of these that's the default node.
 */
export function currentParagraphStyle(isActive: IsActive): ParagraphStyleId {
	if (isActive('codeBlock')) return 'codeBlock';
	if (isActive('blockquote')) return 'blockquote';
	if (isActive('heading', { level: 1 })) return 'heading1';
	if (isActive('heading', { level: 2 })) return 'heading2';
	if (isActive('heading', { level: 3 })) return 'heading3';
	return 'paragraph';
}

/** §2's font-family dropdown. An empty `value` means "inherit from the theme" (the Theme panel's `bodyFont`), not a font literally named "". */
export const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
	{ value: '', label: 'Theme font' },
	{ value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
	{ value: 'Georgia, serif', label: 'Georgia' },
	{ value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
	{ value: '"Courier New", Courier, monospace', label: 'Courier New' },
	{ value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
];

/** §2's "Line spacing". Unitless multipliers, which is what CSS `line-height` wants for text that should scale with its own font size. */
export const LINE_HEIGHT_OPTIONS: { value: string; label: string }[] = [
	{ value: '', label: 'Theme spacing' },
	{ value: '1', label: 'Single' },
	{ value: '1.15', label: '1.15' },
	{ value: '1.5', label: '1.5' },
	{ value: '2', label: 'Double' },
];

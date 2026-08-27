/**
 * §2's paragraph style dropdown — the detection half, kept pure so it's
 * unit-testable without a live ProseMirror instance (jsdom can't reliably host
 * one; see BUILD_STATUS.md's phase-1 step-7 note on why Tiptap wiring gets
 * verified in a real browser instead).
 *
 * **Headings are gone** (Grayson, 2026-08-27): "everything can be made by
 * increasing size and color of a text element", and a font-size slider that
 * runs to 100px makes that true. Heading *nodes* still parse and render, so
 * templates written before this keep the look they had — there is simply no
 * longer a way to make a new one, and `currentParagraphStyle` reports an
 * existing heading as normal text, so choosing that flattens it.
 */

export type ParagraphStyleId = 'paragraph' | 'blockquote' | 'codeBlock';

export const PARAGRAPH_STYLE_OPTIONS: { id: ParagraphStyleId; label: string }[] = [
	{ id: 'paragraph', label: 'Normal text' },
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
 * text. Code block is its own node type and can't overlap, but it's checked
 * ahead of paragraph for the same reason. Paragraph is the fallback because
 * it's the only one of these that's the default node — and a legacy heading
 * falls through to it deliberately, so the one thing the dropdown can still do
 * with a heading is turn it into normal text.
 */
export function currentParagraphStyle(isActive: IsActive): ParagraphStyleId {
	if (isActive('codeBlock')) return 'codeBlock';
	if (isActive('blockquote')) return 'blockquote';
	return 'paragraph';
}

/** §2's "Line spacing". Unitless multipliers, which is what CSS `line-height` wants for text that should scale with its own font size. */
export const LINE_HEIGHT_OPTIONS: { value: string; label: string }[] = [
	{ value: '', label: 'Theme spacing' },
	{ value: '1', label: 'Single' },
	{ value: '1.15', label: '1.15' },
	{ value: '1.5', label: '1.5' },
	{ value: '2', label: 'Double' },
];

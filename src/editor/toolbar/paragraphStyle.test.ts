import { describe, expect, it } from 'vitest';
import { currentParagraphStyle, type IsActive } from './paragraphStyle';

/** A fake `Editor.isActive` — the set of things reported active, matched the same way Tiptap matches (name, plus attrs when given). */
function fakeIsActive(active: { name: string; attrs?: Record<string, unknown> }[]): IsActive {
	return (name, attrs) =>
		active.some((entry) => {
			if (entry.name !== name) return false;
			if (!attrs) return true;
			return Object.entries(attrs).every(([key, value]) => entry.attrs?.[key] === value);
		});
}

describe('currentParagraphStyle', () => {
	it('falls back to paragraph when nothing else matches', () => {
		expect(currentParagraphStyle(fakeIsActive([]))).toBe('paragraph');
		expect(currentParagraphStyle(fakeIsActive([{ name: 'paragraph' }]))).toBe('paragraph');
	});

	it('reports each heading level distinctly', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'heading', attrs: { level: 1 } }]))).toBe('heading1');
		expect(currentParagraphStyle(fakeIsActive([{ name: 'heading', attrs: { level: 2 } }]))).toBe('heading2');
		expect(currentParagraphStyle(fakeIsActive([{ name: 'heading', attrs: { level: 3 } }]))).toBe('heading3');
	});

	it('reports a heading deeper than 3 as paragraph — the dropdown only offers 1–3, so there is no honest option to show', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'heading', attrs: { level: 4 } }]))).toBe('paragraph');
	});

	// The reason the check order in currentParagraphStyle is deliberate: a
	// blockquote WRAPS a paragraph, so both report active at once.
	it('prefers blockquote over the paragraph it wraps', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'blockquote' }, { name: 'paragraph' }]))).toBe('blockquote');
	});

	it('prefers a quoted heading’s blockquote over the heading, so the dropdown matches the outermost wrapper', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'blockquote' }, { name: 'heading', attrs: { level: 2 } }]))).toBe('blockquote');
	});

	it('prefers codeBlock over everything else', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'codeBlock' }, { name: 'paragraph' }]))).toBe('codeBlock');
	});
});

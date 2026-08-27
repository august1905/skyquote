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

	it('reports a legacy heading as normal text, which is the only thing the dropdown can now do with one', () => {
		// Headings are no longer offered (Grayson, 2026-08-27), but heading nodes
		// still exist in templates written before that and still render. Reporting
		// one as `paragraph` is what makes choosing "Normal text" flatten it —
		// otherwise a legacy heading would be permanently stuck.
		for (const level of [1, 2, 3, 4]) {
			expect(currentParagraphStyle(fakeIsActive([{ name: 'heading', attrs: { level } }]))).toBe('paragraph');
		}
	});

	// The reason the check order in currentParagraphStyle is deliberate: a
	// blockquote WRAPS a paragraph, so both report active at once.
	it('prefers blockquote over the paragraph it wraps', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'blockquote' }, { name: 'paragraph' }]))).toBe('blockquote');
	});

	it('still prefers the blockquote wrapping a legacy heading, so the dropdown matches the outermost wrapper', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'blockquote' }, { name: 'heading', attrs: { level: 2 } }]))).toBe('blockquote');
	});

	it('prefers codeBlock over everything else', () => {
		expect(currentParagraphStyle(fakeIsActive([{ name: 'codeBlock' }, { name: 'paragraph' }]))).toBe('codeBlock');
	});
});

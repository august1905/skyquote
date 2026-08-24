import { describe, expect, it } from 'vitest';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, clampFontSize, parseFontSize } from './fontSize';

describe('parseFontSize', () => {
	it('reads a stored px value', () => {
		expect(parseFontSize('24px')).toBe(24);
	});

	it('reports nothing set as null rather than as a default', () => {
		// The distinction the whole control rests on: unset follows the Theme
		// panel's size, and 16px pins it. Folding one into the other here would
		// make Reset indistinguishable from picking 16.
		expect(parseFontSize('')).toBeNull();
		expect(parseFontSize(undefined)).toBeNull();
	});

	it('treats a value it cannot express as unset, never as NaN', () => {
		// Tiptap stores whatever string was set, and older data may hold other
		// units. A NaN would reach the slider's `value` and blank the control.
		expect(parseFontSize('1.5rem')).toBeNull();
		expect(parseFontSize('inherit')).toBeNull();
	});

	it('tolerates whitespace and case, which round-trip through the DOM', () => {
		expect(parseFontSize(' 18PX ')).toBe(18);
	});

	it('clamps a stored value that is outside what the control can show', () => {
		expect(parseFontSize('400px')).toBe(MAX_FONT_SIZE);
		expect(parseFontSize('2px')).toBe(MIN_FONT_SIZE);
	});
});

describe('clampFontSize', () => {
	it('keeps a size inside the range and rounds to whole px', () => {
		expect(clampFontSize(37.4)).toBe(37);
		expect(clampFontSize(0)).toBe(MIN_FONT_SIZE);
		expect(clampFontSize(9999)).toBe(MAX_FONT_SIZE);
	});

	it('survives the empty number input, which reads as NaN', () => {
		expect(clampFontSize(Number.NaN)).toBe(16);
	});

	it('covers the range that was asked for', () => {
		// The old dropdown stopped at 32 and offered six sizes total.
		expect(MAX_FONT_SIZE).toBe(100);
		expect(clampFontSize(41)).toBe(41);
	});
});

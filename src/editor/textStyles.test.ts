import { describe, expect, it } from 'vitest';
import {
	MAX_TEXT_STYLE_SIZE,
	MIN_TEXT_STYLE_SIZE,
	TEXT_STYLES,
	TEXT_STYLE_COLORS,
	TEXT_STYLE_SIZES,
	findTextStyle,
	matchTextStyle,
	textStyleCss,
	textStyleId,
} from './textStyles';

describe('the text style catalogue', () => {
	it('offers every colour at every 2px size from 10 to 80', () => {
		// The literal ask (Grayson, 2026-09-03): "every pixel increment from 10px
		// to 80px in increments of 2px".
		expect(TEXT_STYLE_SIZES[0]).toBe(MIN_TEXT_STYLE_SIZE);
		expect(TEXT_STYLE_SIZES[TEXT_STYLE_SIZES.length - 1]).toBe(MAX_TEXT_STYLE_SIZE);
		expect(TEXT_STYLE_SIZES).toHaveLength(36);
		expect(TEXT_STYLE_SIZES.every((size, index) => index === 0 || size - TEXT_STYLE_SIZES[index - 1]! === 2)).toBe(true);
		expect(TEXT_STYLES).toHaveLength(TEXT_STYLE_COLORS.length * TEXT_STYLE_SIZES.length);
	});

	it('names a style the way the selector reads it out', () => {
		expect(findTextStyle('navy-22')?.label).toBe('Navy 22px');
		expect(findTextStyle('white-12')?.label).toBe('White 12px');
		expect(findTextStyle('white-14')?.label).toBe('White 14px');
	});

	it('uses the design system’s own hexes, not approximations of them', () => {
		// A style called Navy has to be the wordmark's navy — see index.css, which
		// mirrors the same tokens.
		expect(findTextStyle('navy-22')?.color.hex).toBe('#094D82');
		expect(findTextStyle('sky-blue-16')?.color.hex).toBe('#13A5DF');
		expect(findTextStyle('orange-16')?.color.hex).toBe('#ED6825');
	});

	it('gives every style a unique id, so one can never shadow another', () => {
		expect(new Set(TEXT_STYLES.map((style) => style.id)).size).toBe(TEXT_STYLES.length);
	});

	it('renders as plain colour and size CSS', () => {
		expect(textStyleCss(findTextStyle('navy-22')!)).toEqual({ color: '#094D82', fontSize: '22px' });
	});

	it('returns null for an id it does not know rather than throwing', () => {
		// A colour retired from the palette must not crash a template that still
		// names it; the chip simply renders unstyled.
		expect(findTextStyle('mauve-22')).toBeNull();
		expect(findTextStyle(null)).toBeNull();
		expect(findTextStyle(undefined)).toBeNull();
	});
});

describe('matchTextStyle', () => {
	it('recognises text already wearing a house style, whatever case the hex is in', () => {
		expect(matchTextStyle('#094D82', '22px')?.id).toBe('navy-22');
		expect(matchTextStyle('#094d82', '22px')?.id).toBe('navy-22');
	});

	it('recognises an rgb() colour, which is what a computed style or a paste produces', () => {
		expect(matchTextStyle('rgb(9, 77, 130)', '22px')?.id).toBe('navy-22');
	});

	it('reports no style when only one half matches', () => {
		// Navy at 23px is not a house style. Claiming it was would let the next
		// touch of the selector silently resize it to 22.
		expect(matchTextStyle('#094D82', '23px')).toBeNull();
		expect(matchTextStyle('#123456', '22px')).toBeNull();
	});

	it('reports no style for text that sets neither, or only one, of colour and size', () => {
		expect(matchTextStyle(undefined, undefined)).toBeNull();
		expect(matchTextStyle('#094D82', undefined)).toBeNull();
		expect(matchTextStyle(undefined, '22px')).toBeNull();
	});
});

describe('textStyleId', () => {
	it('is the stored form, and is stable', () => {
		// Stored on every styled merge field. Changing the shape here would
		// unstyle content saved by an earlier build.
		expect(textStyleId('navy', 22)).toBe('navy-22');
	});
});

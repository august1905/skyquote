import { describe, expect, it } from 'vitest';
import { pageContentHeight, pageContentWidth, pageDimensions } from './pageDimensions';

describe('pageDimensions', () => {
	it('returns LETTER/A4 portrait dimensions in px @96dpi', () => {
		expect(pageDimensions('LETTER', 'portrait')).toEqual({ width: 816, height: 1056 });
		expect(pageDimensions('A4', 'portrait')).toEqual({ width: 794, height: 1123 });
	});

	it('swaps width/height for landscape', () => {
		expect(pageDimensions('LETTER', 'landscape')).toEqual({ width: 1056, height: 816 });
		expect(pageDimensions('A4', 'landscape')).toEqual({ width: 1123, height: 794 });
	});
});

describe('pageContentWidth / pageContentHeight', () => {
	const margins = { top: 96, right: 48, bottom: 96, left: 48 };

	it('subtracts left+right margins from the page width', () => {
		expect(pageContentWidth('LETTER', 'portrait', margins)).toBe(816 - 48 - 48);
	});

	it('subtracts top+bottom margins from the page height', () => {
		expect(pageContentHeight('LETTER', 'portrait', margins)).toBe(1056 - 96 - 96);
	});

	it('uses the swapped landscape dimensions', () => {
		expect(pageContentWidth('LETTER', 'landscape', margins)).toBe(1056 - 48 - 48);
		expect(pageContentHeight('LETTER', 'landscape', margins)).toBe(816 - 96 - 96);
	});
});

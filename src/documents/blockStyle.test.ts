import { describe, expect, it } from 'vitest';
import type { BlockStyle } from '../editor/types';
import { blockStyleToCss, editorBlockContentCss, editorBlockFrameCss, hasBlockStyle } from './blockStyle';

const spacing = (top: number, right: number, bottom: number, left: number) => ({ top, right, bottom, left });

describe('blockStyleToCss', () => {
	it('is empty for an unstyled block, so the read-only renderers can skip the wrapper', () => {
		expect(blockStyleToCss({})).toEqual({});
		expect(hasBlockStyle({})).toBe(false);
	});

	it('maps padding per side', () => {
		expect(blockStyleToCss({ padding: spacing(10, 20, 30, 40) }).padding).toBe('10px 20px 30px 40px');
	});

	it('maps all four margins, horizontal included', () => {
		// Horizontal margin used to be dropped on the floor — `SortableBlock` only
		// ever applied top/bottom, so "nudge this block 24px right" was inexpressible.
		const css = blockStyleToCss({ margin: spacing(8, 16, 8, 24) });
		expect(css.marginTop).toBe(8);
		expect(css.marginBottom).toBe(8);
		expect(css.marginLeft).toBe(24);
		expect(css.marginRight).toBe(16);
	});

	it('centres with auto margins when the author left the horizontal sides alone', () => {
		const css = blockStyleToCss({ width: 0.5, alignment: 'center', margin: spacing(8, 0, 8, 0) });
		expect(css.marginLeft).toBe('auto');
		expect(css.marginRight).toBe('auto');
		expect(css.marginTop).toBe(8);
	});

	it('lets an explicit horizontal margin beat the alignment it would otherwise fight', () => {
		// The rule that replaced "never set horizontal margin at all": alignment
		// fills in the sides the author didn't set, and yields on the ones they did.
		const css = blockStyleToCss({ width: 0.5, alignment: 'center', margin: spacing(0, 0, 0, 24) });
		expect(css.marginLeft).toBe(24);
		expect(css.marginRight).toBe('auto');
	});

	it('right-aligns by pushing from the left only', () => {
		const css = blockStyleToCss({ width: 0.5, alignment: 'right' });
		expect(css.marginLeft).toBe('auto');
		expect(css.marginRight).toBeUndefined();
	});

	it('ignores alignment without a width, since a full-width block has nowhere to move', () => {
		expect(blockStyleToCss({ alignment: 'center' })).toEqual({});
	});

	it('maps background, border and width', () => {
		const style: BlockStyle = {
			backgroundColor: '#064d81',
			border: { width: 2, style: 'dashed', color: '#000000', radius: 6 },
			width: 0.75,
		};
		const css = blockStyleToCss(style);
		expect(css.backgroundColor).toBe('#064d81');
		expect(css.border).toBe('2px dashed #000000');
		expect(css.borderRadius).toBe(6);
		expect(css.width).toBe('75%');
		expect(hasBlockStyle(style)).toBe(true);
	});
});

describe('the canvas split', () => {
	const style = {
		margin: spacing(8, 0, 8, 24),
		padding: spacing(10, 10, 10, 10),
		backgroundColor: '#eeeeee',
	};

	it('puts margin on the block frame, which is the thing that has to move', () => {
		// Margin on the inner content left the selection outline exactly where it
		// was while its contents shuffled around inside — reported as margin not
		// moving the container of the text element.
		const frame = editorBlockFrameCss(style);
		expect(frame.marginLeft).toBe(24);
		expect(frame.marginTop).toBe(8);
		expect(frame.padding).toBeUndefined();
		expect(frame.backgroundColor).toBeUndefined();
	});

	it('keeps everything else inside, so a user border cannot outrank the selection outline', () => {
		const content = editorBlockContentCss(style);
		expect(content.padding).toBe('10px 10px 10px 10px');
		expect(content.backgroundColor).toBe('#eeeeee');
		expect(content.marginLeft).toBeUndefined();
		expect(content.marginTop).toBeUndefined();
	});

	it('leaves alignment on the content, where `width` is', () => {
		// An `auto` margin on the full-width frame computes to zero. Hoisting it out
		// of the content — where `width` lives — silently stops a centred block from
		// centring, which is exactly what the first version of this split did.
		const centred = { width: 0.5, alignment: 'center' as const };
		expect(editorBlockContentCss(centred).marginLeft).toBe('auto');
		expect(editorBlockFrameCss(centred).marginLeft).toBeUndefined();
	});

	it('together covers exactly what the read-only renderers apply as one', () => {
		// The split is a canvas detail. If the two halves ever stopped adding up to
		// `blockStyleToCss`, the editor and the sent document would disagree.
		expect({ ...editorBlockFrameCss(style), ...editorBlockContentCss(style) }).toEqual(blockStyleToCss(style));
	});
});

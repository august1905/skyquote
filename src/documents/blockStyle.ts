import type { CSSProperties } from 'react';
import type { BlockStyle } from '../editor/types';

/**
 * §4.3's `BlockStyle` as CSS, for **every** renderer — the canvas, the
 * recipient's document view, and the PDF.
 *
 * It lived inside `SortableBlock` until 2026-08-24, which meant block padding,
 * margin, background, border, width and alignment were an **editor-only**
 * effect: an author could put 40px of padding and a brand background on a block,
 * see it on the canvas, and send a document where none of it existed. Exactly
 * the shape of the page-background bug fixed the same day, and found while
 * moving spacing onto the toolbar — there is no point making a control easier to
 * reach if what it produces never leaves the editor.
 *
 * Horizontal margins are honoured here, which they weren't before. `SortableBlock`
 * applied `margin.top`/`margin.bottom` only, because a centred block sets
 * `margin-left/right: auto` and an explicit value would fight it. Now that all
 * four sides are editable, the rule is written down instead of avoided: an
 * explicit horizontal margin wins, and `auto` fills in only on a side the author
 * left at zero. Alignment still works, and a deliberate `margin-left: 64px` is no
 * longer silently dropped.
 */
export function blockStyleToCss(style: BlockStyle): CSSProperties {
	const css: CSSProperties = {};

	const margin = style.margin;
	if (margin) {
		css.marginTop = margin.top;
		css.marginBottom = margin.bottom;
		if (margin.left) css.marginLeft = margin.left;
		if (margin.right) css.marginRight = margin.right;
	}

	if (style.padding) {
		const p = style.padding;
		css.padding = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
	}

	if (style.backgroundColor) css.backgroundColor = style.backgroundColor;

	if (style.border) {
		css.border = `${style.border.width}px ${style.border.style} ${style.border.color}`;
		if (style.border.radius) css.borderRadius = style.border.radius;
	}

	if (style.width !== undefined) {
		css.width = `${style.width * 100}%`;
		// Only where the author hasn't asked for a specific gap — see above.
		if (style.alignment === 'center') {
			if (!margin?.left) css.marginLeft = 'auto';
			if (!margin?.right) css.marginRight = 'auto';
		} else if (style.alignment === 'right') {
			if (!margin?.left) css.marginLeft = 'auto';
		}
	}

	return css;
}

/** Whether a block carries any styling at all — lets the read-only renderers skip the wrapper element entirely rather than emit an empty `<div>` around every block. */
export function hasBlockStyle(style: BlockStyle): boolean {
	return Object.keys(blockStyleToCss(style)).length > 0;
}

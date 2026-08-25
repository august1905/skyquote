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

/**
 * `blockStyleToCss` split in two, for the canvas only.
 *
 * The editor has two nested elements per block: the outer `.canvas-block`, which
 * owns the selection outline and the block toolbar, and the inner
 * `.canvas-block-content`, which carries the author's styling. Margin has to go
 * on the **outer** one — it's the gap between this block and its neighbours, and
 * putting it inside meant the frame stayed exactly where it was while its
 * contents shuffled around within it. Reported as margin not moving the container
 * of the text element.
 *
 * Everything else stays inside, deliberately: a user-set border on
 * `.canvas-block` would outrank `.canvas-block-selected`'s border-colour through
 * inline-style specificity and make selection invisible.
 *
 * The read-only renderers have one element per block and use `blockStyleToCss`
 * whole, so nothing about this split reaches the document or the PDF.
 */
export function editorBlockFrameCss(style: BlockStyle): CSSProperties {
	const css = blockStyleToCss(style);
	// Numeric margins only. The `auto` ones are alignment, and alignment has to
	// stay on whichever element carries `width` — an `auto` margin on the
	// full-width frame computes to zero, so hoisting it here would silently stop
	// centred blocks from centring.
	const frame: CSSProperties = {};
	if (typeof css.marginTop === 'number') frame.marginTop = css.marginTop;
	if (typeof css.marginRight === 'number') frame.marginRight = css.marginRight;
	if (typeof css.marginBottom === 'number') frame.marginBottom = css.marginBottom;
	if (typeof css.marginLeft === 'number') frame.marginLeft = css.marginLeft;
	return frame;
}

/** The inner half of the split above — everything the frame didn't take, `width` and its `auto` margins included. */
export function editorBlockContentCss(style: BlockStyle): CSSProperties {
	const css: CSSProperties = { ...blockStyleToCss(style) };
	if (typeof css.marginTop === 'number') delete css.marginTop;
	if (typeof css.marginRight === 'number') delete css.marginRight;
	if (typeof css.marginBottom === 'number') delete css.marginBottom;
	if (typeof css.marginLeft === 'number') delete css.marginLeft;
	return css;
}

/** Whether a block carries any styling at all — lets the read-only renderers skip the wrapper element entirely rather than emit an empty `<div>` around every block. */
export function hasBlockStyle(style: BlockStyle): boolean {
	return Object.keys(blockStyleToCss(style)).length > 0;
}

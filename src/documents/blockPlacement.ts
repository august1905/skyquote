import type { CSSProperties } from 'react';
import type { Block, BlockPlacement } from '../editor/types';

/**
 * A pinned block's position as CSS, for **every** renderer — the canvas, the
 * recipient's view and the PDF. One mapping, for the same reason
 * `blockStyleToCss` is one mapping: a block that sits in a different place in
 * the sent document than it did in the editor is worse than one that can't be
 * placed at all.
 *
 * **Horizontal in percent, vertical in px**, and that asymmetry is deliberate.
 * The editor and the PDF draw the page at exactly the template's page size, so
 * either unit is exact there. The recipient's page is `max-width: 100%` and does
 * shrink on a phone — where a percentage keeps a headline in the same place over
 * its background image, and a px offset would slide it off. Vertically nothing
 * shrinks (the page grows to fit its flow content), so px is both exact and
 * stable; a percentage there would drift the moment a page ran long.
 *
 * Positioned against the page's **padding box**, which for `.canvas-page` /
 * `.doc-view-page` / `.print-page` is the paper itself — margins are padding on
 * those elements, so `x: 0` is the paper's edge and a full-bleed band works.
 */
export function placementToCss(placement: BlockPlacement, pageWidthPx: number): CSSProperties {
	const percent = (px: number) => `${(px / pageWidthPx) * 100}%`;
	return {
		position: 'absolute',
		left: percent(placement.x),
		top: placement.y,
		width: percent(placement.width),
		...(placement.height === undefined ? {} : { height: placement.height }),
	};
}

/**
 * Splits a page's blocks into the ones that flow and the ones pinned on top.
 *
 * Every renderer needs the same split, and pagination needs it too: a pinned
 * block occupies no space in the column, so measuring it would push the flow
 * content down by the height of something that isn't there.
 */
export function splitPlacedBlocks<B extends Block>(blocks: B[]): { flow: B[]; placed: B[] } {
	const flow: B[] = [];
	const placed: B[] = [];
	for (const block of blocks) {
		if (block.placement) placed.push(block);
		else flow.push(block);
	}
	return { flow, placed };
}

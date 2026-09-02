import type { BlockId, BlockPlacement } from '../types';

/** The rendered rect of a block, in page px — what "pin this where it already is" needs so the block doesn't jump when it's pinned. */
export function measureBlockOnPage(blockId: BlockId, pageWidthPx: number): BlockPlacement | undefined {
	const node = document.querySelector(`.canvas-block[data-block-id="${CSS.escape(blockId)}"]`);
	const page = node?.closest('.canvas-page');
	if (!node || !page) return undefined;
	const blockRect = node.getBoundingClientRect();
	const pageRect = page.getBoundingClientRect();
	// The canvas may be displayed at less than 100%; everything below is in page
	// px, so screen px are divided back out by the page's own scale.
	const scale = pageRect.width > 0 ? pageRect.width / pageWidthPx : 1;
	return {
		x: Math.round((blockRect.left - pageRect.left) / scale),
		y: Math.round((blockRect.top - pageRect.top) / scale),
		width: Math.round(blockRect.width / scale),
	};
}

/**
 * Where a just-inserted block should be pinned: the spot it rendered at, pushed
 * below any block already pinned to this page.
 *
 * The push exists because pinned blocks leave the flow. Once a page is authored
 * entirely with pinned blocks its flow is empty, so every fresh insert *renders*
 * at the top of the column — and pinning it there would stack every new block
 * onto the last one at the same coordinates. Landing under the lowest pinned
 * block keeps "add, add, add" reading top-to-bottom, the way the flow did.
 *
 * Only pinned blocks on the block's own sheet are considered (they render on a
 * logical page's first sheet), and the result is still clamped by the caller,
 * so a full page piles up at the bottom rather than walking off the paper.
 */
export function measurePinnedLandingSpot(blockId: BlockId, pageWidthPx: number, gapPx: number): BlockPlacement | undefined {
	const node = document.querySelector(`.canvas-block[data-block-id="${CSS.escape(blockId)}"]`);
	const page = node?.closest('.canvas-page');
	if (!node || !page) return undefined;
	const measured = measureBlockOnPage(blockId, pageWidthPx);
	if (!measured) return undefined;
	const pageRect = page.getBoundingClientRect();
	const scale = pageRect.width > 0 ? pageRect.width / pageWidthPx : 1;
	let y = measured.y;
	for (const placed of page.querySelectorAll('.canvas-placed')) {
		const bottom = (placed.getBoundingClientRect().bottom - pageRect.top) / scale + gapPx;
		if (bottom > y) y = Math.round(bottom);
	}
	return { ...measured, y };
}

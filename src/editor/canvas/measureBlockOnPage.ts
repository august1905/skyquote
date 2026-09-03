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
 * A drop point on a page's drop surface, in page px from the paper's top-left —
 * the coordinate space `BlockPlacement` is stored in.
 *
 * Reads the surface's rect live rather than taking dnd-kit's measured one: the
 * canvas auto-scrolls while a drag is near the viewport's edge, and a rect
 * captured at drag start describes a page that has since moved. A live
 * `getBoundingClientRect()` is in the same coordinate space as the pointer's own
 * `clientX/clientY`, which is the only pairing that stays true either way.
 *
 * Null if the surface has gone (a page deleted mid-drag) rather than a guessed
 * coordinate — the caller then falls back to an ordinary flow insert, which is
 * wrong-but-harmless where a wrong coordinate is neither.
 */
export function pageDropPoint(surfaceElementId: string, pointer: { x: number; y: number }, pageWidthPx: number): { x: number; y: number } | null {
	const node = document.querySelector(`[data-page-drop-surface="${CSS.escape(surfaceElementId)}"]`);
	if (!node) return null;
	const rect = node.getBoundingClientRect();
	if (rect.width === 0) return null;
	const scale = rect.width / pageWidthPx;
	return { x: Math.round((pointer.x - rect.left) / scale), y: Math.round((pointer.y - rect.top) / scale) };
}

/**
 * Where a block dropped at an exact spot should be pinned: its top-left under
 * the pointer, at the width it rendered at — narrowed, if it has to be, so it
 * still ends inside the page's right margin.
 *
 * The narrowing is what keeps "it lands where I dropped it" literally true. A
 * block inserted into the flow measures the full content width, and pinning
 * something 624px wide at x=500 on an 816px page would leave `clampPlacement`
 * no choice but to shove it back to x=192 — a block that visibly jumps away
 * from the cursor that placed it. Ending at the margin instead keeps x exact,
 * and the placed-block handles can widen it afterwards.
 */
export function measureDroppedPlacement(
	blockId: BlockId,
	pageWidthPx: number,
	rightMarginPx: number,
	dropPoint: { x: number; y: number }
): BlockPlacement | undefined {
	const measured = measureBlockOnPage(blockId, pageWidthPx);
	if (!measured) return undefined;
	const available = pageWidthPx - rightMarginPx - dropPoint.x;
	// A negative `available` (dropped in the right margin) falls to
	// `clampPlacement`, which enforces the minimum size and pulls x back only
	// as far as it must.
	return { x: dropPoint.x, y: dropPoint.y, width: Math.min(measured.width, Math.max(available, 0)) };
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

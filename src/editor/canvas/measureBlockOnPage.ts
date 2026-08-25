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

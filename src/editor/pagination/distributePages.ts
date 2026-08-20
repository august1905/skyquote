import type { Block, BlockId } from '../types';

/**
 * §10's measure-and-distribute pass, v1-scoped to **whole-block granularity**
 * — splitting a block across a page boundary (a paragraph mid-sentence, a
 * table/pricing row) needs real DOM line-measurement and content-splitting
 * machinery, a materially separate, harder feature (§10 step 2's "for text
 * blocks, measure at line granularity"). Deferred and documented, same
 * "ship the core capability, flag the narrower gap" pattern as every other
 * block type's deferred refinements (Table/Columns' resize dividers, Image's
 * crop). An oversized atomic block (taller than one page, which in this v1
 * is every block type) is pushed onto its own page whole, per §10 step 3's
 * "push it whole if atomic."
 *
 * A missing height (not yet measured) is treated as 0 — it stays wherever it
 * naturally falls until a real measurement arrives and this re-runs, rather
 * than blocking distribution on a value that doesn't exist yet.
 *
 * `gapPx` is the theme's block-to-block spacing (`.canvas-page-blocks`'s
 * flex `gap`, canvas.css) — real vertical space between two blocks on the
 * same page, not counted before the first block on a page. Omitting this
 * would under-count how much a page actually holds, letting content
 * genuinely overflow the fixed physical page height this is supposed to
 * prevent in the first place.
 */
export function distributeBlocksIntoPhysicalPages(
	blocks: Block[],
	heightsByBlockId: ReadonlyMap<BlockId, number>,
	pageContentHeightPx: number,
	gapPx = 0
): BlockId[][] {
	const pages: BlockId[][] = [[]];
	let currentHeight = 0;
	let forceBreakBeforeNext = false;

	for (const block of blocks) {
		let currentPage = pages[pages.length - 1]!;
		if (forceBreakBeforeNext && currentPage.length > 0) {
			pages.push([]);
			currentPage = pages[pages.length - 1]!;
			currentHeight = 0;
		}
		forceBreakBeforeNext = false;

		const height = heightsByBlockId.get(block.id) ?? 0;
		if (currentPage.length > 0 && currentHeight + gapPx + height > pageContentHeightPx) {
			pages.push([]);
			currentPage = pages[pages.length - 1]!;
			currentHeight = 0;
		}

		// Recomputed after any break above settles which page this block
		// actually lands on — a freshly emptied page never charges a leading gap.
		const additionalHeight = currentPage.length > 0 ? gapPx + height : height;
		currentPage.push(block.id);
		currentHeight += additionalHeight;

		// §4.5: "Zero-height marker forcing the next block onto a new physical
		// page." The break block itself still renders on the page it naturally
		// falls on — only whatever comes after it is pushed to a fresh one.
		if (block.type === 'page_break') forceBreakBeforeNext = true;
	}

	return pages;
}

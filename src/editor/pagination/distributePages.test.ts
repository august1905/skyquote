import { describe, expect, it } from 'vitest';
import { makeTextBlock } from '../commands/testFixtures';
import { createPageBreakBlock } from '../commands/blockTree';
import { distributeBlocksIntoPhysicalPages } from './distributePages';

describe('distributeBlocksIntoPhysicalPages', () => {
	it('puts everything on one page when it all fits', () => {
		const blocks = [makeTextBlock('a'), makeTextBlock('b')];
		const heights = new Map([
			['a', 100],
			['b', 100],
		]);
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 1000)).toEqual([['a', 'b']]);
	});

	it('spills onto a second page once content exceeds the page content height', () => {
		const blocks = [makeTextBlock('a'), makeTextBlock('b'), makeTextBlock('c')];
		const heights = new Map([
			['a', 400],
			['b', 400],
			['c', 400],
		]);
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 1000)).toEqual([
			['a', 'b'],
			['c'],
		]);
	});

	it('pushes an atomic block taller than a full page onto its own page whole, rather than looping forever or splitting it', () => {
		const blocks = [makeTextBlock('a'), makeTextBlock('huge'), makeTextBlock('c')];
		const heights = new Map([
			['a', 100],
			['huge', 5000],
			['c', 100],
		]);
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 1000)).toEqual([['a'], ['huge'], ['c']]);
	});

	it('treats an unmeasured block (no entry in the heights map) as height 0', () => {
		const blocks = [makeTextBlock('a'), makeTextBlock('unmeasured')];
		const heights = new Map([['a', 900]]);
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 1000)).toEqual([['a', 'unmeasured']]);
	});

	it('a page_break block forces only the next block onto a new page, not itself', () => {
		const pageBreak = createPageBreakBlock();
		const blocks = [makeTextBlock('a'), pageBreak, makeTextBlock('b')];
		const heights = new Map([
			['a', 100],
			[pageBreak.id, 0],
			['b', 100],
		]);
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 1000)).toEqual([['a', pageBreak.id], ['b']]);
	});

	it('a page_break as the very first block still forces the next block to page 2, without an empty page 1 in between', () => {
		const pageBreak = createPageBreakBlock();
		const blocks = [pageBreak, makeTextBlock('a')];
		const heights = new Map([
			[pageBreak.id, 0],
			['a', 100],
		]);
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 1000)).toEqual([[pageBreak.id], ['a']]);
	});

	it('a page with no blocks distributes to a single empty page, not zero pages', () => {
		expect(distributeBlocksIntoPhysicalPages([], new Map(), 1000)).toEqual([[]]);
	});

	it('counts the gap between blocks (not before the first one on a page) toward the page content height', () => {
		const blocks = [makeTextBlock('a'), makeTextBlock('b'), makeTextBlock('c')];
		const heights = new Map([
			['a', 480],
			['b', 480],
			['c', 480],
		]);
		// a+b alone (960) exactly fills a 960px page with zero gap — adding a
		// real 16px gap between them is what tips a+gap+b over the limit and
		// forces b onto its own page; the same heights/limit with gapPx: 0
		// let a and b share a page instead. Same inputs, different gap,
		// different grouping — proof the gap is actually load-bearing.
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 960, 16)).toEqual([['a'], ['b'], ['c']]);
		expect(distributeBlocksIntoPhysicalPages(blocks, heights, 960, 0)).toEqual([['a', 'b'], ['c']]);
	});
});

import { describe, expect, it } from 'vitest';
import type { Block } from '../editor/types';
import { placementToCss, splitPlacedBlocks } from './blockPlacement';

const LETTER_WIDTH = 816;

function block(id: string, placement?: Block['placement']): Block {
	return {
		id,
		type: 'text',
		locked: false,
		style: {},
		...(placement ? { placement } : {}),
		doc: { type: 'doc', content: [] },
	};
}

describe('placementToCss', () => {
	it('positions horizontally in percent so a pinned block holds its spot on a page that shrinks', () => {
		// The recipient's page is `max-width: 100%` and does shrink on a phone. A px
		// offset would slide a headline off the band of background image it was
		// placed on; a percentage keeps it there.
		const css = placementToCss({ x: 204, y: 96, width: 408 }, LETTER_WIDTH);
		expect(css.left).toBe('25%');
		expect(css.width).toBe('50%');
		expect(css.position).toBe('absolute');
	});

	it('positions vertically in px, which nothing scales', () => {
		// A percentage would resolve against the page's *used* height, so a page that
		// ran long would drift every pinned block on it.
		expect(placementToCss({ x: 0, y: 96, width: 100 }, LETTER_WIDTH).top).toBe(96);
	});

	it('leaves height alone when the block should size to its content', () => {
		expect(placementToCss({ x: 0, y: 0, width: 100 }, LETTER_WIDTH).height).toBeUndefined();
		expect(placementToCss({ x: 0, y: 0, width: 100, height: 240 }, LETTER_WIDTH).height).toBe(240);
	});

	it('puts x: 0 at the paper edge, which is what makes a full-bleed band possible', () => {
		expect(placementToCss({ x: 0, y: 0, width: LETTER_WIDTH }, LETTER_WIDTH)).toMatchObject({ left: '0%', top: 0, width: '100%' });
	});
});

describe('splitPlacedBlocks', () => {
	it('separates pinned blocks from the flow, keeping each side in order', () => {
		const blocks = [block('a'), block('b', { x: 0, y: 0, width: 100 }), block('c')];
		const { flow, placed } = splitPlacedBlocks(blocks);
		expect(flow.map((b) => b.id)).toEqual(['a', 'c']);
		expect(placed.map((b) => b.id)).toEqual(['b']);
	});

	it('reports no pinned blocks for an ordinary page', () => {
		// Which is what lets pagination and all three renderers take the split
		// unconditionally without changing behaviour for templates that use none.
		const { flow, placed } = splitPlacedBlocks([block('a'), block('b')]);
		expect(flow).toHaveLength(2);
		expect(placed).toHaveLength(0);
	});
});

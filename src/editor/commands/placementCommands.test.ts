import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { TemplateBody } from '../types';
import type { Command } from './types';
import { MIN_PLACED_SIZE, PLACEMENT_GRID, clampPlacement, setBlockPlacement, snapToGrid } from './placementCommands';
import { makeBody } from './testFixtures';

const LETTER_WIDTH = 816;
const LETTER_HEIGHT = 1056;

function firstBlock(body: TemplateBody) {
	return body.pages[0]?.blocks[0];
}

describe('setBlockPlacement', () => {
	it('pins a block; its inverse returns it to the flow', () => {
		const original = makeBody();
		const id = firstBlock(original)!.id;
		let inverse!: Command;

		const pinned = produce(original, (draft) => {
			inverse = setBlockPlacement('page-1', id, { x: 80, y: 240, width: 400 }).apply(draft);
		});
		expect(firstBlock(pinned)?.placement).toEqual({ x: 80, y: 240, width: 400 });

		const unpinned = produce(pinned, (draft) => {
			inverse.apply(draft);
		});
		// Deep-equal to the original, not merely "placement is gone": unpinning has
		// to leave the block where it was in `page.blocks`, which is what makes it
		// return to the same spot in the flow rather than to the end.
		expect(unpinned).toEqual(original);
	});

	it('round-trips an unpin, so undo can put a block back exactly where it was pinned', () => {
		const placement = { x: 80, y: 240, width: 400, height: 120 };
		const pinned = produce(makeBody(), (draft) => {
			setBlockPlacement('page-1', firstBlock(draft as unknown as TemplateBody)!.id, placement).apply(draft);
		});
		const id = firstBlock(pinned)!.id;

		let inverse!: Command;
		const unpinned = produce(pinned, (draft) => {
			inverse = setBlockPlacement('page-1', id, undefined).apply(draft);
		});
		expect(firstBlock(unpinned)?.placement).toBeUndefined();

		const repinned = produce(unpinned, (draft) => {
			inverse.apply(draft);
		});
		expect(firstBlock(repinned)?.placement).toEqual(placement);
	});
});

describe('clampPlacement', () => {
	it('keeps a block on the paper without stopping it touching an edge', () => {
		// Flush to an edge is the whole point of a full-bleed band; past the edge is
		// content that isn't in the PDF.
		expect(clampPlacement({ x: 0, y: 0, width: 200 }, LETTER_WIDTH, LETTER_HEIGHT)).toMatchObject({ x: 0, y: 0 });
		expect(clampPlacement({ x: -50, y: -50, width: 200 }, LETTER_WIDTH, LETTER_HEIGHT)).toMatchObject({ x: 0, y: 0 });
		expect(clampPlacement({ x: 9999, y: 0, width: 200 }, LETTER_WIDTH, LETTER_HEIGHT).x).toBe(LETTER_WIDTH - 200);
	});

	it('clamps width before position, so an over-wide box lands at x: 0 rather than a negative x', () => {
		const clamped = clampPlacement({ x: 400, y: 0, width: 5000 }, LETTER_WIDTH, LETTER_HEIGHT);
		expect(clamped.width).toBe(LETTER_WIDTH);
		expect(clamped.x).toBe(0);
	});

	it('refuses to shrink a block below something clickable', () => {
		expect(clampPlacement({ x: 0, y: 0, width: 1 }, LETTER_WIDTH, LETTER_HEIGHT).width).toBe(MIN_PLACED_SIZE);
		expect(clampPlacement({ x: 0, y: 0, width: 100, height: 1 }, LETTER_WIDTH, LETTER_HEIGHT).height).toBe(MIN_PLACED_SIZE);
	});

	it('leaves a content-sized block without a height rather than inventing one', () => {
		expect(clampPlacement({ x: 0, y: 0, width: 100 }, LETTER_WIDTH, LETTER_HEIGHT)).not.toHaveProperty('height');
	});

	it('rounds to whole px — a placement is a number someone will type back in', () => {
		expect(clampPlacement({ x: 80.4, y: 240.6, width: 400.5 }, LETTER_WIDTH, LETTER_HEIGHT)).toMatchObject({ x: 80, y: 241, width: 401 });
	});
});

describe('snapToGrid', () => {
	it('snaps to the grid so separate blocks line up with each other', () => {
		expect(snapToGrid(83, true)).toBe(80);
		expect(snapToGrid(85, true)).toBe(88);
		expect(PLACEMENT_GRID).toBe(8);
	});

	it('gives exact pixels when the author asks for them (Alt)', () => {
		expect(snapToGrid(83, false)).toBe(83);
	});
});

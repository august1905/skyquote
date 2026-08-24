import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { SpacerBlock, TemplateBody } from '../types';
import type { Command } from './types';
import { createSpacerBlock } from './blockTree';
import { MAX_SPACER_HEIGHT, MIN_SPACER_HEIGHT, clampSpacerHeight, setSpacerHeight } from './spacerCommands';
import { makeBody } from './testFixtures';

function makeBodyWithSpacer(height = 24): TemplateBody {
	const spacer: SpacerBlock = { ...createSpacerBlock(height), id: 'spacer-1' };
	// `makeBody`'s settings, its page shape and one spacer in place of its blocks —
	// `makeSettings` is deliberately not exported, and duplicating a TemplateSettings
	// literal here would be one more copy to keep in step with the real defaults.
	const body = makeBody();
	return { ...body, pages: [{ id: 'page-1', name: 'Page 1', order: 0, blocks: [spacer] }] };
}

describe('setSpacerHeight', () => {
	it('replaces the height; its inverse restores the original', () => {
		const original = makeBodyWithSpacer(24);
		let inverse!: Command;

		const afterResize = produce(original, (draft) => {
			inverse = setSpacerHeight('page-1', 'spacer-1', 120).apply(draft);
		});
		expect((afterResize.pages[0]?.blocks[0] as SpacerBlock).height).toBe(120);

		const afterUndo = produce(afterResize, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('clamps what a drag can produce, so a spacer never becomes unselectable or taller than a page', () => {
		// A resize drag reports raw pointer deltas — dragging up past the top of the
		// block would otherwise store a negative height.
		const afterDragUp = produce(makeBodyWithSpacer(24), (draft) => {
			setSpacerHeight('page-1', 'spacer-1', -400).apply(draft);
		});
		expect((afterDragUp.pages[0]?.blocks[0] as SpacerBlock).height).toBe(MIN_SPACER_HEIGHT);

		const afterDragDown = produce(makeBodyWithSpacer(24), (draft) => {
			setSpacerHeight('page-1', 'spacer-1', 99999).apply(draft);
		});
		expect((afterDragDown.pages[0]?.blocks[0] as SpacerBlock).height).toBe(MAX_SPACER_HEIGHT);
	});

	it('refuses a block that is not a spacer rather than silently writing a height onto it', () => {
		const body = makeBodyWithSpacer();
		const withText = produce(body, (draft) => {
			draft.pages[0]!.blocks[0] = { id: 'spacer-1', type: 'page_break', locked: false, style: {} };
		});
		expect(() => produce(withText, (draft) => void setSpacerHeight('page-1', 'spacer-1', 40).apply(draft))).toThrow(/not spacer/);
	});
});

describe('clampSpacerHeight', () => {
	it('rounds to whole px and survives the empty number input', () => {
		expect(clampSpacerHeight(41.6)).toBe(42);
		expect(clampSpacerHeight(Number.NaN)).toBe(MIN_SPACER_HEIGHT);
	});
});

describe('createSpacerBlock', () => {
	it('starts at one comfortable blank line, unstyled and unlocked', () => {
		const spacer = createSpacerBlock();
		expect(spacer).toMatchObject({ type: 'spacer', height: 24, locked: false, style: {} });
	});
});

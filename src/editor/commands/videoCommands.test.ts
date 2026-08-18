import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { VideoBlock } from '../types';
import type { Command } from './types';
import { setVideoAutoplay } from './videoCommands';
import { makeBodyWithVideo } from './testFixtures';

describe('setVideoAutoplay', () => {
	it('toggles autoplay; its inverse restores the original value', () => {
		const original = makeBodyWithVideo();
		expect((original.pages[0]?.blocks[0] as VideoBlock).autoplay).toBe(false);
		let inverse!: Command;

		const afterToggle = produce(original, (draft) => {
			inverse = setVideoAutoplay('page-1', 'video-1', true).apply(draft);
		});
		expect((afterToggle.pages[0]?.blocks[0] as VideoBlock).autoplay).toBe(true);

		const afterUndo = produce(afterToggle, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('type guard', () => {
	it('throws when the target block is not a video', () => {
		const original = makeBodyWithVideo();
		const withText = produce(original, (draft) => {
			draft.pages[0]?.blocks.push({
				id: 'text-1',
				type: 'text',
				locked: false,
				style: {},
				doc: { type: 'doc', content: [] },
			});
		});
		expect(() =>
			produce(withText, (draft) => {
				setVideoAutoplay('page-1', 'text-1', true).apply(draft);
			})
		).toThrow(/is a text block, not video/);
	});
});

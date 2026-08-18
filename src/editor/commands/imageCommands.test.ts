import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ImageBlock } from '../types';
import type { Command } from './types';
import { setImageAlt, setImageShape, setImageSize } from './imageCommands';
import { makeBodyWithImage } from './testFixtures';

describe('setImageSize', () => {
	it('replaces width/height; its inverse restores the originals', () => {
		const original = makeBodyWithImage();
		let inverse!: Command;

		const afterResize = produce(original, (draft) => {
			inverse = setImageSize('page-1', 'image-1', 320, 160).apply(draft);
		});
		const block = afterResize.pages[0]?.blocks[0] as ImageBlock;
		expect(block.width).toBe(320);
		expect(block.height).toBe(160);

		const afterUndo = produce(afterResize, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('setImageAlt', () => {
	it('replaces alt text; its inverse restores the original', () => {
		const original = makeBodyWithImage();
		let inverse!: Command;

		const afterEdit = produce(original, (draft) => {
			inverse = setImageAlt('page-1', 'image-1', 'A headshot').apply(draft);
		});
		expect((afterEdit.pages[0]?.blocks[0] as ImageBlock).alt).toBe('A headshot');

		const afterUndo = produce(afterEdit, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('setImageShape', () => {
	it('toggles rect/circle; its inverse restores the original shape', () => {
		const original = makeBodyWithImage();
		expect((original.pages[0]?.blocks[0] as ImageBlock).shape).toBe('rect');
		let inverse!: Command;

		const afterToggle = produce(original, (draft) => {
			inverse = setImageShape('page-1', 'image-1', 'circle').apply(draft);
		});
		expect((afterToggle.pages[0]?.blocks[0] as ImageBlock).shape).toBe('circle');

		const afterUndo = produce(afterToggle, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('type guard', () => {
	it('throws when the target block is not an image', () => {
		const original = makeBodyWithImage();
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
				setImageAlt('page-1', 'text-1', 'nope').apply(draft);
			})
		).toThrow(/is a text block, not image/);
	});
});

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { TableOfContentsBlock, TemplateBody } from '../types';
import type { Command } from './types';
import { createTocBlock } from './blockTree';
import { setTocLevels } from './tocCommands';
import { makeBody } from './testFixtures';

function bodyWithToc(): TemplateBody {
	const body = makeBody();
	body.pages[0]!.blocks = [createTocBlock()];
	return body;
}

describe('setTocLevels', () => {
	it('changes the heading depth; its inverse restores the original value', () => {
		const original = bodyWithToc();
		const tocId = (original.pages[0]!.blocks[0] as TableOfContentsBlock).id;
		let inverse!: Command;
		const after = produce(original, (draft) => {
			inverse = setTocLevels('page-1', tocId, 3).apply(draft);
		});
		expect((after.pages[0]!.blocks[0] as TableOfContentsBlock).levels).toBe(3);

		const undone = produce(after, (draft) => {
			inverse.apply(draft);
		});
		expect(undone).toEqual(original);
	});

	it('throws when the target block is not a toc block', () => {
		const original = makeBody(); // page-1's block-1 is a text block, not toc
		expect(() =>
			produce(original, (draft) => {
				setTocLevels('page-1', 'block-1', 3).apply(draft);
			})
		).toThrow(/not toc/);
	});
});
